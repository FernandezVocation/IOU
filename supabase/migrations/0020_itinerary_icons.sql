-- IOU 0020: icons for custom itinerary categories and custom subtypes, chosen once per name.
-- "Visa" gets one icon and every item with that name in the itinerary shows it. Run AFTER 0019. Safe to run more than once.
create table if not exists public.itinerary_icons (
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  kind         text not null check (kind in ('category', 'subtype')),
  name_key     text not null check (char_length(name_key) between 1 and 40 and name_key = lower(trim(name_key))),
  icon         text not null check (char_length(icon) between 1 and 40),
  updated_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at   timestamptz not null default now(),
  primary key (itinerary_id, kind, name_key)
);

alter table public.itinerary_icons enable row level security;
revoke all on public.itinerary_icons from anon, authenticated;
grant select, insert, delete on public.itinerary_icons to authenticated;
grant update (icon) on public.itinerary_icons to authenticated;

-- Everyone in the itinerary can pick an icon, as they can add items; a name can only ever have one icon.
drop policy if exists itinerary_icons_read on public.itinerary_icons;
create policy itinerary_icons_read on public.itinerary_icons for select to authenticated using (public.it_is_member(itinerary_id));
drop policy if exists itinerary_icons_insert on public.itinerary_icons;
create policy itinerary_icons_insert on public.itinerary_icons for insert to authenticated with check (public.it_is_member(itinerary_id));
drop policy if exists itinerary_icons_update on public.itinerary_icons;
create policy itinerary_icons_update on public.itinerary_icons for update to authenticated using (public.it_is_member(itinerary_id)) with check (public.it_is_member(itinerary_id));
drop policy if exists itinerary_icons_delete on public.itinerary_icons;
create policy itinerary_icons_delete on public.itinerary_icons for delete to authenticated using (public.it_is_member(itinerary_id));

create or replace function public.itinerary_icons_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.updated_at = now(); new.updated_by = auth.uid(); end if;
  if tg_op = 'INSERT' and (select count(*) from public.itinerary_icons where itinerary_id = new.itinerary_id) >= 200 then
    raise exception 'This itinerary already has 200 custom icons.';
  end if;
  return new;
end $$;
drop trigger if exists itinerary_icons_guard on public.itinerary_icons;
create trigger itinerary_icons_guard before insert or update on public.itinerary_icons for each row execute function public.itinerary_icons_guard();

-- Read-only links carry the icon names too, so the shared page looks the same. Only picture names, nothing private.
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
    'icons', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'name', x.name_key, 'icon', x.icon)) from public.itinerary_icons x where x.itinerary_id = l.itinerary_id), '[]'::jsonb),
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
revoke all on function public.get_shared_itinerary(text) from public;
grant execute on function public.get_shared_itinerary(text) to anon, authenticated;
notify pgrst, 'reload schema';
