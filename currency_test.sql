-- Spending currency, statement amounts, group icon and colour. Run after 0001-0007 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000001','o@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000002','m@x.test','{"name":"Mo"}');
set role authenticated;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000001',false);
select public.create_group('Venice','CAD','Ann') as g \gset
select id as ta from public.travelers where group_id=:'g' \gset
select invite_code as inv from public.groups where id=:'g' \gset
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000002',false); select public.join_group(:'inv', null, 'Mo') \gset
select id as tm from public.travelers where group_id=:'g' and user_id='eeeeeeee-0000-0000-0000-000000000002' \gset

-- defaults: nothing set means "same as the settle currency" and "default for the group type"
select t.ok((select spending_currency is null and icon is null and color is null from public.groups where id=:'g'), 'a new group has no spending currency, icon or colour set');

-- owner can set them, a plain member cannot
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000001',false);
update public.groups set spending_currency='EUR', icon='plane', color='#2B44FF' where id=:'g';
select t.ok((select spending_currency='EUR' and icon='plane' and color='#2B44FF' from public.groups where id=:'g'), 'the owner can set spending currency, icon and colour');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000002',false);
update public.groups set icon='home' where id=:'g';
select t.ok((select icon='plane' from public.groups where id=:'g'), 'a member cannot change the icon');
update public.groups set color='#000000', spending_currency='USD' where id=:'g';
select t.ok((select color='#2B44FF' and spending_currency='EUR' from public.groups where id=:'g'), 'a member cannot change colour or spending currency');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000001',false);
select t.fails(format($$update public.groups set icon='Bad Icon!' where id='%s'$$, :'g'), 'an icon name must be a simple word');
select t.fails(format($$update public.groups set color='blue' where id='%s'$$, :'g'), 'a colour must be #RRGGBB');
select t.fails(format($$update public.groups set spending_currency='euro' where id='%s'$$, :'g'), 'spending currency must be a 3-letter code');
select public.set_member_role(:'g', 'eeeeeeee-0000-0000-0000-000000000002', 'admin');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000002',false);
update public.groups set icon='camera' where id=:'g';
select t.ok((select icon='camera' from public.groups where id=:'g'), 'a co-admin can change the icon');
select public.set_member_role(:'g', 'eeeeeeee-0000-0000-0000-000000000002', 'member') is null as x \gset
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000001',false);
select public.set_member_role(:'g', 'eeeeeeee-0000-0000-0000-000000000002', 'member');

-- per-person statement currency: any member can set it, bad codes are refused
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000002',false);
update public.travelers set statement_currency='QAR' where id=:'tm';
select t.ok((select statement_currency='QAR' from public.travelers where id=:'tm'), 'a member can set their statement currency');
select t.fails(format($$update public.travelers set statement_currency='qr' where id='%s'$$, :'tm'), 'statement currency must be a 3-letter code');

-- statement amounts on an expense
select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-01","vendor":"Dinner","amount":100,"currency":"EUR","charged_amount":600,"charged_currency":"qar","payer_id":"%s","split_mode":"equal"}', :'tm')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'tm')::jsonb);
select t.ok((select charged_amount=600 and charged_currency='QAR' and settled_amount is null from public.expenses where id=:'e1'), 'a statement amount is stored with its currency (upper-cased), settled amount stays empty');
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-01","vendor":"Dinner","amount":100,"currency":"EUR","charged_amount":600,"charged_currency":"QAR","settled_amount":222.5,"payer_id":"%s","split_mode":"equal"}', :'tm')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'tm')::jsonb);
select t.ok((select settled_amount=222.5 and charged_amount=600 from public.expenses where id=:'e1'), 'an exact settle amount can sit alongside the statement amount');
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-01","vendor":"Dinner","amount":100,"currency":"EUR","payer_id":"%s","split_mode":"equal"}', :'tm')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'tm')::jsonb);
select t.ok((select charged_amount is null and charged_currency is null from public.expenses where id=:'e1'), 'clearing the statement amount on edit clears both fields');
select gen_random_uuid() as e2 \gset
select t.fails(format($$select public.save_expense('%s','%s','{"spent_on":"2026-10-01","vendor":"x","amount":5,"currency":"EUR","charged_amount":7,"payer_id":"%s","split_mode":"equal"}'::jsonb, '[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'e2', :'g', :'tm', :'tm'), 'a statement amount needs its currency');

-- links carry the look and the statement amounts
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000001',false);
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-01","vendor":"Dinner","amount":100,"currency":"EUR","charged_amount":600,"charged_currency":"QAR","payer_id":"%s","split_mode":"equal"}', :'tm')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'tm')::jsonb);
select public.create_share_link(:'g', 'All', '{}'::uuid[], null, 'group') as tg \gset
select public.create_share_link(:'g', 'Ann', array[:'ta']::uuid[], null, 'person') as tp \gset
reset role;
set role anon;
select t.ok((public.get_shared_trip(:'tg') -> 'group' ->> 'icon') = 'camera' and (public.get_shared_trip(:'tg') -> 'group' ->> 'color') = '#2B44FF' and (public.get_shared_trip(:'tg') -> 'group' ->> 'spending_currency') = 'EUR', 'a group link carries icon, colour and spending currency');
select t.ok((public.get_shared_trip(:'tg') -> 'expenses' -> 0 ->> 'charged_amount')::numeric = 600 and (public.get_shared_trip(:'tg') -> 'expenses' -> 0 ->> 'charged_currency') = 'QAR', 'a group link carries the statement amount');
select t.ok((public.get_shared_trip(:'tp') -> 'group' ->> 'icon') = 'camera' and (public.get_shared_trip(:'tp') -> 'expenses' -> 0 ->> 'charged_amount')::numeric = 600, 'a person link carries icon and the statement amount');
