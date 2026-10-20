-- IOU 0018: Checklists. Named lists of items; each item has its own type (to-do, purchase, packing, to-book or a custom one),
-- a status (to do, in progress, completed), an optional due date, an assignee and who completed it.
-- A list is standalone (its own people, joined by invite link) or linked to ONE group (every group member sees it).
-- Items may link to a group expense, an itinerary item and a vault item (group or private).
-- Run AFTER 0001-0017. Safe to run more than once.
--
-- Who may do what
--   see a list ......... its people, and every member of the linked group
--   add an item ........ anyone who can see the list
--   change an item ..... the person who added it, the list owner/co-admins, and (for a group list) the group owner/co-admins
--   tick, take on or assign an item (status, assigned to, completed by) ... anyone who can see the list, through
--       set_checklist_item_progress
--   read-only links .... list owner / co-admins only; notes are left out unless the link says so; amounts, booking codes and
--       links to expenses, vault items and itinerary items are never part of a link.

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.checklists (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(trim(name)) between 1 and 80),
  icon          text check (icon is null or char_length(icon) between 1 and 40),
  color         text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  default_type  text not null default 'todo' check (default_type in ('todo', 'purchase', 'packing', 'booking', 'custom')),
  default_label text not null default '' check (char_length(default_label) <= 40),
  group_id      uuid references public.groups(id) on delete set null,
  invite_code   text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists checklists_group_idx on public.checklists (group_id) where group_id is not null;

create table if not exists public.checklist_members (
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (checklist_id, user_id)
);
create index if not exists checklist_members_user_idx on public.checklist_members (user_id);

create table if not exists public.checklist_items (
  id                uuid primary key default gen_random_uuid(),
  checklist_id      uuid not null references public.checklists(id) on delete cascade,
  type              text not null default 'todo' check (type in ('todo', 'purchase', 'packing', 'booking', 'custom')),
  type_label        text not null default '' check (char_length(type_label) <= 40),
  title             text not null check (char_length(trim(title)) between 1 and 120),
  notes             text not null default '' check (char_length(notes) <= 1000),
  status            text not null default 'todo' check (status in ('todo', 'in_progress', 'completed')),
  due_on            date,
  assigned_name     text not null default '' check (char_length(assigned_name) <= 40),
  assigned_user     uuid references public.profiles(id) on delete set null,
  completed_by_name text not null default '' check (char_length(completed_by_name) <= 40),
  completed_by_user uuid references public.profiles(id) on delete set null,
  completed_at      timestamptz,
  est_amount        numeric(12, 2) check (est_amount is null or est_amount >= 0),
  est_currency      text check (est_currency is null or est_currency ~ '^[A-Z]{3}$'),
  qty               integer not null default 1 check (qty between 1 and 999),
  packed_in         text not null default '' check (char_length(packed_in) <= 60),
  booking_ref       text not null default '' check (char_length(booking_ref) <= 60),
  expense_id        uuid references public.expenses(id) on delete set null,
  itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  vault_item_id     uuid references public.vault_items(id) on delete set null,
  created_by        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (type <> 'custom' or char_length(trim(type_label)) > 0)
);
create index if not exists checklist_items_list_idx on public.checklist_items (checklist_id, due_on);

create table if not exists public.checklist_links (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references public.checklists(id) on delete cascade,
  label         text not null check (char_length(trim(label)) between 1 and 80),
  token         text not null unique check (token ~ '^[0-9a-f]{48}$'),
  include_notes boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz
);

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.ck_can_see(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.checklists c where c.id = cid and (
           exists (select 1 from public.checklist_members m where m.checklist_id = c.id and m.user_id = auth.uid())
           or (c.group_id is not null and public.is_member(c.group_id))))
$$;
create or replace function public.ck_is_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.checklists c where c.id = cid and (
           exists (select 1 from public.checklist_members m where m.checklist_id = c.id and m.user_id = auth.uid() and m.role in ('owner', 'admin'))
           or (c.group_id is not null and public.is_owner(c.group_id))))
$$;
create or replace function public.ck_is_owner(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.checklist_members where checklist_id = cid and user_id = auth.uid() and role = 'owner')
$$;
create or replace function public.ck_can_modify_item(xid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.checklist_items i
                 where i.id = xid and public.ck_can_see(i.checklist_id) and (i.created_by = auth.uid() or public.ck_is_admin(i.checklist_id)))
$$;
-- Is this person someone who sees the list? Used so an assignee or "completed by" is a real participant.
create or replace function public.ck_person_in(cid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.checklists c where c.id = cid and (
           exists (select 1 from public.checklist_members m where m.checklist_id = c.id and m.user_id = uid)
           or (c.group_id is not null and exists (select 1 from public.group_members g where g.group_id = c.group_id and g.user_id = uid))))
$$;
revoke all on function public.ck_can_see(uuid), public.ck_is_admin(uuid), public.ck_is_owner(uuid), public.ck_can_modify_item(uuid), public.ck_person_in(uuid, uuid) from public;
grant execute on function public.ck_can_see(uuid), public.ck_is_admin(uuid), public.ck_is_owner(uuid), public.ck_can_modify_item(uuid), public.ck_person_in(uuid, uuid) to authenticated;

-- Completion bookkeeping, and the rules for links and people.
create or replace function public.checklist_item_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from public.checklists where id = new.checklist_id;
  if tg_op = 'UPDATE' then new.updated_at = now(); end if;

  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then new.completed_at = now(); end if;
  else
    new.completed_at = null; new.completed_by_name = ''; new.completed_by_user = null;
  end if;

  if new.assigned_user is not null and (tg_op = 'INSERT' or new.assigned_user is distinct from old.assigned_user)
     and not public.ck_person_in(new.checklist_id, new.assigned_user) then
    raise exception 'That person is not on this list.';
  end if;
  if new.completed_by_user is not null and (tg_op = 'INSERT' or new.completed_by_user is distinct from old.completed_by_user)
     and not public.ck_person_in(new.checklist_id, new.completed_by_user) then
    raise exception 'That person is not on this list.';
  end if;

  if new.expense_id is not null and (tg_op = 'INSERT' or new.expense_id is distinct from old.expense_id)
     and not exists (select 1 from public.expenses e where e.id = new.expense_id and e.group_id = gid and public.is_member(e.group_id)) then
    raise exception 'That expense is not in this list''s group.' using errcode = '42501';
  end if;
  if new.itinerary_item_id is not null and (tg_op = 'INSERT' or new.itinerary_item_id is distinct from old.itinerary_item_id)
     and not public.it_can_see_item(new.itinerary_item_id) then
    raise exception 'That itinerary item is not available to you.' using errcode = '42501';
  end if;
  if new.vault_item_id is not null and (tg_op = 'INSERT' or new.vault_item_id is distinct from old.vault_item_id)
     and not public.v_can_see_item(new.vault_item_id) then
    raise exception 'That vault item is not available to you.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists checklist_items_guard on public.checklist_items;
create trigger checklist_items_guard before insert or update on public.checklist_items for each row execute function public.checklist_item_guard();

-- ───────────────────────── row-level security ─────────────────────────
alter table public.checklists         enable row level security;
alter table public.checklist_members  enable row level security;
alter table public.checklist_items    enable row level security;
alter table public.checklist_links    enable row level security;
revoke all on public.checklists, public.checklist_members, public.checklist_items, public.checklist_links from anon, authenticated;

grant select on public.checklists, public.checklist_members to authenticated;
grant update (name, icon, color, default_type, default_label) on public.checklists to authenticated;
grant delete on public.checklists, public.checklist_members to authenticated;
grant select, insert, delete on public.checklist_items to authenticated;
grant update (type, type_label, title, notes, due_on, est_amount, est_currency, qty, packed_in, booking_ref,
              expense_id, itinerary_item_id, vault_item_id) on public.checklist_items to authenticated;
grant select, delete on public.checklist_links to authenticated;

drop policy if exists checklists_read on public.checklists;
create policy checklists_read on public.checklists for select to authenticated using (public.ck_can_see(id));
drop policy if exists checklists_update on public.checklists;
create policy checklists_update on public.checklists for update to authenticated using (public.ck_is_admin(id)) with check (public.ck_is_admin(id));
drop policy if exists checklists_delete on public.checklists;
create policy checklists_delete on public.checklists for delete to authenticated using (public.ck_is_owner(id));

drop policy if exists checklist_members_read on public.checklist_members;
create policy checklist_members_read on public.checklist_members for select to authenticated using (public.ck_can_see(checklist_id));
drop policy if exists checklist_members_delete on public.checklist_members;
create policy checklist_members_delete on public.checklist_members for delete to authenticated
  using (user_id = auth.uid() or (public.ck_is_admin(checklist_id) and role <> 'owner'));

drop policy if exists checklist_items_read on public.checklist_items;
create policy checklist_items_read on public.checklist_items for select to authenticated using (public.ck_can_see(checklist_id));
drop policy if exists checklist_items_insert on public.checklist_items;
create policy checklist_items_insert on public.checklist_items for insert to authenticated
  with check (public.ck_can_see(checklist_id) and created_by = auth.uid());
drop policy if exists checklist_items_update on public.checklist_items;
create policy checklist_items_update on public.checklist_items for update to authenticated
  using (public.ck_can_modify_item(id)) with check (public.ck_can_modify_item(id));
drop policy if exists checklist_items_delete on public.checklist_items;
create policy checklist_items_delete on public.checklist_items for delete to authenticated using (public.ck_can_modify_item(id));

drop policy if exists checklist_links_read on public.checklist_links;
create policy checklist_links_read on public.checklist_links for select to authenticated using (public.ck_is_admin(checklist_id));
drop policy if exists checklist_links_delete on public.checklist_links;
create policy checklist_links_delete on public.checklist_links for delete to authenticated using (public.ck_is_admin(checklist_id));

-- ───────────────────────── creating, linking, joining, roles ─────────────────────────
create or replace function public.create_checklist(p_name text, p_icon text default null, p_color text default null,
                                                   p_default_type text default 'todo', p_default_label text default '', p_group uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the list a name.'; end if;
  if p_group is not null and not public.is_member(p_group) then raise exception 'You are not in that group.' using errcode = '42501'; end if;
  insert into public.checklists (name, icon, color, default_type, default_label, group_id)
  values (left(trim(p_name), 80), p_icon, p_color, coalesce(p_default_type, 'todo'), left(coalesce(p_default_label, ''), 40), p_group) returning id into cid;
  insert into public.checklist_members (checklist_id, user_id, role) values (cid, auth.uid(), 'owner');
  return cid;
end $$;

create or replace function public.link_checklist_group(p_cl uuid, p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ck_is_admin(p_cl) then raise exception 'Only the list owner or a co-admin can do this.' using errcode = '42501'; end if;
  if not public.is_member(p_group) then raise exception 'You are not in that group.' using errcode = '42501'; end if;
  update public.checklists set group_id = p_group where id = p_cl;
end $$;
create or replace function public.unlink_checklist_group(p_cl uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ck_is_admin(p_cl) then raise exception 'Only the list owner or a co-admin can do this.' using errcode = '42501'; end if;
  update public.checklists set group_id = null where id = p_cl;
end $$;

create or replace function public.join_checklist(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select id into cid from public.checklists where invite_code = p_code;
  if cid is null then raise exception 'That invite link is not valid.'; end if;
  insert into public.checklist_members (checklist_id, user_id, role) values (cid, auth.uid(), 'member') on conflict do nothing;
  return cid;
end $$;

create or replace function public.set_checklist_role(p_cl uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ck_is_owner(p_cl) then raise exception 'Only the list owner can change roles.' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Choose co-admin or member.'; end if;
  update public.checklist_members set role = p_role where checklist_id = p_cl and user_id = p_user and role <> 'owner';
end $$;

create or replace function public.checklist_people(p_cl uuid) returns table (user_id uuid, role text, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ck_can_see(p_cl) then raise exception 'You cannot see this list.' using errcode = '42501'; end if;
  return query select m.user_id, m.role, coalesce(nullif(p.display_name, ''), 'Someone')
               from public.checklist_members m left join public.profiles p on p.id = m.user_id
               where m.checklist_id = p_cl order by (m.role = 'owner') desc, p.display_name;
end $$;

-- Status, assignee and completion: open to everyone who can see the list.
create or replace function public.set_checklist_item_progress(p_item uuid, p_status text, p_assigned_name text default '', p_assigned_user uuid default null,
                                                              p_completed_by_name text default '', p_completed_by_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select checklist_id into cid from public.checklist_items where id = p_item;
  if cid is null or not public.ck_can_see(cid) then raise exception 'You cannot change this item.' using errcode = '42501'; end if;
  if p_status not in ('todo', 'in_progress', 'completed') then raise exception 'Unknown status.'; end if;
  update public.checklist_items set status = p_status,
         assigned_name = left(coalesce(p_assigned_name, ''), 40), assigned_user = p_assigned_user,
         completed_by_name = left(coalesce(p_completed_by_name, ''), 40), completed_by_user = p_completed_by_user
   where id = p_item;
end $$;

-- ───────────────────────── read-only links ─────────────────────────
create or replace function public.create_checklist_link(p_cl uuid, p_label text, p_include_notes boolean default false, p_expires_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not public.ck_is_admin(p_cl) then raise exception 'Only the list owner or a co-admin can create read-only links.' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_label, ''))) = 0 then raise exception 'Give the link a name.'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'The expiry must be in the future.'; end if;
  if (select count(*) from public.checklist_links where checklist_id = p_cl) >= 50 then raise exception 'This list already has 50 links. Turn some off first.'; end if;
  tok := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48);
  insert into public.checklist_links (checklist_id, label, token, include_notes, created_by, expires_at)
  values (p_cl, left(trim(p_label), 80), tok, coalesce(p_include_notes, false), auth.uid(), p_expires_at);
  return tok;
end $$;

-- The one anonymous entry point. Unknown, malformed and expired tokens return null.
create or replace function public.get_shared_checklist(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.checklist_links; c public.checklists; res jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.checklist_links where token = p_token and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select * into c from public.checklists where id = l.checklist_id;
  select jsonb_build_object(
    'checklist', jsonb_build_object('name', c.name, 'icon', c.icon, 'color', c.color),
    'label', l.label, 'include_notes', l.include_notes,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'type', i.type, 'type_label', i.type_label, 'title', i.title,
        'notes', case when l.include_notes then i.notes else '' end,
        'status', i.status, 'due_on', i.due_on, 'assigned_name', i.assigned_name,
        'completed_by_name', i.completed_by_name, 'completed_at', i.completed_at,
        'qty', i.qty, 'packed_in', i.packed_in)
        order by i.due_on nulls last, i.created_at)
      from public.checklist_items i where i.checklist_id = l.checklist_id), '[]'::jsonb)
  ) into res;
  return res;
end $$;

revoke all on function public.create_checklist(text, text, text, text, text, uuid), public.link_checklist_group(uuid, uuid), public.unlink_checklist_group(uuid),
  public.join_checklist(text), public.set_checklist_role(uuid, uuid, text), public.checklist_people(uuid),
  public.set_checklist_item_progress(uuid, text, text, uuid, text, uuid), public.create_checklist_link(uuid, text, boolean, timestamptz),
  public.get_shared_checklist(text) from public;
grant execute on function public.create_checklist(text, text, text, text, text, uuid), public.link_checklist_group(uuid, uuid), public.unlink_checklist_group(uuid),
  public.join_checklist(text), public.set_checklist_role(uuid, uuid, text), public.checklist_people(uuid),
  public.set_checklist_item_progress(uuid, text, text, uuid, text, uuid), public.create_checklist_link(uuid, text, boolean, timestamptz) to authenticated;
grant execute on function public.get_shared_checklist(text) to anon, authenticated;

notify pgrst, 'reload schema';
