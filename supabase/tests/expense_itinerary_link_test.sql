-- Expense itinerary link (0013). Run after 0001-0013 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000021','ann@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000022','ed@x.test','{"name":"Ed"}'),
 ('eeeeeeee-0000-0000-0000-000000000023','eve@x.test','{"name":"Eve"}');
\set ann '''eeeeeeee-0000-0000-0000-000000000021'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000022'''
\set eve '''eeeeeeee-0000-0000-0000-000000000023'''

set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_group('Italy','CAD','Ann') as g \gset
select invite_code as ginv from public.groups where id=:'g' \gset
select id as ta from public.travelers where group_id=:'g' and user_id=:ann::uuid \gset
select set_config('request.jwt.claim.sub', :ed, false); select public.join_group(:'ginv', null, 'Ed') \gset
select id as te from public.travelers where group_id=:'g' and user_id=:ed::uuid \gset
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_itinerary('Italy 2026', null, null, :'g', null, true) as it \gset
select public.create_itinerary('Unrelated') as it2 \gset
insert into public.itinerary_items (itinerary_id, title, created_by) values (:'it', 'Hotel', :ann::uuid) returning id as hotel \gset
insert into public.itinerary_items (itinerary_id, title, private, created_by) values (:'it', 'Gift', true, :ann::uuid) returning id as gift \gset
insert into public.itinerary_items (itinerary_id, title, created_by) values (:'it2', 'Elsewhere', :ann::uuid) returning id as away \gset

select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Hotel","amount":100,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te')::jsonb) \gset
select t.ok((select itinerary_item_id from public.expenses where id=:'e1') is null, 'an expense starts with no itinerary link');

select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Hotel","amount":100,"currency":"CAD","payer_id":"%s","split_mode":"equal","itinerary_item_id":"%s"}', :'ta', :'hotel')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te')::jsonb) \gset
select t.ok((select itinerary_item_id from public.expenses where id=:'e1') = :'hotel'::uuid, 'an itinerary item of a linked itinerary can be linked');

-- a client that leaves the key out changes nothing
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Hotel 2","amount":100,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select itinerary_item_id from public.expenses where id=:'e1') = :'hotel'::uuid, 'leaving the key out keeps the link');

select t.fails(format($$select public.save_expense('%s','%s','{"spent_on":"2026-10-10","vendor":"x","amount":1,"currency":"CAD","payer_id":"%s","split_mode":"equal","itinerary_item_id":"%s"}'::jsonb,'[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'e1', :'g', :'ta', :'away', :'ta'), 'an item of an itinerary not linked to this group is refused');

-- Ed cannot link an item he cannot see
select set_config('request.jwt.claim.sub', :ed, false);
select gen_random_uuid() as e2 \gset
select t.fails(format($$select public.save_expense('%s','%s','{"spent_on":"2026-10-10","vendor":"x","amount":1,"currency":"CAD","payer_id":"%s","split_mode":"equal","itinerary_item_id":"%s"}'::jsonb,'[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'e2', :'g', :'te', :'gift', :'te'), 'an only-me item of someone else cannot be linked');
select public.save_expense(:'e2', :'g', format('{"spent_on":"2026-10-11","vendor":"Dinner","amount":40,"currency":"CAD","payer_id":"%s","split_mode":"equal","itinerary_item_id":"%s"}', :'te', :'hotel')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'te')::jsonb) \gset
select t.ok((select itinerary_item_id from public.expenses where id=:'e2') = :'hotel'::uuid, 'a member links their own expense to a visible item');

-- the item later becomes only-me: Ed's expense keeps its link and can still be saved; Ann can no longer see the item
insert into public.itinerary_items (itinerary_id, title, created_by) values (:'it', 'Ed plan', :ed::uuid) returning id as edp \gset
select gen_random_uuid() as e3 \gset
select public.save_expense(:'e3', :'g', format('{"spent_on":"2026-10-12","vendor":"Tickets","amount":20,"currency":"CAD","payer_id":"%s","split_mode":"equal","itinerary_item_id":"%s"}', :'te', :'edp')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'te')::jsonb) \gset
update public.itinerary_items set private = true where id=:'edp';
select public.save_expense(:'e3', :'g', format('{"spent_on":"2026-10-12","vendor":"Tickets 2","amount":20,"currency":"CAD","payer_id":"%s","split_mode":"equal","itinerary_item_id":"%s"}', :'te', :'edp')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'te')::jsonb) \gset
select t.ok((select vendor from public.expenses where id=:'e3') = 'Tickets 2', 'an existing link survives the item becoming only-me');
select set_config('request.jwt.claim.sub', :ann, false);
select t.ok(not public.it_can_see_item(:'edp'::uuid), 'and the other member cannot see that item, so the app shows no icon');
select t.ok((select count(*) from public.expenses where itinerary_item_id=:'hotel') = 2, 'group members can read the expenses linked to an item');

-- someone outside the group sees no expense amounts
reset role; insert into auth.users (id, email, raw_user_meta_data) values ('eeeeeeee-0000-0000-0000-000000000024','out@x.test','{"name":"Out"}');
set role authenticated; select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000024', false);
select t.ok((select count(*) from public.expenses where itinerary_item_id=:'hotel') = 0, 'someone outside the group reads no expenses');

-- deleting the item just unlinks
select set_config('request.jwt.claim.sub', :ann, false);
delete from public.itinerary_items where id=:'hotel';
select t.ok((select count(*) from public.expenses where id=:'e1') = 1 and (select itinerary_item_id from public.expenses where id=:'e1') is null, 'deleting the item unlinks the expense and keeps it');
reset role;
