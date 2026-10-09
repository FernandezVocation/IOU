-- Sub-categories and group types (0004). Run on a fresh database with 0001-0004 applied.
\set ON_ERROR_STOP off
\set QUIET on
create schema if not exists t;
create or replace function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS: %', label; else raise warning 'FAIL: %', label; end if; end $$;
create or replace function t.fails(q text, label text) returns void language plpgsql as $$
begin execute q; raise warning 'FAIL (should have errored): %', label;
exception when others then raise notice 'PASS: % [%]', label, sqlerrm; end $$;
grant usage on schema t to anon, authenticated;
grant execute on all functions in schema t to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('dddddddd-0000-0000-0000-000000000001','ann@x.test','{"name":"Ann"}'),
 ('dddddddd-0000-0000-0000-000000000002','bo@x.test','{"name":"Bo"}');
set role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000001',false);

-- ===== group types =====
select public.create_group('Italy','cad','Ann') as g1 \gset
select t.ok((select kind from public.groups where id=:'g1') = 'Trip', 'old three-argument create_group still works and defaults the type to Trip');
select public.create_group('Flat 12B','cad','Ann','Household') as g2 \gset
select t.ok((select kind from public.groups where id=:'g2') = 'Household', 'a suggested type is stored');
select public.create_group('Book club','cad','Ann','  Book club night  ') as g3 \gset
select t.ok((select kind from public.groups where id=:'g3') = 'Book club night', 'a typed custom type is stored and trimmed');
select public.create_group('Blank','cad','Ann','   ') as g4 \gset
select t.ok((select kind from public.groups where id=:'g4') = 'Trip', 'a blank type falls back to Trip');
select public.create_group('Long','cad','Ann',repeat('x',90)) as g5 \gset
select t.ok((select length(kind) from public.groups where id=:'g5') = 40, 'an over-long type is cut to 40 characters');
select t.ok(public.create_group('Anon-proof','cad','Ann','Event') is not null, 'create_group works for a signed-in user');

-- owner can change the type, a member cannot
update public.groups set kind='Event' where id=:'g1';
select t.ok((select kind from public.groups where id=:'g1') = 'Event', 'owner can change the group type');
select t.fails(format($$update public.groups set kind='' where id='%s'$$, :'g2'), 'an empty type is rejected');
select invite_code as code1 from public.groups where id=:'g1' \gset
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000002',false);
select public.join_group(:'code1', null, 'Bo') \gset
update public.groups set kind='Hacked' where id=:'g1';
select t.ok((select kind from public.groups where id=:'g1') = 'Event', 'a member who is not the owner cannot change the type');

-- ===== sub-categories =====
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000001',false);
select id as ta from public.travelers where group_id=:'g1' and user_id='dddddddd-0000-0000-0000-000000000001' \gset
select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g1',
  format('{"spent_on":"2026-10-11","vendor":"Gondola","category":"Activities","subcategory":"Gondola","amount":120,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select category||'>'||subcategory from public.expenses where id=:'e1') = 'Activities>Gondola', 'category and sub-category are stored together');
select public.save_expense(:'e1', :'g1',
  format('{"spent_on":"2026-10-11","vendor":"Gondola","category":"Activities","subcategory":"Boat tour","amount":120,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select subcategory from public.expenses where id=:'e1') = 'Boat tour', 'editing an expense updates the sub-category');
select gen_random_uuid() as e2 \gset
select public.save_expense(:'e2', :'g1',
  format('{"spent_on":"2026-10-11","vendor":"No sub","category":"Food","amount":5,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select subcategory from public.expenses where id=:'e2') = '', 'sub-category is optional and defaults to empty');
select t.fails(format($$select public.save_expense(gen_random_uuid(), '%s', '{"spent_on":"2026-10-11","category":"Food","subcategory":"%s","amount":5,"currency":"CAD","payer_id":"%s","split_mode":"equal"}'::jsonb, '[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'g1', repeat('y',61), :'ta', :'ta'), 'a sub-category over 60 characters is rejected');
select t.ok((select count(*) from public.expenses where group_id=:'g1') = 2, 'the rejected expense left nothing behind');

-- balance links carry the sub-category and nothing else new
reset role;
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000001',false);
set role authenticated;
select public.create_share_link(:'g1', 'Test link', array[:'ta']::uuid[]) as tok \gset
set role anon;
select public.get_shared_trip(:'tok')::text as j \gset
select t.ok(position('"subcategory": "Boat tour"' in :'j') > 0 or position('"subcategory":"Boat tour"' in :'j') > 0, 'a balance link shows the sub-category');
