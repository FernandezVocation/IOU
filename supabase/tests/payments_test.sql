-- Payments (partial, confirmed by the receiver), who-entered tracking, cross-trip batches, contacts.
-- Run on a database with 0001 + 0002 + 0003 applied (see README "Tests").
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
 ('cccccccc-0000-0000-0000-000000000001','ann@x.test','{"name":"Ann"}'),   -- owner
 ('cccccccc-0000-0000-0000-000000000002','bo@x.test','{"name":"Bo"}'),     -- member
 ('cccccccc-0000-0000-0000-000000000003','dee@x.test','{"name":"Dee"}'),   -- member
 ('cccccccc-0000-0000-0000-000000000004','zed@x.test','{"name":"Zed"}');   -- outsider

-- ===== seed: Ann owns the trip; Bo and Dee join; Cy is a traveler with no account =====
set role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select public.create_group('Lisbon','CAD','Ann') as g1 \gset
select id as ta from public.travelers where group_id=:'g1' \gset
insert into public.travelers (group_id, name) values (:'g1','Cy') returning id as tc \gset
select invite_code as inv1 from public.groups where id=:'g1' \gset
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select public.join_group(:'inv1', null, 'Bo') \gset
select id as tb from public.travelers where group_id=:'g1' and user_id='cccccccc-0000-0000-0000-000000000002' \gset
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003',false);
select public.join_group(:'inv1', null, 'Dee') \gset
select id as td from public.travelers where group_id=:'g1' and user_id='cccccccc-0000-0000-0000-000000000003' \gset
-- Joiners start as viewers; Ann lets Bo and Dee add things (as the real app does).
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select public.set_member_role(:'g1','cccccccc-0000-0000-0000-000000000002','member');
select public.set_member_role(:'g1','cccccccc-0000-0000-0000-000000000003','member');

-- ===== the table itself is closed to clients =====
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select t.fails(format($$insert into public.payments (group_id, from_id, to_id, amount) values ('%s','%s','%s',5)$$, :'g1', :'tb', :'ta'), 'clients cannot insert payments directly');
select t.fails(format($$update public.payments set amount = 1 where group_id='%s'$$, :'g1'), 'clients cannot update payments directly');
select t.fails(format($$delete from public.payments where group_id='%s'$$, :'g1'), 'clients cannot delete payments directly');

-- ===== Bo (payer) records a PARTIAL payment to Ann =====
select gen_random_uuid() as p1 \gset
select public.save_payment(:'p1', :'g1', format('{"from_id":"%s","to_id":"%s","amount":50.5,"paid_on":"2026-09-20","method":"E-transfer","note":"first half"}', :'tb', :'ta')::jsonb) \gset
select t.ok((select status from public.payments where id=:'p1') = 'pending', 'a payment someone else received starts as pending (sent)');
select t.ok((select created_by from public.payments where id=:'p1') = 'cccccccc-0000-0000-0000-000000000002', 'records who entered it');
select t.ok((select amount||'|'||paid_on||'|'||method||'|'||note from public.payments where id=:'p1') = '50.5000|2026-09-20|E-transfer|first half', 'stores a partial amount, a free date, method and note');
select t.fails(format($$select public.save_payment(gen_random_uuid(),'%s','{"from_id":"%s","to_id":"%s","amount":0}'::jsonb)$$, :'g1', :'tb', :'ta'), 'amount must be positive');
select t.fails(format($$select public.save_payment(gen_random_uuid(),'%s','{"from_id":"%s","to_id":"%s","amount":5}'::jsonb)$$, :'g1', :'tb', :'tb'), 'payer and receiver must differ');
select t.fails(format($$select public.save_payment(gen_random_uuid(),'%s','{"from_id":"%s","to_id":"%s","amount":5,"paid_on":"1999-12-31"}'::jsonb)$$, :'g1', :'tb', :'ta'), 'absurdly old date rejected');
select t.fails(format($$select public.save_payment(gen_random_uuid(),'%s','{"from_id":"%s","to_id":"%s","amount":5,"paid_on":"2099-01-01"}'::jsonb)$$, :'g1', :'tb', :'ta'), 'date far in the future rejected');
select t.ok((select count(*) from public.payments) = 1, 'rejected payments leave nothing behind');

-- ===== confirmation rules =====
select t.fails(format($$select public.confirm_payment('%s')$$, :'p1'), 'the payer cannot confirm (receiver has an account)');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003',false);
select t.fails(format($$select public.confirm_payment('%s')$$, :'p1'), 'another member cannot confirm when the receiver has an account');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select public.confirm_payment(:'p1');
select t.ok((select status||'|'||confirmed_by from public.payments where id=:'p1') = 'confirmed|cccccccc-0000-0000-0000-000000000001', 'the person who was paid confirms it');
select t.ok((select confirmed_at is not null from public.payments where id=:'p1'), 'confirmation is timestamped');

-- receiver with NO account: another member confirms on their behalf; the payer cannot
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003',false);
select gen_random_uuid() as p2 \gset
select public.save_payment(:'p2', :'g1', format('{"from_id":"%s","to_id":"%s","amount":20,"method":"Cash"}', :'td', :'tc')::jsonb) \gset
select t.fails(format($$select public.confirm_payment('%s')$$, :'p2'), 'the payer cannot confirm for a receiver without an account');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select public.confirm_payment(:'p2');
select t.ok((select status||'|'||confirmed_by from public.payments where id=:'p2') = 'confirmed|cccccccc-0000-0000-0000-000000000002', 'another member confirms on behalf of a receiver with no account (and it records who)');
-- the owner may confirm even as payer, so a trip with one account holder is never stuck
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select gen_random_uuid() as p3 \gset
select public.save_payment(:'p3', :'g1', format('{"from_id":"%s","to_id":"%s","amount":9}', :'ta', :'tc')::jsonb) \gset
select public.confirm_payment(:'p3');
select t.ok((select status from public.payments where id=:'p3') = 'confirmed', 'the owner can confirm for a no-account receiver even when paying (so a lone account holder is not stuck)');
-- receiver recording it themselves: confirmed straight away
select gen_random_uuid() as p4 \gset
select public.save_payment(:'p4', :'g1', format('{"from_id":"%s","to_id":"%s","amount":12,"method":"Cash"}', :'tc', :'ta')::jsonb) \gset
select t.ok((select status||'|'||confirmed_by from public.payments where id=:'p4') = 'confirmed|cccccccc-0000-0000-0000-000000000001', 'if the receiver records it, it is confirmed immediately');

-- ===== undo a mistaken tick =====
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003',false);
select t.fails(format($$select public.unconfirm_payment('%s')$$, :'p1'), 'an unrelated member cannot undo a confirmation');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select t.fails(format($$select public.unconfirm_payment('%s')$$, :'p1'), 'the payer cannot undo the receiver''s confirmation');
select public.unconfirm_payment(:'p2');
select t.ok((select status||'|'||(confirmed_by is null)||'|'||(confirmed_at is null) from public.payments where id=:'p2') = 'pending|true|true', 'whoever confirmed it can undo it');
select public.confirm_payment(:'p2');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select public.unconfirm_payment(:'p1');
select t.ok((select status from public.payments where id=:'p1') = 'pending', 'the receiver can undo their own confirmation');
select public.confirm_payment(:'p1');

-- ===== editing =====
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003',false);
select t.fails(format($$select public.save_payment('%s','%s','{"from_id":"%s","to_id":"%s","amount":99}'::jsonb)$$, :'p1', :'g1', :'tb', :'ta'), 'an unrelated member cannot edit');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select t.fails(format($$select public.save_payment('%s','%s','{"from_id":"%s","to_id":"%s","amount":99}'::jsonb)$$, :'p1', :'g1', :'tb', :'ta'), 'a confirmed payment can no longer be edited by the payer');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select public.unconfirm_payment(:'p1');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select public.save_payment(:'p1', :'g1', format('{"from_id":"%s","to_id":"%s","amount":60,"paid_on":"2026-09-21","method":"Bank transfer","note":"corrected"}', :'tb', :'ta')::jsonb);
select t.ok((select amount||'|'||method||'|'||note||'|'||updated_by from public.payments where id=:'p1') = '60.0000|Bank transfer|corrected|cccccccc-0000-0000-0000-000000000002', 'the payer can edit a pending payment; the editor is recorded');
select t.ok((select created_by from public.payments where id=:'p1') = 'cccccccc-0000-0000-0000-000000000002', 'the original author is kept');
-- confirmed payments: the receiver edits and keeps the confirmation; the owner editing the amount sends it back to pending
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select public.confirm_payment(:'p1');
select public.save_payment(:'p1', :'g1', format('{"from_id":"%s","to_id":"%s","amount":58}', :'tb', :'ta')::jsonb);
select t.ok((select status||'|'||amount from public.payments where id=:'p1') = 'confirmed|58.0000', 'when the person who was paid changes the amount, it stays confirmed');
select public.save_payment(:'p1', :'g1', format('{"from_id":"%s","to_id":"%s","amount":57}', :'tb', :'td')::jsonb);
select t.ok((select status from public.payments where id=:'p1') = 'pending', 'changing who is involved sends a confirmed payment back to pending');
select public.save_payment(:'p1', :'g1', format('{"from_id":"%s","to_id":"%s","amount":57}', :'tb', :'ta')::jsonb);
select t.fails(format($$select public.save_payment('%s','%s','{"from_id":"%s","to_id":"%s","amount":1}'::jsonb)$$, :'p1', gen_random_uuid(), :'tb', :'ta'), 'cannot move a payment into another trip');

-- ===== deleting =====
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003',false);
select t.fails(format($$select public.delete_payment('%s')$$, :'p1'), 'an unrelated member cannot delete');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select gen_random_uuid() as p5 \gset
select public.save_payment(:'p5', :'g1', format('{"from_id":"%s","to_id":"%s","amount":5}', :'tb', :'ta')::jsonb) \gset
select public.delete_payment(:'p5');
select t.ok((select count(*) from public.payments where id=:'p5') = 0, 'the person who entered a pending payment can delete it');
select public.confirm_payment(:'p2');  -- already confirmed (idempotent)
select t.fails(format($$select public.delete_payment('%s')$$, :'p2'), 'a confirmed payment cannot be deleted by the payer');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select public.delete_payment(:'p2');
select t.ok((select count(*) from public.payments where id=:'p2') = 0, 'the owner can delete a confirmed payment');

-- ===== outsider and anonymous =====
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000004',false);
select t.ok((select count(*) from public.payments) = 0, 'outsider sees no payments');
select t.fails(format($$select public.save_payment(gen_random_uuid(),'%s','{"from_id":"%s","to_id":"%s","amount":5}'::jsonb)$$, :'g1', :'tb', :'ta'), 'outsider cannot record into the trip');
select t.fails(format($$select public.confirm_payment('%s')$$, :'p3'), 'outsider cannot confirm');
select t.fails(format($$select public.unconfirm_payment('%s')$$, :'p3'), 'outsider cannot undo');
select t.fails(format($$select public.delete_payment('%s')$$, :'p3'), 'outsider cannot delete');
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select t.fails(format($$select public.save_payment(gen_random_uuid(),'%s','{"from_id":"%s","to_id":"%s","amount":5}'::jsonb)$$, :'g1', :'tb', :'ta'), 'anon cannot record');
select t.fails(format($$select public.confirm_payment('%s')$$, :'p3'), 'anon cannot confirm');
select t.fails(format($$select public.unconfirm_payment('%s')$$, :'p3'), 'anon cannot undo');
select t.fails(format($$select public.delete_payment('%s')$$, :'p3'), 'anon cannot delete');
select t.fails($$select public.save_payments_batch('[]'::jsonb)$$, 'anon cannot batch');
select t.fails($$select public.traveler_user(gen_random_uuid())$$, 'internal helper is not callable');
select t.fails('select * from public.contacts', 'anon cannot read contacts');

-- ===== expenses: who added / who edited, unforgeable =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g1', format('{"spent_on":"2026-09-12","vendor":"Hotel","amount":100,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'tb')::jsonb) \gset
select t.ok((select created_by from public.expenses where id=:'e1') = 'cccccccc-0000-0000-0000-000000000002' and (select updated_by is null from public.expenses where id=:'e1'), 'an expense records who added it');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);  -- the owner may fix anyone's expense
select public.save_expense(:'e1', :'g1', format('{"spent_on":"2026-09-12","vendor":"Hotel (fixed)","amount":120,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'tb')::jsonb) \gset
select t.ok((select created_by||'|'||updated_by from public.expenses where id=:'e1') = 'cccccccc-0000-0000-0000-000000000002|cccccccc-0000-0000-0000-000000000001', 'it also records who last edited it and keeps the original author');
update public.expenses set created_by = 'cccccccc-0000-0000-0000-000000000003' where id=:'e1';
select t.ok((select created_by from public.expenses where id=:'e1') = 'cccccccc-0000-0000-0000-000000000002', 'clients cannot rewrite the author');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003',false);
select gen_random_uuid() as e2 \gset
insert into public.expenses (id, group_id, spent_on, amount, currency, payer_id, split_mode, created_by) values (:'e2', :'g1', '2026-09-13', 5, 'CAD', :'ta', 'equal', 'cccccccc-0000-0000-0000-000000000001');
select t.ok((select created_by from public.expenses where id=:'e2') = 'cccccccc-0000-0000-0000-000000000003', 'a forged author on insert is replaced by the real one');

-- ===== batch: one payment across two trips, all or nothing =====
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select public.create_group('Banff','CAD','Ann') as g2 \gset
select id as ta2 from public.travelers where group_id=:'g2' \gset
insert into public.travelers (group_id, name) values (:'g2','Jack') returning id as tj2 \gset
select public.save_payments_batch(format('[{"group_id":"%s","from_id":"%s","to_id":"%s","amount":30,"paid_on":"2026-10-01","method":"E-transfer"},{"group_id":"%s","from_id":"%s","to_id":"%s","amount":20.5,"paid_on":"2026-10-01","method":"E-transfer"}]', :'g1', :'tc', :'ta', :'g2', :'tj2', :'ta2')::jsonb) as batch \gset
select t.ok((select count(*) from public.payments where batch_id is not null) = 2 and (select count(distinct group_id) from public.payments where batch_id is not null) = 2 and (select count(distinct batch_id) from public.payments where batch_id is not null) = 1, 'one batch creates a payment in each trip, tied together');
select t.ok((select bool_and(status = 'confirmed') from public.payments where batch_id is not null), 'payments the receiver records are confirmed straight away');
select t.fails(format($$select public.save_payments_batch('[{"group_id":"%s","from_id":"%s","to_id":"%s","amount":5},{"group_id":"%s","from_id":"%s","to_id":"%s","amount":5}]'::jsonb)$$, :'g1', :'tc', :'ta', :'g2', :'tj2', :'tc'), 'one bad item (a traveler from another trip) cancels the whole batch');
select t.ok((select count(*) from public.payments where amount = 5) = 0, 'nothing from the failed batch was saved');
select t.fails($$select public.save_payments_batch('[]'::jsonb)$$, 'an empty batch is rejected');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select t.fails(format($$select public.save_payments_batch('[{"group_id":"%s","from_id":"%s","to_id":"%s","amount":5}]'::jsonb)$$, :'g2', :'tj2', :'ta2'), 'cannot record into a trip you are not in');

-- ===== contacts: private to their owner =====
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
insert into public.contacts (name) values ('Jack Smith') returning id as c1 \gset
insert into public.contact_travelers (contact_id, traveler_id) values (:'c1', :'tj2');
insert into public.contact_travelers (contact_id, traveler_id) values (:'c1', :'tc');
select t.ok((select count(*) from public.contact_travelers) = 2, 'the same person can be linked across two trips');
-- The People screen saves with an upsert; check that exact statement works under the column-level grants.
insert into public.contacts (name) values ('Jack (renamed)') returning id as c2 \gset
insert into public.contact_travelers (traveler_id, contact_id) values (:'tc', :'c2')
  on conflict (owner_id, traveler_id) do update set contact_id = excluded.contact_id;
select t.ok((select contact_id from public.contact_travelers where traveler_id=:'tc') = :'c2'::uuid, 're-linking a traveler to a different contact (upsert) works');
select t.fails(format($$update public.contact_travelers set traveler_id = '%s' where traveler_id = '%s'$$, :'tb', :'tc'), 'a link cannot be moved to a different traveler');
update public.contacts set name = 'Jack Smith (work)' where id = :'c2';
select t.ok((select name from public.contacts where id=:'c2') = 'Jack Smith (work)', 'a contact can be renamed');
delete from public.contacts where id = :'c2';
select t.ok((select count(*) from public.contact_travelers where traveler_id=:'tc') = 0, 'deleting a contact removes its links (travelers and trips are untouched)');
insert into public.contact_travelers (traveler_id, contact_id) values (:'tc', :'c1');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000002',false);
select t.ok((select count(*) from public.contacts) = 0 and (select count(*) from public.contact_travelers) = 0, 'other members cannot see my contacts');
select t.fails(format($$insert into public.contact_travelers (contact_id, traveler_id) values ('%s','%s')$$, :'c1', :'tb'), 'cannot attach travelers to someone else''s contact');
select t.fails(format($$insert into public.contact_travelers (contact_id, owner_id, traveler_id) values ('%s','cccccccc-0000-0000-0000-000000000001','%s')$$, :'c1', :'tb'), 'cannot write rows as another owner');
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000004',false);
insert into public.contacts (name) values ('Mine') returning id as c9 \gset
select t.fails(format($$insert into public.contact_travelers (contact_id, traveler_id) values ('%s','%s')$$, :'c9', :'tc'), 'cannot link a traveler from a trip I am not in');
select t.ok((select count(*) from public.contacts) = 1, 'I only ever see my own contacts');

-- ===== balance link: payments show status and method, never notes or names =====
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
select public.create_share_link(:'g1', 'Cy', array[:'tc']::uuid[]) as tok \gset
select public.save_payment(gen_random_uuid(), :'g1', format('{"from_id":"%s","to_id":"%s","amount":7,"method":"Cash","note":"PRIVATE-NOTE-XYZ"}', :'tc', :'td')::jsonb) \gset
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select public.get_shared_trip(:'tok') as j \gset
select t.ok((select array_agg(k order by k) from jsonb_object_keys(:'j'::jsonb -> 'payments' -> 0) k) = array['amount','from_id','id','paid_on','status','to_id'], 'a balance link shows only amount, date and status for payments');
select t.ok(position('PRIVATE-NOTE-XYZ' in :'j') = 0 and position('created_by' in :'j') = 0 and position('confirmed_by' in :'j') = 0 and position('method' in :'j') = 0, 'payment notes, methods and who-entered ids never reach a link holder');

-- ===== deleting a trip cleans up =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000001',false);
with d as (delete from public.groups where id=:'g1' returning 1) select count(*) as n from d \gset
select t.ok(:n = 1, 'owner deletes the trip');
reset role;
select t.ok((select count(*) from public.payments where group_id=:'g1') = 0 and (select count(*) from public.contact_travelers ct join public.contacts c on c.id = ct.contact_id where c.name='Jack Smith') = 1, 'payments go with the trip; the other trip''s contact link survives');
