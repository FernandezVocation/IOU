-- Card rates (bill>card pairs), per-expense card currency and payment type/subtype (0023). Run on a database built from all migrations.
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
 ('eeeeeeee-0000-0000-0000-000000000081','o@x.test','{"name":"Own"}'), ('eeeeeeee-0000-0000-0000-000000000082','z@x.test','{"name":"Zed"}');
set role authenticated;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000081',false);
select public.create_group('Italy','CAD','Own') as g \gset
select id as t_own from public.travelers where group_id=:'g' \gset

-- Pair rates live beside the ordinary ones.
insert into public.group_rates (group_id, currency, rate) values (:'g','EUR>QAR',4), (:'g','QAR',0.37);
select t.ok((select rate from public.group_rates where group_id=:'g' and currency='EUR>QAR') = 4, 'a bill>card pair rate can be stored');
select t.fails(format($$insert into public.group_rates (group_id, currency, rate) values ('%s','EUR>QA',4)$$, :'g'), 'a malformed pair is rejected');
select t.fails(format($$insert into public.group_rates (group_id, currency, rate) values ('%s','eur>qar',4)$$, :'g'), 'lower case is rejected');
select t.fails(format($$insert into public.group_rates (group_id, currency, rate) values ('%s','EUR>QAR>INR',4)$$, :'g'), 'a three-way key is rejected');
select t.fails(format($$insert into public.group_rates (group_id, currency, rate) values ('%s','EUR>INR',0)$$, :'g'), 'a zero rate is still rejected');

-- An expense with a card and a payment type.
select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-02","vendor":"Hotel","amount":100,"currency":"EUR","card_currency":"qar","pay_type":"Credit card","pay_subtype":"Visa","payer_id":"%s","split_mode":"equal"}', :'t_own')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'t_own')::jsonb) \gset
select t.ok((select card_currency||'|'||pay_type||'|'||pay_subtype from public.expenses where id=:'e1') = 'QAR|Credit card|Visa', 'saves the card, payment type and subtype (card upper-cased)');

-- A subtype with no type is dropped, not stored on its own.
select gen_random_uuid() as e2 \gset
select public.save_expense(:'e2', :'g', format('{"spent_on":"2026-10-02","vendor":"Lunch","amount":10,"currency":"CAD","pay_type":"","pay_subtype":"Visa","payer_id":"%s","split_mode":"equal"}', :'t_own')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'t_own')::jsonb) \gset
select t.ok((select pay_type||'|'||pay_subtype from public.expenses where id=:'e2') = '|', 'a subtype without a type is not stored');
select t.fails(format($$update public.expenses set pay_subtype='Visa' where id='%s'$$, :'e2'), 'the table itself also refuses a subtype without a type');
select t.fails(format($$update public.expenses set card_currency='QA' where id='%s'$$, :'e1'), 'a bad card currency is refused');

-- Leaving the keys out keeps what was there (an old client that does not know about them).
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-02","vendor":"Hotel 2","amount":100,"currency":"EUR","payer_id":"%s","split_mode":"equal"}', :'t_own')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'t_own')::jsonb) \gset
select t.ok((select card_currency||'|'||pay_type||'|'||pay_subtype from public.expenses where id=:'e1') = 'QAR|Credit card|Visa', 'an update that omits the new fields leaves them alone');
-- Sending them cleared clears them.
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-02","vendor":"Hotel 2","amount":100,"currency":"EUR","card_currency":"","pay_type":"","pay_subtype":"","payer_id":"%s","split_mode":"equal"}', :'t_own')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'t_own')::jsonb) \gset
select t.ok((select card_currency is null and pay_type='' and pay_subtype='' from public.expenses where id=:'e1'), 'sending them blank clears them');

-- The change history still records the new fields in its snapshot.
select t.ok((select count(*) from public.ledger_history where record_id=:'e1' and action='edited' and snapshot ? 'pay_type') = 2, 'history keeps the earlier payment type');

-- Outsiders cannot read pair rates.
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000082',false);
select t.ok((select count(*) from public.group_rates) = 0, 'a non-member sees no rates');

-- A balance link shows the card each expense was paid on, falling back to the payer's usual card.
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000081',false);
update public.travelers set statement_currency='INR' where id=:'t_own';
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-02","vendor":"Hotel 2","amount":100,"currency":"EUR","card_currency":"QAR","payer_id":"%s","split_mode":"equal"}', :'t_own')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'t_own')::jsonb) \gset
select public.save_expense(:'e2', :'g', format('{"spent_on":"2026-10-03","vendor":"Lunch","amount":10,"currency":"EUR","payer_id":"%s","split_mode":"equal"}', :'t_own')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'t_own')::jsonb) \gset
select public.create_share_link(:'g', 'All', array[]::uuid[], null, 'group') as tok \gset
reset role; set role anon;
select t.ok((select e ->> 'card_currency' from jsonb_array_elements(public.get_shared_trip(:'tok') -> 'expenses') e where e ->> 'vendor' = 'Hotel 2') = 'QAR', 'a shared link carries the expense''s own card');
select t.ok((select e ->> 'card_currency' from jsonb_array_elements(public.get_shared_trip(:'tok') -> 'expenses') e where e ->> 'vendor' = 'Lunch') = 'INR', 'and the payer''s usual card when none was chosen');
select t.ok((public.get_shared_trip(:'tok') -> 'rates') ? 'EUR>QAR', 'and the bill>card rates');
select t.ok(not ((public.get_shared_trip(:'tok') -> 'expenses' -> 0) ? 'pay_type'), 'but not how anyone paid');
