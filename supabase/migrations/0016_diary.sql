-- IOU 0016: Diary. A personal journal of what happened: Title, Description, Place, date and time, People, Notes and up
-- to 10 photos. An entry stands alone, or belongs to a trip (itinerary).
-- Entries are private to their author. The author may switch "Share with the itinerary" on, and then the other
-- members of that itinerary can read it (never change it). Diary entries are never part of read-only links or plan
-- exports, and nobody else can write to your diary, not even an itinerary owner.
-- Photos are kept in a private bucket and can be read by exactly the people who can read the entry.
-- Run AFTER 0012. Safe to run more than once.

create table if not exists public.diary_entries (
  id           uuid primary key default gen_random_uuid(),
  itinerary_id uuid references public.itineraries(id) on delete set null,   -- deleting a trip leaves each author's entries as theirs alone
  title        text not null check (char_length(trim(title)) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 5000),
  place        text not null default '' check (char_length(place) <= 80),
  entry_on     date not null default current_date,
  entry_at     time,
  people       text[] not null default '{}' check (public.itin_people_ok(people)),
  notes        text not null default '' check (char_length(notes) <= 2000),
  shared       boolean not null default false,
  created_by   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists diary_entries_user_idx on public.diary_entries (created_by, entry_on desc);
create index if not exists diary_entries_it_idx on public.diary_entries (itinerary_id) where itinerary_id is not null;

create table if not exists public.diary_photos (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.diary_entries(id) on delete cascade,
  path       text not null unique,
  name       text not null default '' check (char_length(name) <= 120),
  mime       text not null default '' check (char_length(mime) <= 60),
  caption    text not null default '' check (char_length(caption) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists diary_photos_entry_idx on public.diary_photos (entry_id);

create or replace function public.touch_diary_entry() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists diary_entries_touch on public.diary_entries;
create trigger diary_entries_touch before update on public.diary_entries for each row execute function public.touch_diary_entry();

create or replace function public.limit_diary_photos() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.diary_photos where entry_id = new.entry_id) >= 10 then
    raise exception 'An entry can hold up to 10 photos.' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists diary_photos_limit on public.diary_photos;
create trigger diary_photos_limit before insert on public.diary_photos for each row execute function public.limit_diary_photos();

-- ───────────────────────── who can see what ─────────────────────────
create or replace function public.d_can_see(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diary_entries e where e.id = eid
                 and (e.created_by = auth.uid() or (e.shared and e.itinerary_id is not null and public.it_is_member(e.itinerary_id))))
$$;
create or replace function public.d_is_author(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diary_entries e where e.id = eid and e.created_by = auth.uid())
$$;
revoke all on function public.d_can_see(uuid), public.d_is_author(uuid) from public;
grant execute on function public.d_can_see(uuid), public.d_is_author(uuid) to authenticated;

alter table public.diary_entries enable row level security;
alter table public.diary_photos  enable row level security;
revoke all on public.diary_entries, public.diary_photos from anon, authenticated;
grant select, insert, delete on public.diary_entries to authenticated;
grant update (itinerary_id, title, description, place, entry_on, entry_at, people, notes, shared) on public.diary_entries to authenticated;
grant select, insert, delete on public.diary_photos to authenticated;
grant update (caption) on public.diary_photos to authenticated;

drop policy if exists diary_entries_read on public.diary_entries;
create policy diary_entries_read on public.diary_entries for select to authenticated using (created_by = auth.uid() or public.d_can_see(id));
drop policy if exists diary_entries_insert on public.diary_entries;
create policy diary_entries_insert on public.diary_entries for insert to authenticated
  with check (created_by = auth.uid() and (itinerary_id is null or public.it_is_member(itinerary_id)));
drop policy if exists diary_entries_update on public.diary_entries;
create policy diary_entries_update on public.diary_entries for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid() and (itinerary_id is null or public.it_is_member(itinerary_id)));
drop policy if exists diary_entries_delete on public.diary_entries;
create policy diary_entries_delete on public.diary_entries for delete to authenticated using (created_by = auth.uid());

drop policy if exists diary_photos_read on public.diary_photos;
create policy diary_photos_read on public.diary_photos for select to authenticated using (public.d_can_see(entry_id));
drop policy if exists diary_photos_insert on public.diary_photos;
create policy diary_photos_insert on public.diary_photos for insert to authenticated with check (public.d_is_author(entry_id));
drop policy if exists diary_photos_update on public.diary_photos;
create policy diary_photos_update on public.diary_photos for update to authenticated using (public.d_is_author(entry_id)) with check (public.d_is_author(entry_id));
drop policy if exists diary_photos_delete on public.diary_photos;
create policy diary_photos_delete on public.diary_photos for delete to authenticated using (public.d_is_author(entry_id));

-- ───────────────────────── photo storage ─────────────────────────
-- Photos live at  <entry_id>/<file>  in a private bucket.
create or replace function public.can_read_diary_file(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin return public.d_can_see(((string_to_array(object_name, '/'))[1])::uuid);
exception when others then return false; end $$;
create or replace function public.can_write_diary_file(object_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin return public.d_is_author(((string_to_array(object_name, '/'))[1])::uuid);
exception when others then return false; end $$;
revoke all on function public.can_read_diary_file(text), public.can_write_diary_file(text) from public;
grant execute on function public.can_read_diary_file(text), public.can_write_diary_file(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diary', 'diary', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
on conflict (id) do nothing;

drop policy if exists diary_obj_read on storage.objects;
create policy diary_obj_read on storage.objects for select to authenticated using (bucket_id = 'diary' and public.can_read_diary_file(name));
drop policy if exists diary_obj_insert on storage.objects;
create policy diary_obj_insert on storage.objects for insert to authenticated with check (bucket_id = 'diary' and public.can_write_diary_file(name));
drop policy if exists diary_obj_delete on storage.objects;
create policy diary_obj_delete on storage.objects for delete to authenticated using (bucket_id = 'diary' and public.can_write_diary_file(name));

notify pgrst, 'reload schema';
