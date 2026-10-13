-- Expense status and vault link (0011). Run after 0001-0011 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000011','ann@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000012','ed@x.test','{"name":"Ed"}'),
 ('eeeeeeee-0000-0000-0000-000000000013','eve@x.test','{"name":"Eve"}');
\set ann '''eeeeeeee-0000-0000-0000-000000000011'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000012'''
\set eve '''eeeeeeee-0000-0000-0000-000000000013'''

set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_group('Italy','CAD','Ann') as g \gset
select invite_code as ginv from public.groups where id=:'g' \gset
select id as ta from public.travelers where group_id=:'g' and user_id=:ann::uuid \gset
select set_config('request.jwt.claim.sub', :ed, false); select public.join_group(:'ginv', null, 'Ed') \gset
select id as te from public.travelers where group_id=:'g' and user_id=:ed::uuid \gset
-- Ann's vault, linked to the group; Ed is added with the group. Another vault is not linked.
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_vault('Italy 2026', null, null, :'g', true) as v \gset
select public.create_vault('Other', null, null, null, false) as vo \gset
insert into public.vault_items (vault_id, type, title) values (:'v','stay','Hotel') returning id as hotel \gset
insert into public.vault_items (vault_id, type, title, private) values (:'v','document','Passport',true) returning id as pass \gset
insert into public.vault_items (vault_id, type, title) values (:'vo','ticket','Elsewhere') returning id as away \gset

select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Hotel","amount":100,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te')::jsonb) \gset
select t.ok((select status from public.expenses where id=:'e1') = 'final' and (select vault_item_id from public.expenses where id=:'e1') is null, 'an expense with neither field is Final with no link');

select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Hotel","amount":100,"currency":"CAD","payer_id":"%s","split_mode":"equal","status":"estimate","vault_item_id":"%s"}', :'ta', :'hotel')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te')::jsonb) \gset
select t.ok((select status from public.expenses where id=:'e1') = 'estimate', 'status can be set');
select t.ok((select vault_item_id from public.expenses where id=:'e1') = :'hotel'::uuid, 'a vault item can be linked');

-- an older client that sends neither key changes neither
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Hotel 2","amount":100,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select status from public.expenses where id=:'e1') = 'estimate' and (select vault_item_id from public.expenses where id=:'e1') = :'hotel'::uuid, 'leaving the keys out keeps the status and link');

select t.fails(format($$select public.save_expense('%s','%s','{"spent_on":"2026-10-10","vendor":"x","amount":1,"currency":"CAD","payer_id":"%s","split_mode":"equal","status":"bogus"}'::jsonb,'[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'e1', :'g', :'ta', :'ta'), 'an unknown status is refused');
select t.fails(format($$select public.save_expense('%s','%s','{"spent_on":"2026-10-10","vendor":"x","amount":1,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}'::jsonb,'[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'e1', :'g', :'ta', :'away', :'ta'), 'an item from a vault not linked to this group is refused');
select t.fails(format($$select public.save_expense('%s','%s','{"spent_on":"2026-10-10","vendor":"x","amount":1,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}'::jsonb,'[{"traveler_id":"%s","value":1}]'::jsonb)$$, gen_random_uuid(), :'g', :'ta', gen_random_uuid(), :'ta'), 'an item that does not exist is refused');

-- Ed is in the vault, but a private item of Ann's is not his to link
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$select public.save_expense(gen_random_uuid(),'%s','{"spent_on":"2026-10-10","vendor":"x","amount":1,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}'::jsonb,'[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'g', :'te', :'pass', :'te'), 'a private item of someone else cannot be linked');
select t.ok((select count(*) from public.vault_items where id=:'pass') = 0, 'and it is invisible to him, so no icon could ever show');

-- Ann links her own private item: allowed, but others cannot see it
select set_config('request.jwt.claim.sub', :ann, false);
select gen_random_uuid() as e2 \gset
select public.save_expense(:'e2', :'g', format('{"spent_on":"2026-10-10","vendor":"Visa fee","amount":5,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}', :'ta', :'pass')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select vault_item_id from public.expenses where id=:'e2') = :'pass'::uuid, 'the owner of a private item can link it');
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.vault_items i where i.id in (select vault_item_id from public.expenses where group_id=:'g')) = 1, 'Ed can see only the non-private linked item');

-- deleting the item keeps the expense
select set_config('request.jwt.claim.sub', :ann, false);
delete from public.vault_items where id=:'hotel';
select t.ok((select count(*) from public.expenses where id=:'e1') = 1 and (select vault_item_id from public.expenses where id=:'e1') is null, 'deleting the vault item keeps the expense and clears the link');

-- An item that later becomes private to someone else: the expense's owner can still save it, the link stays
select set_config('request.jwt.claim.sub', :ed, false);
select gen_random_uuid() as e3 \gset
select public.save_expense(:'e3', :'g', format('{"spent_on":"2026-10-11","vendor":"Metro","amount":9,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'te')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'te')::jsonb) \gset
select set_config('request.jwt.claim.sub', :ann, false);
insert into public.vault_items (vault_id, type, title) values (:'v','ticket','Metro pass') returning id as metro \gset
select public.save_expense(:'e3', :'g', format('{"spent_on":"2026-10-11","vendor":"Metro","amount":9,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}', :'te', :'metro')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'te')::jsonb) \gset
update public.vault_items set private = true where id = :'metro';
select set_config('request.jwt.claim.sub', :ed, false);
select public.save_expense(:'e3', :'g', format('{"spent_on":"2026-10-11","vendor":"Metro","amount":10,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}', :'te', :'metro')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'te')::jsonb) \gset
select t.ok((select amount from public.expenses where id=:'e3') = 10 and (select vault_item_id from public.expenses where id=:'e3') = :'metro'::uuid, 'someone who can no longer see the linked item can still edit their expense and the link stays');
