-- Expense description. Run after 0001-0008 on the stubbed Postgres (see README "Tests").
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

insert into auth.users (id, email, raw_user_meta_data) values ('ffffffff-0000-0000-0000-000000000001','d@x.test','{"name":"Dee"}');
set role authenticated;
select set_config('request.jwt.claim.sub','ffffffff-0000-0000-0000-000000000001',false);
select public.create_group('Italy','CAD','Dee') as g \gset
select id as ta from public.travelers where group_id=:'g' \gset
select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Italo","description":"Florence to Rome","amount":355.15,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb);
select t.ok((select vendor='Italo' and description='Florence to Rome' from public.expenses where id=:'e1'), 'vendor and description are stored separately');
select gen_random_uuid() as e2 \gset
select public.save_expense(:'e2', :'g', format('{"spent_on":"2026-10-10","vendor":"x","amount":5,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb);
select t.ok((select description='' from public.expenses where id=:'e2'), 'no description means an empty one');
select public.save_expense(:'e2', :'g', format('{"spent_on":"2026-10-10","vendor":"x","description":"%s","amount":5,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', repeat('a', 300), :'ta')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb);
select t.ok((select char_length(description)=200 from public.expenses where id=:'e2'), 'a long description is cut to 200 characters');
select t.fails(format($$update public.expenses set description=repeat('b', 201) where id='%s'$$, :'e2'), 'the database refuses more than 200 characters');
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Italo","amount":355.15,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb);
select t.ok((select description='' from public.expenses where id=:'e1'), 'editing without a description clears it');
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Italo","description":"Florence to Rome","amount":355.15,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb);
select public.create_share_link(:'g', 'All', '{}'::uuid[], null, 'group') as tg \gset
select public.create_share_link(:'g', 'Dee', array[:'ta']::uuid[], null, 'person') as tp \gset
reset role;
set role anon;
select t.ok((public.get_shared_trip(:'tg') -> 'expenses' -> 0 ->> 'description') in ('Florence to Rome',''), 'a group link carries the description field');
select t.ok(exists (select 1 from jsonb_array_elements(public.get_shared_trip(:'tg') -> 'expenses') x where x ->> 'description' = 'Florence to Rome'), 'a group link shows the description');
select t.ok(exists (select 1 from jsonb_array_elements(public.get_shared_trip(:'tp') -> 'expenses') x where x ->> 'description' = 'Florence to Rome'), 'a person link shows the description');
