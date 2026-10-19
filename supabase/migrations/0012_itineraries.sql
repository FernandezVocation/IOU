-- IOU 0012: Itineraries. A timeline of plans (transport, stays, food, attractions, activities, shopping, work, custom)
-- with dates and times, places, people, vendor and notes. It has its own people and roles (same three as groups and
-- vaults), may optionally be linked to ONE group and ONE vault (or neither), and items may link to vault items.
-- Run AFTER 0001-0011. Safe to run more than once.
--
-- Roles (itinerary_members.role):  owner (the creator) · admin (co-admin) · member.
--   Everyone in an itinerary may add items. Members change or delete only items they added; owner and co-admins
--   change any item they can see.
-- Only-me items (itinerary_items.private) are seen and changed by the person who added them and nobody else, not even the
-- owner. They never appear in read-only links.
-- Read-only links: scope 'itinerary' (everything not private) or 'items' (only those picked). Notes are left out unless the
-- link says include_notes. Vault files are never part of a link.

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.itineraries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 80),
  icon        text check (icon is null or char_length(icon) between 1 and 40),
  color       text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  group_id    uuid references public.groups(id) on delete set null,
  vault_id    uuid references public.vaults(id) on delete set null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists itineraries_group_idx on public.itineraries (group_id) where group_id is not null;

create table if not exists public.itinerary_members (
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (itinerary_id, user_id)
);
create index if not exists itinerary_members_user_idx on public.itinerary_members (user_id);

create or replace function public.itin_people_ok(p text[]) returns boolean
language sql immutable as $$
  select cardinality(p) <= 30 and coalesce((select bool_and(char_length(trim(x)) between 1 and 40) from unnest(p) x), true)
$$;

create table if not exists public.itinerary_items (
  id             uuid primary key default gen_random_uuid(),
  itinerary_id   uuid not null references public.itineraries(id) on delete cascade,
  category       text not null default 'custom' check (category in ('transport', 'stay', 'food', 'attractions', 'activities', 'shopping', 'work', 'custom')),
  category_label text not null default '' check (char_length(category_label) <= 40),   -- the name of a custom category
  subtype        text not null default '' check (char_length(subtype) <= 40),          -- train, hotel, museum… or anything typed
  title          text not null check (char_length(trim(title)) between 1 and 120),
  description    text not null default '' check (char_length(description) <= 200),
  vendor         text not null default '' check (char_length(vendor) <= 80),
  -- Dates and times are local to the place, exactly as written. No time zone is applied.
  starts_on      date,
  starts_at      time,
  ends_on        date,
  ends_at        time,
  place          text not null default '' check (char_length(place) <= 80),
  address        text not null default '' check (char_length(address) <= 200),
  from_place     text not null default '' check (char_length(from_place) <= 80),
  to_place       text not null default '' check (char_length(to_place) <= 80),
  website        text not null default '' check (char_length(website) <= 300),
  notes          text not null default '' check (char_length(notes) <= 2000),
  people         text[] not null default '{}' check (public.itin_people_ok(people)),
  private        boolean not null default false,
  vault_item_id  uuid references public.vault_items(id) on delete set null,
  created_by     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, itinerary_id)
);
create index if not exists itinerary_items_it_idx on public.itinerary_items (itinerary_id, starts_on);
create index if not exists itinerary_items_vault_idx on public.itinerary_items (vault_item_id) where vault_item_id is not null;

create table if not exists public.itinerary_links (
  id            uuid primary key default gen_random_uuid(),
  itinerary_id  uuid not null references public.itineraries(id) on delete cascade,
  label         text not null check (char_length(trim(label)) between 1 and 80),
  token         text not null unique check (token ~ '^[0-9a-f]{48}$'),
  scope         text not null check (scope in ('itinerary', 'items')),
  include_notes boolean not null default false,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  unique (id, itinerary_id)
);
create table if not exists public.itinerary_link_items (
  link_id      uuid not null,
  item_id      uuid not null,
  itinerary_id uuid not null,
  primary key (link_id, item_id),
  foreign key (link_id, itinerary_id) references public.itinerary_links (id, itinerary_id) on delete cascade,
  foreign key (item_id, itinerary_id) references public.itinerary_items (id, itinerary_id) on delete cascade
);

create or replace function public.touch_itinerary_item() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists itinerary_items_touch on public.itinerary_items;
create trigger itinerary_items_touch before update on public.itinerary_items for each row execute function public.touch_itinerary_item();

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.it_is_member(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.itinerary_members where itinerary_id = iid and user_id = auth.uid())
$$;
create or replace function public.it_is_admin(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.itinerary_members where itinerary_id = iid and user_id = auth.uid() and role in ('owner', 'admin'))
$$;
create or replace function public.it_is_owner(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.itinerary_members where itinerary_id = iid and user_id = auth.uid() and role = 'owner')
$$;
create or replace function public.it_can_see_item(xid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.itinerary_items i
                 where i.id = xid and public.it_is_member(i.itinerary_id) and (not i.private or i.created_by = auth.uid()))
$$;
create or replace function public.it_can_modify_item(xid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.itinerary_items i
                 where i.id = xid and public.it_is_member(i.itinerary_id) and (not i.private or i.created_by = auth.uid())
                   and (i.created_by = auth.uid() or public.it_is_admin(i.itinerary_id)))
$$;
revoke all on function public.it_is_member(uuid), public.it_is_admin(uuid), public.it_is_owner(uuid), public.it_can_see_item(uuid), public.it_can_modify_item(uuid) from public;
grant execute on function public.it_is_member(uuid), public.it_is_admin(uuid), public.it_is_owner(uuid), public.it_can_see_item(uuid), public.it_can_modify_item(uuid) to authenticated;

-- An item may only be newly linked to a vault item the caller can see. An existing link is left alone when
-- someone else edits the item.
create or replace function public.check_itinerary_item_link() returns trigger language plpgsql as $$
begin
  if new.vault_item_id is not null and (tg_op = 'INSERT' or new.vault_item_id is distinct from old.vault_item_id)
     and not public.v_can_see_item(new.vault_item_id) then
    raise exception 'That vault item is not available to you.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists itinerary_items_link_check on public.itinerary_items;
create trigger itinerary_items_link_check before insert or update on public.itinerary_items for each row execute function public.check_itinerary_item_link();

-- ───────────────────────── row-level security ─────────────────────────
alter table public.itineraries           enable row level security;
alter table public.itinerary_members     enable row level security;
alter table public.itinerary_items       enable row level security;
alter table public.itinerary_links       enable row level security;
alter table public.itinerary_link_items  enable row level security;

revoke all on public.itineraries, public.itinerary_members, public.itinerary_items,
              public.itinerary_links, public.itinerary_link_items from anon, authenticated;
grant select on public.itineraries, public.itinerary_members to authenticated;
grant update (name, icon, color) on public.itineraries to authenticated;
grant delete on public.itineraries, public.itinerary_members to authenticated;
grant select, delete on public.itinerary_links, public.itinerary_link_items to authenticated;
grant select, insert on public.itinerary_items to authenticated;
grant update (category, category_label, subtype, title, description, vendor, starts_on, starts_at, ends_on, ends_at, place, address,
              from_place, to_place, website, notes, people, private, vault_item_id) on public.itinerary_items to authenticated;
grant delete on public.itinerary_items to authenticated;

drop policy if exists itineraries_read on public.itineraries;
create policy itineraries_read on public.itineraries for select to authenticated using (public.it_is_member(id));
drop policy if exists itineraries_update on public.itineraries;
create policy itineraries_update on public.itineraries for update to authenticated using (public.it_is_admin(id)) with check (public.it_is_admin(id));
drop policy if exists itineraries_delete on public.itineraries;
create policy itineraries_delete on public.itineraries for delete to authenticated using (public.it_is_owner(id));

drop policy if exists itinerary_members_read on public.itinerary_members;
create policy itinerary_members_read on public.itinerary_members for select to authenticated using (public.it_is_member(itinerary_id));
drop policy if exists itinerary_members_delete on public.itinerary_members;
create policy itinerary_members_delete on public.itinerary_members for delete to authenticated
  using (user_id = auth.uid() or (public.it_is_admin(itinerary_id) and role <> 'owner'));

drop policy if exists itinerary_items_read on public.itinerary_items;
create policy itinerary_items_read on public.itinerary_items for select to authenticated
  using (public.it_is_member(itinerary_id) and (not private or created_by = auth.uid()));
drop policy if exists itinerary_items_insert on public.itinerary_items;
create policy itinerary_items_insert on public.itinerary_items for insert to authenticated
  with check (public.it_is_member(itinerary_id) and created_by = auth.uid());
drop policy if exists itinerary_items_update on public.itinerary_items;
create policy itinerary_items_update on public.itinerary_items for update to authenticated
  using (public.it_can_modify_item(id)) with check (public.it_can_modify_item(id));
drop policy if exists itinerary_items_delete on public.itinerary_items;
create policy itinerary_items_delete on public.itinerary_items for delete to authenticated using (public.it_can_modify_item(id));

-- Links hold secrets, so only owner and co-admins see or remove them.
drop policy if exists itinerary_links_read on public.itinerary_links;
create policy itinerary_links_read on public.itinerary_links for select to authenticated using (public.it_is_admin(itinerary_id));
drop policy if exists itinerary_links_delete on public.itinerary_links;
create policy itinerary_links_delete on public.itinerary_links for delete to authenticated using (public.it_is_admin(itinerary_id));
drop policy if exists itinerary_link_items_read on public.itinerary_link_items;
create policy itinerary_link_items_read on public.itinerary_link_items for select to authenticated using (public.it_is_admin(itinerary_id));

-- ───────────────────────── creating, linking, joining, roles ─────────────────────────
-- Optionally links the new itinerary to a group the caller owns/co-administers (and adds that group's members) and to a
-- vault the caller is in. Several itineraries may share a group or a vault.
create or replace function public.create_itinerary(p_name text, p_icon text default null, p_color text default null,
                                                   p_group uuid default null, p_vault uuid default null, p_add_members boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the itinerary a name.'; end if;
  if p_group is not null and not public.is_owner(p_group) then
    raise exception 'Only the group owner or a co-admin can link an itinerary.' using errcode = '42501';
  end if;
  if p_vault is not null and not public.v_is_member(p_vault) then
    raise exception 'You are not in that vault.' using errcode = '42501';
  end if;
  insert into public.itineraries (name, icon, color, group_id, vault_id) values (left(trim(p_name), 80), p_icon, p_color, p_group, p_vault) returning id into iid;
  insert into public.itinerary_members (itinerary_id, user_id, role) values (iid, auth.uid(), 'owner');
  if p_group is not null and p_add_members then
    insert into public.itinerary_members (itinerary_id, user_id, role)
    select iid, user_id, 'member' from public.group_members where group_id = p_group and user_id <> auth.uid()
    on conflict do nothing;
  end if;
  return iid;
end $$;

create or replace function public.link_itinerary_group(p_it uuid, p_group uuid, p_add_members boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.it_is_admin(p_it) then raise exception 'Only the itinerary owner or a co-admin can do this.' using errcode = '42501'; end if;
  if not public.is_owner(p_group) then raise exception 'Only the group owner or a co-admin can link an itinerary.' using errcode = '42501'; end if;
  update public.itineraries set group_id = p_group where id = p_it;
  if p_add_members then
    insert into public.itinerary_members (itinerary_id, user_id, role)
    select p_it, user_id, 'member' from public.group_members where group_id = p_group
    on conflict do nothing;
  end if;
end $$;

create or replace function public.unlink_itinerary_group(p_it uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.it_is_admin(p_it) then raise exception 'Only the itinerary owner or a co-admin can do this.' using errcode = '42501'; end if;
  update public.itineraries set group_id = null where id = p_it;
end $$;

create or replace function public.link_itinerary_vault(p_it uuid, p_vault uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.it_is_admin(p_it) then raise exception 'Only the itinerary owner or a co-admin can do this.' using errcode = '42501'; end if;
  if not public.v_is_member(p_vault) then raise exception 'You are not in that vault.' using errcode = '42501'; end if;
  update public.itineraries set vault_id = p_vault where id = p_it;
end $$;

create or replace function public.unlink_itinerary_vault(p_it uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.it_is_admin(p_it) then raise exception 'Only the itinerary owner or a co-admin can do this.' using errcode = '42501'; end if;
  update public.itineraries set vault_id = null where id = p_it;
end $$;

create or replace function public.join_itinerary(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select id into iid from public.itineraries where invite_code = p_code;
  if iid is null then raise exception 'That invite link is not valid.'; end if;
  insert into public.itinerary_members (itinerary_id, user_id, role) values (iid, auth.uid(), 'member') on conflict do nothing;
  return iid;
end $$;

create or replace function public.set_itinerary_role(p_it uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.it_is_owner(p_it) then raise exception 'Only the itinerary owner can change roles.' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Choose co-admin or member.'; end if;
  update public.itinerary_members set role = p_role where itinerary_id = p_it and user_id = p_user and role <> 'owner';
end $$;

-- Names of an itinerary's people (profiles are only readable between people who share a group).
create or replace function public.itinerary_people(p_it uuid) returns table (user_id uuid, role text, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.it_is_member(p_it) then raise exception 'You are not in this itinerary.' using errcode = '42501'; end if;
  return query select m.user_id, m.role, coalesce(nullif(p.display_name, ''), 'Someone')
               from public.itinerary_members m left join public.profiles p on p.id = m.user_id
               where m.itinerary_id = p_it order by (m.role = 'owner') desc, p.display_name;
end $$;

-- ───────────────────────── read-only links ─────────────────────────
create or replace function public.create_itinerary_link(p_it uuid, p_label text, p_scope text, p_item_ids uuid[] default '{}',
                                                        p_include_notes boolean default false, p_expires_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare tok text; lid uuid; ids uuid[];
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not public.it_is_admin(p_it) then raise exception 'Only the itinerary owner or a co-admin can create read-only links.' using errcode = '42501'; end if;
  if p_scope not in ('itinerary', 'items') then raise exception 'Choose the whole itinerary or specific items.'; end if;
  if char_length(trim(coalesce(p_label, ''))) = 0 then raise exception 'Give the link a name.'; end if;
  select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(p_item_ids, '{}')) x;
  if p_scope = 'itinerary' then ids := '{}'; end if;
  if p_scope = 'items' then
    if cardinality(ids) = 0 then raise exception 'Choose at least one item.'; end if;
    if (select count(*) from public.itinerary_items where itinerary_id = p_it and id = any(ids) and not private) <> cardinality(ids) then
      raise exception 'Those items cannot be shared. Only-me items are never shared.';
    end if;
  end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'The expiry must be in the future.'; end if;
  if (select count(*) from public.itinerary_links where itinerary_id = p_it) >= 50 then raise exception 'This itinerary already has 50 links. Turn some off first.'; end if;
  tok := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48);
  insert into public.itinerary_links (itinerary_id, label, token, scope, include_notes, created_by, expires_at)
  values (p_it, left(trim(p_label), 80), tok, p_scope, coalesce(p_include_notes, false), auth.uid(), p_expires_at) returning id into lid;
  insert into public.itinerary_link_items (link_id, item_id, itinerary_id) select lid, x, p_it from unnest(ids) x;
  return tok;
end $$;

-- The one anonymous entry point. Unknown, malformed, expired and turned-off tokens all return null.
-- No vault ids, files, account details or amounts are ever returned; has_ticket only says that a vault item is linked.
create or replace function public.get_shared_itinerary(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.itinerary_links; it public.itineraries; res jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.itinerary_links where token = p_token and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select * into it from public.itineraries where id = l.itinerary_id;
  select jsonb_build_object(
    'itinerary', jsonb_build_object('name', it.name, 'icon', it.icon, 'color', it.color),
    'label', l.label,
    'include_notes', l.include_notes,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'category', i.category, 'category_label', i.category_label, 'subtype', i.subtype,
        'title', i.title, 'description', i.description, 'vendor', i.vendor,
        'starts_on', i.starts_on, 'starts_at', i.starts_at, 'ends_on', i.ends_on, 'ends_at', i.ends_at,
        'place', i.place, 'address', i.address, 'from_place', i.from_place, 'to_place', i.to_place, 'website', i.website,
        'notes', case when l.include_notes then i.notes else '' end,
        'people', to_jsonb(i.people), 'has_ticket', i.vault_item_id is not null)
        order by i.starts_on nulls last, i.starts_at nulls last, i.title)
      from public.itinerary_items i
      where i.itinerary_id = l.itinerary_id and not i.private
        and (l.scope = 'itinerary' or exists (select 1 from public.itinerary_link_items li where li.link_id = l.id and li.item_id = i.id))
    ), '[]'::jsonb)
  ) into res;
  return res;
end $$;

revoke all on function public.create_itinerary(text, text, text, uuid, uuid, boolean), public.link_itinerary_group(uuid, uuid, boolean),
  public.unlink_itinerary_group(uuid), public.link_itinerary_vault(uuid, uuid), public.unlink_itinerary_vault(uuid),
  public.join_itinerary(text), public.set_itinerary_role(uuid, uuid, text), public.itinerary_people(uuid),
  public.create_itinerary_link(uuid, text, text, uuid[], boolean, timestamptz), public.get_shared_itinerary(text) from public;
grant execute on function public.create_itinerary(text, text, text, uuid, uuid, boolean), public.link_itinerary_group(uuid, uuid, boolean),
  public.unlink_itinerary_group(uuid), public.link_itinerary_vault(uuid, uuid), public.unlink_itinerary_vault(uuid),
  public.join_itinerary(text), public.set_itinerary_role(uuid, uuid, text), public.itinerary_people(uuid),
  public.create_itinerary_link(uuid, text, text, uuid[], boolean, timestamptz) to authenticated;
grant execute on function public.get_shared_itinerary(text) to anon, authenticated;

notify pgrst, 'reload schema';
