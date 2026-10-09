-- Trip Ledger: schema, row-level security, invite/join functions, receipt storage.
-- Run once in the Supabase SQL editor (or `supabase db push`).
--
-- Isolation model: every row carries a group_id. A signed-in user can only see
-- or change rows whose group_id is a group they are a member of. Composite
-- foreign keys make it impossible to link rows across groups even by mistake.

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
                  split_part(coalesce(new.email, ''), '@', 1)), 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── groups ─────────────────────────
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 80),
  -- The currency everyone settles in. Balances are always computed in this.
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- Membership helpers. SECURITY DEFINER so policies can call them without
-- recursing into group_members' own policies.
create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid())
$$;

create function public.is_owner(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'owner')
$$;

create function public.shares_group_with(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid
  )
$$;

-- ───────────────────────── travelers ─────────────────────────
-- People who appear in splits. They do not need accounts. A traveler may be
-- linked to a member (user_id) so the app knows "which one is me".
create table public.travelers (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  color      text not null default '#2B44FF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  user_id    uuid references public.profiles(id) on delete set null,
  sort_order bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  created_at timestamptz not null default now(),
  unique (id, group_id)
);
create unique index travelers_one_per_member on public.travelers (group_id, user_id) where user_id is not null;
create index travelers_group_idx on public.travelers (group_id);

-- ───────────────────────── expenses ─────────────────────────
create table public.expenses (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  spent_on       date not null,
  spent_at       time,
  vendor         text not null default '' check (char_length(vendor) <= 120),
  location       text not null default '' check (char_length(location) <= 120),
  category       text not null default '' check (char_length(category) <= 60),
  notes          text not null default '' check (char_length(notes) <= 1000),
  -- Amount as paid, in `currency` (may differ from the group currency).
  amount         numeric(18, 4) not null check (amount > 0),
  currency       text not null check (currency ~ '^[A-Z]{3}$'),
  -- What the card statement charged, in the GROUP currency. Null until known.
  settled_amount numeric(18, 4) check (settled_amount > 0),
  payer_id       uuid not null,
  split_mode     text not null check (split_mode in ('equal', 'percent', 'exact', 'shares')),
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, group_id),
  foreign key (payer_id, group_id) references public.travelers (id, group_id)
);
create index expenses_group_idx on public.expenses (group_id, spent_on desc);

create table public.expense_splits (
  expense_id  uuid not null,
  group_id    uuid not null,
  traveler_id uuid not null,
  -- 1 for equal; a percent, an amount in the expense currency, or a share count otherwise.
  value       numeric(18, 4) not null check (value > 0),
  primary key (expense_id, traveler_id),
  foreign key (expense_id, group_id)  references public.expenses (id, group_id)  on delete cascade,
  foreign key (traveler_id, group_id) references public.travelers (id, group_id)
);
create index expense_splits_group_idx on public.expense_splits (group_id);

create table public.receipts (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null,
  group_id   uuid not null,
  path       text not null check (path like group_id::text || '/%'),
  mime       text not null,
  name       text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  foreign key (expense_id, group_id) references public.expenses (id, group_id) on delete cascade
);
create index receipts_group_idx on public.receipts (group_id);

-- ───────────────────────── payments & rates ─────────────────────────
-- A recorded settle-up between two travelers, in the group currency.
create table public.payments (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  from_id    uuid not null,
  to_id      uuid not null,
  amount     numeric(18, 4) not null check (amount > 0),
  paid_on    date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (from_id <> to_id),
  foreign key (from_id, group_id) references public.travelers (id, group_id),
  foreign key (to_id, group_id)   references public.travelers (id, group_id)
);
create index payments_group_idx on public.payments (group_id);

-- Optional estimate: 1 unit of `currency` = `rate` units of the group currency.
-- Only used until a real settled amount is entered.
create table public.group_rates (
  group_id uuid not null references public.groups(id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  rate     numeric(18, 8) not null check (rate > 0),
  primary key (group_id, currency)
);

-- ───────────────────────── triggers ─────────────────────────
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- The group currency is what settled amounts mean, so it is locked once money exists.
create function public.lock_group_currency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.currency is distinct from old.currency and (
       exists (select 1 from public.expenses where group_id = old.id)
    or exists (select 1 from public.payments where group_id = old.id)
  ) then
    raise exception 'The group currency cannot change after expenses or payments exist.';
  end if;
  return new;
end $$;
create trigger groups_lock_currency before update of currency on public.groups
  for each row execute function public.lock_group_currency();

-- Deleting a group removes its expenses and payments first, so the travelers they
-- point at can then be removed by the normal cascade.
create function public.clear_group_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.payments where group_id = old.id;
  delete from public.expenses where group_id = old.id;
  return old;
end $$;
create trigger groups_clear_ledger before delete on public.groups
  for each row execute function public.clear_group_ledger();

-- A removed member's traveler stays (it is on expenses) but is no longer linked.
create function public.unlink_traveler_on_leave() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.travelers set user_id = null where group_id = old.group_id and user_id = old.user_id;
  return old;
end $$;
create trigger group_members_unlink after delete on public.group_members
  for each row execute function public.unlink_traveler_on_leave();

-- A group must keep at least one owner (unless the whole group is being deleted).
create function public.keep_an_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and exists (select 1 from public.groups where id = old.group_id)
     and not exists (select 1 from public.group_members
                     where group_id = old.group_id and role = 'owner' and user_id <> old.user_id) then
    raise exception 'A group needs an owner. Delete the group instead.';
  end if;
  return old;
end $$;
create trigger group_members_keep_owner before delete on public.group_members
  for each row execute function public.keep_an_owner();

-- ───────────────────────── row-level security ─────────────────────────
alter table public.profiles       enable row level security;
alter table public.groups         enable row level security;
alter table public.group_members  enable row level security;
alter table public.travelers      enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_splits enable row level security;
alter table public.receipts       enable row level security;
alter table public.payments       enable row level security;
alter table public.group_rates    enable row level security;

create policy profiles_read   on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy groups_read   on public.groups for select to authenticated using (public.is_member(id));
create policy groups_update on public.groups for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));
create policy groups_delete on public.groups for delete to authenticated using (public.is_owner(id));

create policy members_read   on public.group_members for select to authenticated using (public.is_member(group_id));
create policy members_delete on public.group_members for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(group_id));

create policy travelers_all on public.travelers for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy expenses_all on public.expenses for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy splits_all on public.expense_splits for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy receipts_all on public.receipts for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy payments_all on public.payments for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy rates_all on public.group_rates for all to authenticated
  using (public.is_member(group_id)) with check (public.is_member(group_id));

-- Column-level grants: clients may not write ownership, invite codes, or links.
-- Groups are created and joined only through the functions below.
revoke all on public.profiles, public.groups, public.group_members, public.travelers,
              public.expenses, public.expense_splits, public.receipts, public.payments,
              public.group_rates from anon, authenticated;
grant select on public.profiles, public.groups, public.group_members to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (name, currency) on public.groups to authenticated;
grant delete on public.groups, public.group_members to authenticated;
grant select, delete on public.travelers to authenticated;
grant insert (group_id, name, color, sort_order) on public.travelers to authenticated;
grant update (name, color, sort_order) on public.travelers to authenticated;
grant select, insert, update, delete on public.expenses, public.expense_splits,
      public.receipts, public.payments, public.group_rates to authenticated;

-- ───────────────────────── functions (RPC) ─────────────────────────
create function public.create_group(p_name text, p_currency text, p_my_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  uid uuid := auth.uid();
  nm  text;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  insert into public.groups (name, currency, created_by)
  values (trim(p_name), upper(trim(p_currency)), uid) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'owner');
  nm := coalesce(nullif(trim(p_my_name), ''),
                 (select nullif(display_name, '') from public.profiles where id = uid), 'Me');
  insert into public.travelers (group_id, name, color, user_id) values (gid, left(nm, 40), '#2B44FF', uid);
  return gid;
end $$;

-- What a joiner sees before accepting an invite.
create function public.group_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into g from public.groups where invite_code = lower(trim(p_code));
  if not found then return null; end if;
  return jsonb_build_object(
    'id',             case when public.is_member(g.id) then g.id end,
    'name',           g.name,
    'currency',       g.currency,
    'already_member', public.is_member(g.id),
    'member_count',   (select count(*) from public.group_members where group_id = g.id),
    'travelers',      coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.sort_order)
                                from public.travelers t where t.group_id = g.id and t.user_id is null), '[]'::jsonb)
  );
end $$;

create function public.join_group(p_code text, p_traveler_id uuid default null, p_new_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  g      public.groups;
  uid    uuid := auth.uid();
  nm     text;
  colors text[] := array['#2B44FF','#0E7C61','#C23B22','#8A4FD3','#B07A00','#0B8FA8','#C7366F','#5B6B2E'];
  n      int;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into g from public.groups where invite_code = lower(trim(p_code));
  if not found then raise exception 'That invite link is not valid any more.'; end if;
  if public.is_member(g.id) then return g.id; end if;

  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'member');

  if p_traveler_id is not null then
    update public.travelers set user_id = uid
     where id = p_traveler_id and group_id = g.id and user_id is null;
    if not found then raise exception 'That name was just claimed by someone else. Pick another.'; end if;
  else
    select count(*) into n from public.travelers where group_id = g.id;
    nm := coalesce(nullif(trim(p_new_name), ''),
                   (select nullif(display_name, '') from public.profiles where id = uid), 'Guest');
    insert into public.travelers (group_id, name, color, user_id)
    values (g.id, left(nm, 40), colors[1 + (n % 8)], uid);
  end if;
  return g.id;
end $$;

create function public.rotate_invite_code(p_group uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
begin
  if not public.is_owner(p_group) then raise exception 'Only the group owner can do that.' using errcode = '42501'; end if;
  update public.groups set invite_code = c where id = p_group;
  return c;
end $$;

-- Atomic save of an expense and its split (runs as the caller, so RLS applies).
create function public.save_expense(p_id uuid, p_group uuid, p jsonb, p_splits jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_member(p_group) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;

  insert into public.expenses (id, group_id, spent_on, spent_at, vendor, location, category, notes,
                               amount, currency, settled_amount, payer_id, split_mode)
  values (p_id, p_group, (p ->> 'spent_on')::date, nullif(p ->> 'spent_at', '')::time,
          coalesce(p ->> 'vendor', ''), coalesce(p ->> 'location', ''),
          coalesce(p ->> 'category', ''), coalesce(p ->> 'notes', ''),
          (p ->> 'amount')::numeric, upper(p ->> 'currency'),
          nullif(p ->> 'settled_amount', '')::numeric,
          (p ->> 'payer_id')::uuid, p ->> 'split_mode')
  on conflict (id) do update set
    spent_on = excluded.spent_on, spent_at = excluded.spent_at, vendor = excluded.vendor,
    location = excluded.location, category = excluded.category, notes = excluded.notes,
    amount = excluded.amount, currency = excluded.currency, settled_amount = excluded.settled_amount,
    payer_id = excluded.payer_id, split_mode = excluded.split_mode
    where public.expenses.group_id = p_group;
  if not found then raise exception 'That expense belongs to a different group.'; end if;

  delete from public.expense_splits where expense_id = p_id;
  insert into public.expense_splits (expense_id, group_id, traveler_id, value)
  select p_id, p_group, (s ->> 'traveler_id')::uuid, (s ->> 'value')::numeric
  from jsonb_array_elements(p_splits) s;
  if not exists (select 1 from public.expense_splits where expense_id = p_id) then
    raise exception 'An expense needs at least one person in the split.';
  end if;
  return p_id;
end $$;

revoke all on function public.is_member(uuid), public.is_owner(uuid), public.shares_group_with(uuid),
  public.create_group(text, text, text), public.group_preview(text),
  public.join_group(text, uuid, text), public.rotate_invite_code(uuid),
  public.save_expense(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.is_member(uuid), public.is_owner(uuid), public.shares_group_with(uuid),
  public.create_group(text, text, text), public.group_preview(text),
  public.join_group(text, uuid, text), public.rotate_invite_code(uuid),
  public.save_expense(uuid, uuid, jsonb, jsonb) to authenticated;

-- ───────────────────────── realtime ─────────────────────────
-- Full replica identity lets DELETE events carry group_id, so per-group filters work.
alter table public.expenses       replica identity full;
alter table public.expense_splits replica identity full;
alter table public.receipts       replica identity full;
alter table public.payments       replica identity full;
alter table public.travelers      replica identity full;
alter table public.group_rates    replica identity full;
alter table public.group_members  replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.groups, public.group_members, public.travelers, public.expenses,
      public.expense_splits, public.receipts, public.payments, public.group_rates;
  end if;
end $$;

-- ───────────────────────── receipt storage ─────────────────────────
-- Files live at  <group_id>/<expense_id>/<file>  in a private bucket.
create function public.can_access_receipt(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.is_member(((string_to_array(object_name, '/'))[1])::uuid);
exception when others then
  return false;
end $$;
revoke all on function public.can_access_receipt(text) from public;
grant execute on function public.can_access_receipt(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.can_access_receipt(name));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_access_receipt(name));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.can_access_receipt(name));
