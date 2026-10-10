-- Trip Ledger 0002: read-only "balance links" for travelers who do not have accounts.
-- Run AFTER 0001_init.sql.
--
-- A member creates a link for one traveler (or several, e.g. a couple). Anyone holding
-- the link can open a read-only page with that person's balance. There are no other
-- access paths: the anonymous role gets NO table privileges, only the one function below,
-- which answers a single question: "what does this exact secret token show?".

-- ───────────────────────── tables ─────────────────────────
create table public.share_links (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  label          text not null check (char_length(trim(label)) between 1 and 80),
  -- 48 hex characters (~180 bits of randomness). Unguessable; revoke by deleting the row.
  token          text not null unique check (token ~ '^[0-9a-f]{48}$'),
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz,
  last_viewed_at timestamptz,
  view_count     integer not null default 0,
  unique (id, group_id)
);
create index share_links_group_idx on public.share_links (group_id);

-- Which traveler(s) a link speaks for. Composite FKs keep links inside their own group.
create table public.share_link_travelers (
  link_id     uuid not null,
  traveler_id uuid not null,
  group_id    uuid not null,
  primary key (link_id, traveler_id),
  foreign key (link_id, group_id)     references public.share_links (id, group_id)  on delete cascade,
  foreign key (traveler_id, group_id) references public.travelers (id, group_id)    on delete cascade
);

alter table public.share_links          enable row level security;
alter table public.share_link_travelers enable row level security;

create policy share_links_read on public.share_links for select to authenticated using (public.is_member(group_id));
create policy share_links_delete on public.share_links for delete to authenticated using (public.is_member(group_id));
create policy share_link_travelers_read on public.share_link_travelers for select to authenticated using (public.is_member(group_id));

-- Clients may list and delete (turn off) links; links are created only through create_share_link().
revoke all on public.share_links, public.share_link_travelers from anon, authenticated;
grant select, delete on public.share_links to authenticated;
grant select on public.share_link_travelers to authenticated;

-- ───────────────────────── create ─────────────────────────
create function public.create_share_link(
  p_group uuid, p_label text, p_traveler_ids uuid[], p_expires_at timestamptz default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  tok text;
  lid uuid;
  ids uuid[];
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not public.is_member(p_group) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_label, ''))) = 0 then raise exception 'Give the link a name.'; end if;

  select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(p_traveler_ids, '{}')) x;
  if cardinality(ids) = 0 then raise exception 'Choose at least one traveler.'; end if;
  if (select count(*) from public.travelers where group_id = p_group and id = any(ids)) <> cardinality(ids) then
    raise exception 'Those travelers are not on this trip.';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'The expiry must be in the future.'; end if;
  if (select count(*) from public.share_links where group_id = p_group) >= 50 then
    raise exception 'This trip already has 50 balance links. Turn some off first.';
  end if;

  tok := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48);
  insert into public.share_links (group_id, label, token, created_by, expires_at)
  values (p_group, left(trim(p_label), 80), tok, auth.uid(), p_expires_at)
  returning id into lid;
  insert into public.share_link_travelers (link_id, traveler_id, group_id)
  select lid, x, p_group from unnest(ids) x;
  return tok;
end $$;

-- ───────────────────────── read (the ONLY anonymous entry point) ─────────────────────────
-- Returns the data needed to compute a balance, and deliberately nothing else:
-- no notes, no receipts, no account emails or ids, no invite code.
-- Unknown, malformed, expired and turned-off tokens all return the same thing (null).
create function public.get_shared_trip(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.share_links;
  g public.groups;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.share_links where token = p_token and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select * into g from public.groups where id = l.group_id;

  -- Count a visit at most once a minute so refreshing cannot hammer the database.
  if l.last_viewed_at is null or l.last_viewed_at < now() - interval '1 minute' then
    update public.share_links set last_viewed_at = now(), view_count = view_count + 1 where id = l.id;
  end if;

  return jsonb_build_object(
    'label', l.label,
    'group', jsonb_build_object('name', g.name, 'currency', g.currency),
    'linked', coalesce((select jsonb_agg(s.traveler_id) from public.share_link_travelers s where s.link_id = l.id), '[]'::jsonb),
    'travelers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.sort_order)
                           from public.travelers t where t.group_id = l.group_id), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'spent_on', e.spent_on, 'spent_at', e.spent_at, 'vendor', e.vendor, 'location', e.location,
        'category', e.category, 'amount', e.amount, 'currency', e.currency, 'settled_amount', e.settled_amount,
        'payer_id', e.payer_id, 'split_mode', e.split_mode,
        'splits', coalesce((select jsonb_agg(jsonb_build_object('traveler_id', s.traveler_id, 'value', s.value))
                            from public.expense_splits s where s.expense_id = e.id), '[]'::jsonb)))
      from public.expenses e where e.group_id = l.group_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'from_id', p.from_id, 'to_id', p.to_id, 'amount', p.amount, 'paid_on', p.paid_on))
                          from public.payments p where p.group_id = l.group_id), '[]'::jsonb),
    'rates', coalesce((select jsonb_object_agg(r.currency, r.rate) from public.group_rates r where r.group_id = l.group_id), '{}'::jsonb),
    'generated_at', now()
  );
end $$;

-- ───────────────────────── privileges ─────────────────────────
-- Supabase grants new functions to anon/authenticated by default; be explicit instead.
-- (This also tightens the 0001 functions: they already refuse anonymous callers internally,
--  but they should not be callable by anon at all.)
revoke execute on function
  public.is_member(uuid), public.is_owner(uuid), public.shares_group_with(uuid),
  public.create_group(text, text, text), public.group_preview(text),
  public.join_group(text, uuid, text), public.rotate_invite_code(uuid),
  public.save_expense(uuid, uuid, jsonb, jsonb), public.can_access_receipt(text)
from public, anon;

revoke all on function public.create_share_link(uuid, text, uuid[], timestamptz) from public, anon;
grant execute on function public.create_share_link(uuid, text, uuid[], timestamptz) to authenticated;

revoke all on function public.get_shared_trip(text) from public;
grant execute on function public.get_shared_trip(text) to anon, authenticated;
