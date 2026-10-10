-- IOU 0009: Vaults. A vault keeps tickets, passes, reservations, documents and the like, organised by date,
-- place and type. It has its own people and roles, and may optionally be linked to ONE group (a group has at
-- most one vault).
-- Run AFTER 0001-0008. Safe to run more than once.
--
-- Roles (vault_members.role):  owner (the creator) · admin (co-admin) · member.
--   Everyone in a vault may add items. Members change or delete only items they added; owner and co-admins
--   change any item they can see.
-- Private items (vault_items.private) can be seen and changed by the person who added them and nobody else,
-- not even the owner. They never appear in read-only links.
-- Read-only links: scope 'vault' (everything not private) or 'items' (only the items picked). Anyone holding
-- the link can look; nobody can change anything. Turning a link off deletes it.

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.vaults (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 80),
  icon        text check (icon is null or char_length(icon) between 1 and 40),
  color       text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  group_id    uuid unique references public.groups(id) on delete set null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.vault_members (
  vault_id  uuid not null references public.vaults(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (vault_id, user_id)
);
create index if not exists vault_members_user_idx on public.vault_members (user_id);

create table if not exists public.vault_items (
  id         uuid primary key default gen_random_uuid(),
  vault_id   uuid not null references public.vaults(id) on delete cascade,
  type       text not null default 'ticket' check (type in ('ticket', 'stay', 'reservation', 'entry', 'pass', 'document', 'contact', 'other')),
  title      text not null check (char_length(trim(title)) between 1 and 120),
  -- Dates and times are local to the place, exactly as written on the booking. No time zone is applied.
  starts_on  date,
  starts_at  time,
  ends_on    date,
  ends_at    time,
  place      text not null default '' check (char_length(place) <= 80),
  address    text not null default '' check (char_length(address) <= 200),
  website    text not null default '' check (char_length(website) <= 300),
  notes      text not null default '' check (char_length(notes) <= 2000),
  private    boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, vault_id)
);
create index if not exists vault_items_vault_idx on public.vault_items (vault_id, starts_on);

create table if not exists public.vault_files (
  id         uuid primary key default gen_random_uuid(),
  vault_id   uuid not null,
  item_id    uuid not null,
  path       text not null unique,
  name       text not null default '' check (char_length(name) <= 120),
  mime       text not null default '',
  label      text not null default '' check (char_length(label) <= 60),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (item_id, vault_id) references public.vault_items (id, vault_id) on delete cascade
);
create index if not exists vault_files_item_idx on public.vault_files (item_id);

create table if not exists public.vault_links (
  id         uuid primary key default gen_random_uuid(),
  vault_id   uuid not null references public.vaults(id) on delete cascade,
  label      text not null check (char_length(trim(label)) between 1 and 80),
  token      text not null unique check (token ~ '^[0-9a-f]{48}$'),
  scope      text not null check (scope in ('vault', 'items')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (id, vault_id)
);
create table if not exists public.vault_link_items (
  link_id  uuid not null,
  item_id  uuid not null,
  vault_id uuid not null,
  primary key (link_id, item_id),
  foreign key (link_id, vault_id) references public.vault_links (id, vault_id) on delete cascade,
  foreign key (item_id, vault_id) references public.vault_items (id, vault_id) on delete cascade
);
-- Who has opened a link, so they may read its files. Turning the link off deletes these rows.
create table if not exists public.vault_link_viewers (
  link_id    uuid not null references public.vault_links(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (link_id, user_id)
);

create or replace function public.touch_vault_item() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists vault_items_touch on public.vault_items;
create trigger vault_items_touch before update on public.vault_items for each row execute function public.touch_vault_item();

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.v_is_member(vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vault_members where vault_id = vid and user_id = auth.uid())
$$;
-- Owner or co-admin.
create or replace function public.v_is_admin(vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vault_members where vault_id = vid and user_id = auth.uid() and role in ('owner', 'admin'))
$$;
create or replace function public.v_is_owner(vid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vault_members where vault_id = vid and user_id = auth.uid() and role = 'owner')
$$;
-- A member who may see this item: it is not private, or they added it.
create or replace function public.v_can_see_item(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vault_items i
                 where i.id = iid and public.v_is_member(i.vault_id) and (not i.private or i.created_by = auth.uid()))
$$;
-- Who may change or delete an item: the person who added it, or an owner/co-admin who can see it.
create or replace function public.v_can_modify_item(iid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vault_items i
                 where i.id = iid and public.v_is_member(i.vault_id) and (not i.private or i.created_by = auth.uid())
                   and (i.created_by = auth.uid() or public.v_is_admin(i.vault_id)))
$$;
revoke all on function public.v_is_member(uuid), public.v_is_admin(uuid), public.v_is_owner(uuid), public.v_can_see_item(uuid), public.v_can_modify_item(uuid) from public;
grant execute on function public.v_is_member(uuid), public.v_is_admin(uuid), public.v_is_owner(uuid), public.v_can_see_item(uuid), public.v_can_modify_item(uuid) to authenticated;

-- ───────────────────────── row-level security ─────────────────────────
alter table public.vaults            enable row level security;
alter table public.vault_members     enable row level security;
alter table public.vault_items       enable row level security;
alter table public.vault_files       enable row level security;
alter table public.vault_links       enable row level security;
alter table public.vault_link_items  enable row level security;
alter table public.vault_link_viewers enable row level security;

revoke all on public.vaults, public.vault_members, public.vault_items, public.vault_files,
              public.vault_links, public.vault_link_items, public.vault_link_viewers from anon, authenticated;
grant select on public.vaults, public.vault_members to authenticated;
grant update (name, icon, color) on public.vaults to authenticated;
grant delete on public.vaults, public.vault_members to authenticated;
grant select, insert, delete on public.vault_files to authenticated;
grant select, delete on public.vault_links, public.vault_link_items to authenticated;
grant select, insert on public.vault_items to authenticated;
grant update (type, title, starts_on, starts_at, ends_on, ends_at, place, address, website, notes, private) on public.vault_items to authenticated;
grant delete on public.vault_items to authenticated;

drop policy if exists vaults_read on public.vaults;
create policy vaults_read on public.vaults for select to authenticated using (public.v_is_member(id));
drop policy if exists vaults_update on public.vaults;
create policy vaults_update on public.vaults for update to authenticated using (public.v_is_admin(id)) with check (public.v_is_admin(id));
drop policy if exists vaults_delete on public.vaults;
create policy vaults_delete on public.vaults for delete to authenticated using (public.v_is_owner(id));

drop policy if exists vault_members_read on public.vault_members;
create policy vault_members_read on public.vault_members for select to authenticated using (public.v_is_member(vault_id));
-- Leave yourself, or (owner/co-admin) remove someone who is not the owner.
drop policy if exists vault_members_delete on public.vault_members;
create policy vault_members_delete on public.vault_members for delete to authenticated
  using (user_id = auth.uid() or (public.v_is_admin(vault_id) and role <> 'owner'));

drop policy if exists vault_items_read on public.vault_items;
create policy vault_items_read on public.vault_items for select to authenticated
  using (public.v_is_member(vault_id) and (not private or created_by = auth.uid()));
drop policy if exists vault_items_insert on public.vault_items;
create policy vault_items_insert on public.vault_items for insert to authenticated
  with check (public.v_is_member(vault_id) and created_by = auth.uid());
drop policy if exists vault_items_update on public.vault_items;
create policy vault_items_update on public.vault_items for update to authenticated
  using (public.v_can_modify_item(id)) with check (public.v_can_modify_item(id));
drop policy if exists vault_items_delete on public.vault_items;
create policy vault_items_delete on public.vault_items for delete to authenticated using (public.v_can_modify_item(id));

drop policy if exists vault_files_read on public.vault_files;
create policy vault_files_read on public.vault_files for select to authenticated using (public.v_can_see_item(item_id));
drop policy if exists vault_files_insert on public.vault_files;
create policy vault_files_insert on public.vault_files for insert to authenticated with check (public.v_can_modify_item(item_id));
drop policy if exists vault_files_delete on public.vault_files;
create policy vault_files_delete on public.vault_files for delete to authenticated using (public.v_can_modify_item(item_id));

-- Links hold secrets, so only owner and co-admins see or remove them.
drop policy if exists vault_links_read on public.vault_links;
create policy vault_links_read on public.vault_links for select to authenticated using (public.v_is_admin(vault_id));
drop policy if exists vault_links_delete on public.vault_links;
create policy vault_links_delete on public.vault_links for delete to authenticated using (public.v_is_admin(vault_id));
drop policy if exists vault_link_items_read on public.vault_link_items;
create policy vault_link_items_read on public.vault_link_items for select to authenticated using (public.v_is_admin(vault_id));

-- ───────────────────────── creating, joining, roles ─────────────────────────
-- Optionally links the new vault to a group the caller owns/co-administers, and optionally adds that group's
-- members to the vault. A group has at most one vault.
create or replace function public.create_vault(p_name text, p_icon text default null, p_color text default null,
                                               p_group uuid default null, p_add_members boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare vid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the vault a name.'; end if;
  if p_group is not null then
    if not public.is_owner(p_group) then raise exception 'Only the group owner or a co-admin can link a vault.' using errcode = '42501'; end if;
    if exists (select 1 from public.vaults where group_id = p_group) then raise exception 'This group already has a vault.'; end if;
  end if;
  insert into public.vaults (name, icon, color, group_id) values (left(trim(p_name), 80), p_icon, p_color, p_group) returning id into vid;
  insert into public.vault_members (vault_id, user_id, role) values (vid, auth.uid(), 'owner');
  if p_group is not null and p_add_members then
    insert into public.vault_members (vault_id, user_id, role)
    select vid, user_id, 'member' from public.group_members where group_id = p_group and user_id <> auth.uid()
    on conflict do nothing;
  end if;
  return vid;
end $$;

create or replace function public.link_vault(p_vault uuid, p_group uuid, p_add_members boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.v_is_admin(p_vault) then raise exception 'Only the vault owner or a co-admin can do this.' using errcode = '42501'; end if;
  if not public.is_owner(p_group) then raise exception 'Only the group owner or a co-admin can link a vault.' using errcode = '42501'; end if;
  if exists (select 1 from public.vaults where group_id = p_group and id <> p_vault) then raise exception 'This group already has a vault.'; end if;
  update public.vaults set group_id = p_group where id = p_vault;
  if p_add_members then
    insert into public.vault_members (vault_id, user_id, role)
    select p_vault, user_id, 'member' from public.group_members where group_id = p_group
    on conflict do nothing;
  end if;
end $$;

create or replace function public.unlink_vault(p_vault uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.v_is_admin(p_vault) then raise exception 'Only the vault owner or a co-admin can do this.' using errcode = '42501'; end if;
  update public.vaults set group_id = null where id = p_vault;
end $$;

create or replace function public.join_vault(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare vid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select id into vid from public.vaults where invite_code = p_code;
  if vid is null then raise exception 'That invite link is not valid.'; end if;
  insert into public.vault_members (vault_id, user_id, role) values (vid, auth.uid(), 'member') on conflict do nothing;
  return vid;
end $$;

create or replace function public.set_vault_role(p_vault uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.v_is_owner(p_vault) then raise exception 'Only the vault owner can change roles.' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Choose co-admin or member.'; end if;
  update public.vault_members set role = p_role where vault_id = p_vault and user_id = p_user and role <> 'owner';
end $$;

-- Names of a vault's people. Profiles are only readable between people who share a group, so vault members who
-- have never shared one get their names through this.
create or replace function public.vault_people(p_vault uuid) returns table (user_id uuid, role text, name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.v_is_member(p_vault) then raise exception 'You are not in this vault.' using errcode = '42501'; end if;
  return query select m.user_id, m.role, coalesce(nullif(p.display_name, ''), 'Someone')
               from public.vault_members m left join public.profiles p on p.id = m.user_id
               where m.vault_id = p_vault order by (m.role = 'owner') desc, p.display_name;
end $$;
revoke all on function public.vault_people(uuid) from public;
grant execute on function public.vault_people(uuid) to authenticated;

-- ───────────────────────── read-only links ─────────────────────────
create or replace function public.create_vault_link(p_vault uuid, p_label text, p_scope text,
                                                    p_item_ids uuid[] default '{}', p_expires_at timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare tok text; lid uuid; ids uuid[];
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not public.v_is_admin(p_vault) then raise exception 'Only the vault owner or a co-admin can create read-only links.' using errcode = '42501'; end if;
  if p_scope not in ('vault', 'items') then raise exception 'Choose the whole vault or specific items.'; end if;
  if char_length(trim(coalesce(p_label, ''))) = 0 then raise exception 'Give the link a name.'; end if;
  select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(p_item_ids, '{}')) x;
  if p_scope = 'vault' then ids := '{}'; end if;
  if p_scope = 'items' then
    if cardinality(ids) = 0 then raise exception 'Choose at least one item.'; end if;
    if (select count(*) from public.vault_items where vault_id = p_vault and id = any(ids) and not private) <> cardinality(ids) then
      raise exception 'Those items cannot be shared. Private items are never shared.';
    end if;
  end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'The expiry must be in the future.'; end if;
  if (select count(*) from public.vault_links where vault_id = p_vault) >= 50 then raise exception 'This vault already has 50 links. Turn some off first.'; end if;
  tok := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48);
  insert into public.vault_links (vault_id, label, token, scope, created_by, expires_at)
  values (p_vault, left(trim(p_label), 80), tok, p_scope, auth.uid(), p_expires_at) returning id into lid;
  insert into public.vault_link_items (link_id, item_id, vault_id) select lid, x, p_vault from unnest(ids) x;
  return tok;
end $$;

create or replace function public.claim_vault_link(p_token text) returns boolean
language plpgsql security definer set search_path = public as $$
declare l public.vault_links;
begin
  if auth.uid() is null then return false; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return false; end if;
  select * into l from public.vault_links where token = p_token and (expires_at is null or expires_at > now());
  if not found then return false; end if;
  insert into public.vault_link_viewers (link_id, user_id) values (l.id, auth.uid()) on conflict do nothing;
  return true;
end $$;

-- Which files a link holder may read: items in a 'vault' link that are not private, or the items picked.
create or replace function public.viewer_can_read_vault_file(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare vid uuid; iid uuid;
begin
  vid := ((string_to_array(object_name, '/'))[1])::uuid;
  iid := ((string_to_array(object_name, '/'))[2])::uuid;
  return exists (
    select 1 from public.vault_link_viewers v
    join public.vault_links l on l.id = v.link_id
    join public.vault_items i on i.id = iid and i.vault_id = l.vault_id and not i.private
    where v.user_id = auth.uid() and l.vault_id = vid and (l.expires_at is null or l.expires_at > now())
      and (l.scope = 'vault' or exists (select 1 from public.vault_link_items li where li.link_id = l.id and li.item_id = iid)));
exception when others then
  return false;
end $$;
revoke all on function public.viewer_can_read_vault_file(text) from public;
grant execute on function public.viewer_can_read_vault_file(text) to authenticated;

-- The one anonymous entry point. Unknown, malformed, expired and turned-off tokens all return null.
create or replace function public.get_shared_vault(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.vault_links; v public.vaults; res jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.vault_links where token = p_token and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select * into v from public.vaults where id = l.vault_id;
  select jsonb_build_object(
    'vault', jsonb_build_object('name', v.name, 'icon', v.icon, 'color', v.color),
    'label', l.label,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'type', i.type, 'title', i.title, 'starts_on', i.starts_on, 'starts_at', i.starts_at,
        'ends_on', i.ends_on, 'ends_at', i.ends_at, 'place', i.place, 'address', i.address, 'website', i.website, 'notes', i.notes,
        'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path, 'name', f.name, 'mime', f.mime, 'label', f.label) order by f.created_at)
                           from public.vault_files f where f.item_id = i.id), '[]'::jsonb))
        order by i.starts_on nulls last, i.starts_at nulls last, i.title)
      from public.vault_items i
      where i.vault_id = l.vault_id and not i.private
        and (l.scope = 'vault' or exists (select 1 from public.vault_link_items li where li.link_id = l.id and li.item_id = i.id))
    ), '[]'::jsonb)
  ) into res;
  return res;
end $$;

revoke all on function public.create_vault(text, text, text, uuid, boolean), public.link_vault(uuid, uuid, boolean), public.unlink_vault(uuid),
  public.join_vault(text), public.set_vault_role(uuid, uuid, text), public.create_vault_link(uuid, text, text, uuid[], timestamptz),
  public.claim_vault_link(text), public.get_shared_vault(text) from public;
grant execute on function public.create_vault(text, text, text, uuid, boolean), public.link_vault(uuid, uuid, boolean), public.unlink_vault(uuid),
  public.join_vault(text), public.set_vault_role(uuid, uuid, text), public.create_vault_link(uuid, text, text, uuid[], timestamptz),
  public.claim_vault_link(text) to authenticated;
grant execute on function public.get_shared_vault(text) to anon, authenticated;

-- ───────────────────────── file storage ─────────────────────────
-- Files live at  <vault_id>/<item_id>/<file>  in a private bucket.
create or replace function public.can_read_vault_file(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.v_can_see_item(((string_to_array(object_name, '/'))[2])::uuid)
     and (string_to_array(object_name, '/'))[1]::uuid = (select vault_id from public.vault_items where id = ((string_to_array(object_name, '/'))[2])::uuid);
exception when others then
  return false;
end $$;
create or replace function public.can_write_vault_file(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.v_can_modify_item(((string_to_array(object_name, '/'))[2])::uuid)
     and (string_to_array(object_name, '/'))[1]::uuid = (select vault_id from public.vault_items where id = ((string_to_array(object_name, '/'))[2])::uuid);
exception when others then
  return false;
end $$;
revoke all on function public.can_read_vault_file(text), public.can_write_vault_file(text) from public;
grant execute on function public.can_read_vault_file(text), public.can_write_vault_file(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault', 'vault', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists vault_files_obj_read on storage.objects;
create policy vault_files_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'vault' and (public.can_read_vault_file(name) or public.viewer_can_read_vault_file(name)));
drop policy if exists vault_files_obj_insert on storage.objects;
create policy vault_files_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'vault' and public.can_write_vault_file(name));
drop policy if exists vault_files_obj_delete on storage.objects;
create policy vault_files_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'vault' and public.can_write_vault_file(name));

notify pgrst, 'reload schema';
