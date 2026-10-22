-- Admins (owner or co-admin) can mark a payment received on the receiver's behalf (0021). Run on a database built from all migrations.
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
 ('eeeeeeee-0000-0000-0000-000000000091','own@x.test','{"name":"Own"}'),  -- owner
 ('eeeeeeee-0000-0000-0000-000000000092','adm@x.test','{"name":"Adm"}'),  -- co-admin
 ('eeeeeeee-0000-0000-0000-000000000093','pay@x.test','{"name":"Pay"}'),  -- member, sends payments
 ('eeeeeeee-0000-0000-0000-000000000094','rec@x.test','{"name":"Rec"}'),  -- member, receives
 ('eeeeeeee-0000-0000-0000-000000000095','oth@x.test','{"name":"Oth"}');  -- plain member
set role authenticated;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000091',false);
select public.create_group('Rome','CAD','Own') as g \gset
select id as t_own from public.travelers where group_id=:'g' \gset
select invite_code as inv from public.groups where id=:'g' \gset
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000092',false); select public.join_group(:'inv', null, 'Adm') \gset
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000093',false); select public.join_group(:'inv', null, 'Pay') \gset
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000094',false); select public.join_group(:'inv', null, 'Rec') \gset
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000095',false); select public.join_group(:'inv', null, 'Oth') \gset
select id as t_adm from public.travelers where group_id=:'g' and user_id='eeeeeeee-0000-0000-0000-000000000092' \gset
select id as t_pay from public.travelers where group_id=:'g' and user_id='eeeeeeee-0000-0000-0000-000000000093' \gset
select id as t_rec from public.travelers where group_id=:'g' and user_id='eeeeeeee-0000-0000-0000-000000000094' \gset
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000091',false);
select public.set_member_role(:'g','eeeeeeee-0000-0000-0000-000000000092','admin');
select public.set_member_role(:'g','eeeeeeee-0000-0000-0000-000000000093','member');
select public.set_member_role(:'g','eeeeeeee-0000-0000-0000-000000000094','member');
select public.set_member_role(:'g','eeeeeeee-0000-0000-0000-000000000095','member');

-- Pay sends to Rec: pending.
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000093',false);
select gen_random_uuid() as p1 \gset
select public.save_payment(:'p1', :'g', format('{"from_id":"%s","to_id":"%s","amount":40}', :'t_pay', :'t_rec')::jsonb) \gset
select t.ok((select status from public.payments where id=:'p1') = 'pending', 'starts as sent');
select t.fails(format($$select public.confirm_payment('%s')$$, :'p1'), 'the payer still cannot confirm');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000095',false);
select t.fails(format($$select public.confirm_payment('%s')$$, :'p1'), 'a plain member still cannot confirm for someone with an account');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000092',false);
select public.confirm_payment(:'p1');
select t.ok((select status||'|'||confirmed_by from public.payments where id=:'p1') = 'confirmed|eeeeeeee-0000-0000-0000-000000000092', 'a co-admin can mark it received, and it records who');

-- Owner can too.
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000093',false);
select gen_random_uuid() as p2 \gset
select public.save_payment(:'p2', :'g', format('{"from_id":"%s","to_id":"%s","amount":10}', :'t_pay', :'t_rec')::jsonb) \gset
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000091',false);
select public.confirm_payment(:'p2');
select t.ok((select status from public.payments where id=:'p2') = 'confirmed', 'the owner can mark it received');

-- An admin cannot confirm a payment they sent themselves.
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000092',false);
select gen_random_uuid() as p3 \gset
select public.save_payment(:'p3', :'g', format('{"from_id":"%s","to_id":"%s","amount":5}', :'t_adm', :'t_rec')::jsonb) \gset
select t.fails(format($$select public.confirm_payment('%s')$$, :'p3'), 'an admin cannot confirm their own payment');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-0000-0000-000000000094',false);
select public.confirm_payment(:'p3');
select t.ok((select status from public.payments where id=:'p3') = 'confirmed', 'the receiver still confirms as before');
