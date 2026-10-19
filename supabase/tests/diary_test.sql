-- Expense Diary (0016). Run after 0001-0016 on the stubbed Postgres (see README "Tests").
\set ON_ERROR_STOP off
\set QUIET on
create schema if not exists t;
create or replace function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS: %', label; else raise warning 'FAIL: %', label; end if; end $$;
create or replace function t.fails(q text, label text) returns void language plpgsql as $$
begin execute q; raise warning 'FAIL (should have errored): %', label;
exception when others then raise notice 'PASS: % [%]', label, sqlerrm; end $$;
grant usage on schema t to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('eeeeeeee-0000-0000-0000-000000000051','ann@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000052','ed@x.test','{"name":"Ed"}'),
 ('eeeeeeee-0000-0000-0000-000000000053','eve@x.test','{"name":"Eve"}');
\set ann '''eeeeeeee-0000-0000-0000-000000000051'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000052'''
\set eve '''eeeeeeee-0000-0000-0000-000000000053'''

insert into auth.users (id, email, raw_user_meta_data) values ('eeeeeeee-0000-0000-0000-000000000054','out@x.test','{"name":"Out"}');
\set out '''eeeeeeee-0000-0000-0000-000000000054'''
set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_itinerary('Italy') as it \gset
select invite_code as inv from public.itineraries where id=:'it' \gset
select set_config('request.jwt.claim.sub', :ed, false); select public.join_itinerary(:'inv') \gset

select set_config('request.jwt.claim.sub', :ann, false);
insert into public.diary_entries (itinerary_id, title, description, place, people, created_by) values (:'it', 'Day one', 'We arrived. It rained.', 'Venice', '{Ann,Ed}', :ann::uuid) returning id as d1 \gset
insert into public.diary_entries (itinerary_id, title, shared, created_by) values (:'it', 'Gondola', true, :ann::uuid) returning id as d2 \gset
insert into public.diary_entries (title, created_by) values ('Thoughts', :ann::uuid) returning id as d3 \gset
select t.ok((select count(*) from public.diary_entries) = 3, 'the author sees all their entries');
select t.ok((select entry_on from public.diary_entries where id=:'d3'::uuid) = current_date, 'an entry defaults to today');
select t.fails($$insert into public.diary_entries (title, created_by) values ('   ', auth.uid())$$, 'a title is required');
select t.fails(format($$insert into public.diary_entries (title, created_by) values ('Forged', %L)$$, 'eeeeeeee-0000-0000-0000-000000000052'), 'an entry cannot be written in someone else''s name');

select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.diary_entries) = 1 and (select title from public.diary_entries limit 1) = 'Gondola', 'a trip member sees only entries the author shared');
update public.diary_entries set title = 'Hacked' where id=:'d2'::uuid;
delete from public.diary_entries where id=:'d2'::uuid;
select t.ok((select title from public.diary_entries where id=:'d2'::uuid) = 'Gondola', 'and cannot change or delete them');
select t.ok((select count(*) from public.diary_entries where id=:'d1'::uuid) = 0, 'the private entry in the same trip stays hidden');

select set_config('request.jwt.claim.sub', :out, false);
select t.ok((select count(*) from public.diary_entries) = 0, 'an outsider sees no entries, shared or not');
select t.fails(format($$insert into public.diary_entries (itinerary_id, title, created_by) values ('%s','Sneaky', %L)$$, :'it', 'eeeeeeee-0000-0000-0000-000000000054'), 'an outsider cannot write an entry into the trip');

select set_config('request.jwt.claim.sub', :ann, false);
update public.diary_entries set shared = false where id=:'d2'::uuid;
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.diary_entries) = 0, 'turning sharing off hides the entry again');
select t.fails($$update public.diary_entries set created_by = auth.uid()$$, 'authorship cannot be changed');

-- photos: up to ten, readable exactly where the entry is
select set_config('request.jwt.claim.sub', :ann, false);
insert into public.diary_photos (entry_id, path, name, mime) select :'d2'::uuid, :'d2' || '/p' || i, 'p' || i, 'image/jpeg' from generate_series(1,10) i;
select t.ok((select count(*) from public.diary_photos where entry_id=:'d2'::uuid) = 10, 'an entry holds ten photos');
select t.fails(format($$insert into public.diary_photos (entry_id, path, name, mime) values ('%s','%s/p11','p11','image/jpeg')$$, :'d2', :'d2'), 'but not an eleventh');
select t.ok(public.can_read_diary_file(:'d2' || '/p1'), 'the author can read a photo');
select t.ok(not public.can_read_diary_file('not-a-uuid/x'), 'a malformed path reads nothing');
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok(not public.can_read_diary_file(:'d2' || '/p1'), 'a trip member cannot read photos of an unshared entry');
select t.ok(not public.can_write_diary_file(:'d2' || '/p1'), 'and can never write to someone''s diary');
select set_config('request.jwt.claim.sub', :ann, false);
update public.diary_entries set shared = true where id=:'d2'::uuid;
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok(public.can_read_diary_file(:'d2' || '/p1') and (select count(*) from public.diary_photos) = 10, 'once shared, trip members can read the photos');
select t.ok(not public.can_write_diary_file(:'d2' || '/p1'), 'but still not write');
delete from public.diary_photos;
select t.ok((select count(*) from public.diary_photos) = 10, 'or delete them');
select set_config('request.jwt.claim.sub', :out, false);
select t.ok(not public.can_read_diary_file(:'d2' || '/p1') and (select count(*) from public.diary_photos) = 0, 'an outsider reads no photos');

-- deleting the trip leaves the author's entries, now standalone
select set_config('request.jwt.claim.sub', :ann, false);
delete from public.itineraries where id=:'it';
select t.ok((select count(*) from public.diary_entries) = 3 and (select count(*) from public.diary_entries where itinerary_id is not null) = 0, 'deleting a trip leaves the author''s entries as standalone');
reset role;
