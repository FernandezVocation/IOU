-- Booking reference + diary group link (0017). Run after 0001-0017 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000061','ann@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000062','ed@x.test','{"name":"Ed"}'),
 ('eeeeeeee-0000-0000-0000-000000000063','eve@x.test','{"name":"Eve"}');
\set ann '''eeeeeeee-0000-0000-0000-000000000061'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000062'''
\set eve '''eeeeeeee-0000-0000-0000-000000000063'''

set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_group('Italy','CAD','Ann') as g \gset
select invite_code as ginv from public.groups where id=:'g' \gset
select id as ta from public.travelers where group_id=:'g' and user_id=:ann::uuid \gset
select set_config('request.jwt.claim.sub', :ed, false); select public.join_group(:'ginv', null, 'Ed') \gset
select set_config('request.jwt.claim.sub', :ann, false);

select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Italo","amount":50,"currency":"CAD","payer_id":"%s","split_mode":"equal","booking_ref":"  ABC123  "}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select booking_ref from public.expenses where id=:'e1') = 'ABC123', 'an expense stores a trimmed booking reference');
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Italo","amount":50,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select booking_ref from public.expenses where id=:'e1') = 'ABC123', 'leaving the key out keeps it');
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Italo","amount":50,"currency":"CAD","payer_id":"%s","split_mode":"equal","booking_ref":""}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select booking_ref from public.expenses where id=:'e1') = '', 'sending an empty one clears it');
select t.fails(format($$update public.expenses set booking_ref = %L where id='%s'$$, repeat('x',61), :'e1'), 'a reference is capped at 60 characters');

select public.create_itinerary('Trip') as it \gset
insert into public.itinerary_items (itinerary_id, title, booking_ref, created_by) values (:'it', 'Train', 'XYZ789', :ann::uuid) returning id as i1 \gset
select t.ok((select booking_ref from public.itinerary_items where id=:'i1') = 'XYZ789', 'an itinerary item holds a booking reference');
update public.itinerary_items set booking_ref = 'NEW1' where id=:'i1';
select t.ok((select booking_ref from public.itinerary_items where id=:'i1') = 'NEW1', 'and the author can change it');

select public.get_or_create_personal_vault() as pv \gset
insert into public.vault_items (vault_id, type, title, booking_ref, created_by) values (:'pv', 'ticket', 'Flight', 'PNR55', :ann::uuid) returning id as v1 \gset
update public.vault_items set booking_ref = 'PNR56' where id=:'v1';
select t.ok((select booking_ref from public.vault_items where id=:'v1') = 'PNR56', 'a vault item holds and changes a booking reference');

-- diary linked to a group
insert into public.diary_entries (group_id, title, shared, created_by) values (:'g', 'Group day', true, :ann::uuid) returning id as d1 \gset
insert into public.diary_entries (group_id, title, shared, created_by) values (:'g', 'Group secret', false, :ann::uuid) returning id as d2 \gset
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.diary_entries where id=:'d1'::uuid) = 1, 'a group member reads a shared entry linked to the group');
select t.ok((select count(*) from public.diary_entries where id=:'d2'::uuid) = 0, 'but not one left private');
update public.diary_entries set title='x' where id=:'d1'::uuid;
select t.ok((select title from public.diary_entries where id=:'d1'::uuid) = 'Group day', 'and cannot change it');
select set_config('request.jwt.claim.sub', :eve, false);
select t.ok((select count(*) from public.diary_entries) = 0, 'a non-member reads nothing');
select t.fails(format($$insert into public.diary_entries (group_id, title, created_by) values ('%s','Sneaky', auth.uid())$$, :'g'), 'a non-member cannot write into a group');
reset role;

-- link_expense_itinerary_item
set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_itinerary('Linked', null, null, :'g', null, true) as lit \gset
select public.create_itinerary('Other') as oit \gset
insert into public.itinerary_items (itinerary_id, title, created_by) values (:'lit', 'Hotel', :ann::uuid) returning id as h1 \gset
insert into public.itinerary_items (itinerary_id, title, created_by) values (:'oit', 'Away', :ann::uuid) returning id as h2 \gset
select public.link_expense_itinerary_item(:'e1', :'h1');
select t.ok((select itinerary_item_id from public.expenses where id=:'e1') = :'h1'::uuid, 'an expense can be linked to an item of a linked itinerary');
select t.fails(format($$select public.link_expense_itinerary_item('%s','%s')$$, :'e1', :'h2'), 'but not to an item of an unrelated itinerary');
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$select public.link_expense_itinerary_item('%s','%s')$$, :'e1', :'h1'), 'and another member cannot relink it');
select set_config('request.jwt.claim.sub', :eve, false);
select t.fails(format($$select public.link_expense_itinerary_item('%s','%s')$$, :'e1', :'h1'), 'nor an outsider');
reset role;
