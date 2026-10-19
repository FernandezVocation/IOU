-- Expense personal vault item link (0015). Run after 0001-0015 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000041','ann@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000042','ed@x.test','{"name":"Ed"}'),
 ('eeeeeeee-0000-0000-0000-000000000043','eve@x.test','{"name":"Eve"}');
\set ann '''eeeeeeee-0000-0000-0000-000000000041'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000042'''
\set eve '''eeeeeeee-0000-0000-0000-000000000043'''

set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_group('Italy','CAD','Ann') as g \gset
select invite_code as ginv from public.groups where id=:'g' \gset
select id as ta from public.travelers where group_id=:'g' and user_id=:ann::uuid \gset
select set_config('request.jwt.claim.sub', :ed, false); select public.join_group(:'ginv', null, 'Ed') \gset
select id as te from public.travelers where group_id=:'g' and user_id=:ed::uuid \gset
select public.get_or_create_personal_vault() as edv \gset
insert into public.vault_items (vault_id, type, title, created_by) values (:'edv', 'document', 'Ed insurance', :ed::uuid) returning id as edi \gset
select set_config('request.jwt.claim.sub', :ann, false);
select public.get_or_create_personal_vault() as anv \gset
insert into public.vault_items (vault_id, type, title, created_by) values (:'anv', 'ticket', 'Ann flight', :ann::uuid) returning id as ani \gset

select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-10","vendor":"Flight","amount":900,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}', :'ta', :'ani')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'ta')::jsonb) \gset
select t.ok((select vault_item_id from public.expenses where id=:'e1') = :'ani'::uuid, 'an expense links to the saver''s own personal vault item');

select set_config('request.jwt.claim.sub', :ed, false);
select gen_random_uuid() as e2 \gset
select t.fails(format($$select public.save_expense('%s','%s','{"spent_on":"2026-10-10","vendor":"x","amount":1,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}'::jsonb,'[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'e2', :'g', :'te', :'ani', :'te'), 'someone else''s personal vault item cannot be linked');
select public.save_expense(:'e2', :'g', format('{"spent_on":"2026-10-11","vendor":"Cover","amount":50,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}', :'te', :'edi')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'te')::jsonb) \gset
select t.ok((select vault_item_id from public.expenses where id=:'e2') = :'edi'::uuid, 'each person links their own');

-- the other group member can read the expense but cannot see the item behind the link
select t.ok((select count(*) from public.expenses where id=:'e1') = 1, 'group members still see the expense');
select t.ok(not public.v_can_see_item(:'ani'::uuid), 'but not the personal item behind it');
select t.ok((select count(*) from public.vault_items where id=:'ani'::uuid) = 0, 'and the item does not come back from a query');

-- a vault item of an unrelated, non-personal group vault is still refused
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_vault('Other group docs') as ov \gset
insert into public.vault_items (vault_id, type, title, created_by) values (:'ov', 'ticket', 'Elsewhere', :ann::uuid) returning id as oi \gset
select gen_random_uuid() as e3 \gset
select t.fails(format($$select public.save_expense('%s','%s','{"spent_on":"2026-10-10","vendor":"x","amount":1,"currency":"CAD","payer_id":"%s","split_mode":"equal","vault_item_id":"%s"}'::jsonb,'[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'e3', :'g', :'ta', :'oi', :'ta'), 'a vault that is neither this group''s nor personal is still refused');
reset role;
