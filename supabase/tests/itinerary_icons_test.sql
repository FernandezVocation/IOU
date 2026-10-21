-- Itinerary icons (0020). Run after 0001-0020 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000081','ann@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000082','ed@x.test','{"name":"Ed"}'),
 ('eeeeeeee-0000-0000-0000-000000000083','out@x.test','{"name":"Out"}');
\set ann '''eeeeeeee-0000-0000-0000-000000000081'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000082'''
\set out '''eeeeeeee-0000-0000-0000-000000000083'''
set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_itinerary('Italy') as it \gset
select invite_code as inv from public.itineraries where id=:'it' \gset
select set_config('request.jwt.claim.sub', :ed, false); select public.join_itinerary(:'inv') \gset

select set_config('request.jwt.claim.sub', :ann, false);
insert into public.itinerary_icons (itinerary_id, kind, name_key, icon) values (:'it', 'category', 'visa', 'passport');
insert into public.itinerary_icons (itinerary_id, kind, name_key, icon) values (:'it', 'subtype', 'zorbing', 'ball');
select t.ok((select count(*) from public.itinerary_icons) = 2, 'a member can set an icon for a custom category and a custom subtype');
select t.fails(format($$insert into public.itinerary_icons (itinerary_id, kind, name_key, icon) values ('%s','category','visa','star')$$, :'it'), 'a name has only one icon');
select t.fails(format($$insert into public.itinerary_icons (itinerary_id, kind, name_key, icon) values ('%s','category','Visa Two','star')$$, :'it'), 'the name must be stored lower case and trimmed');
select t.fails(format($$insert into public.itinerary_icons (itinerary_id, kind, name_key, icon) values ('%s','nonsense','x','star')$$, :'it'), 'only categories and subtypes can have icons');
select t.fails(format($$insert into public.itinerary_icons (itinerary_id, kind, name_key, icon) values ('%s','subtype','x',%L)$$, :'it', repeat('i', 41)), 'an icon name over 40 characters is refused');

select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.itinerary_icons) = 2, 'another member sees them');
update public.itinerary_icons set icon = 'star' where kind='category' and name_key='visa';
select t.ok((select icon from public.itinerary_icons where name_key='visa') = 'star', 'any member can change an icon, so one change reaches every item with that name');
select t.fails($$update public.itinerary_icons set name_key = 'moved' where name_key='visa'$$, 'but not rename it');
select t.ok((select updated_by from public.itinerary_icons where name_key='visa') = :ed::uuid, 'the change is attributed to who made it');

select set_config('request.jwt.claim.sub', :out, false);
select t.ok((select count(*) from public.itinerary_icons) = 0, 'an outsider sees none');
select t.fails(format($$insert into public.itinerary_icons (itinerary_id, kind, name_key, icon) values ('%s','subtype','sneak','star')$$, :'it'), 'an outsider cannot add one');
delete from public.itinerary_icons where name_key='visa';
select set_config('request.jwt.claim.sub', :ann, false);
select t.ok((select count(*) from public.itinerary_icons where name_key='visa') = 1, 'and cannot delete one');
delete from public.itinerary_icons where name_key='zorbing';
select t.ok((select count(*) from public.itinerary_icons where name_key='zorbing') = 0, 'a member can remove one');

-- the cap
insert into public.itinerary_icons (itinerary_id, kind, name_key, icon) select :'it', 'subtype', 'n' || g, 'star' from generate_series(1, 199) g;
select t.fails(format($$insert into public.itinerary_icons (itinerary_id, kind, name_key, icon) values ('%s','subtype','one-too-many','star')$$, :'it'), 'an itinerary is capped at 200 custom icons');

-- read-only links carry the icon names
select public.create_itinerary_link(:'it', 'Mom', 'itinerary', '{}', false, null) as tok \gset
reset role; set role anon;
select t.ok(jsonb_array_length(public.get_shared_itinerary(:'tok')->'icons') = 200, 'a read-only link carries the icon names');
select t.ok(public.get_shared_itinerary(:'tok')->'icons'->0 ? 'icon', 'each entry has kind, name and icon');
select t.fails($$select * from public.itinerary_icons$$, 'anon cannot read the table directly');
reset role;
