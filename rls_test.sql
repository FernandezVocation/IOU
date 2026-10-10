-- Isolation + rules test. Needs a Postgres with the Supabase auth/storage stubs (see README "Testing the database").
\set ON_ERROR_STOP off
\set QUIET on
create schema if not exists t;
create or replace function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'PASS: %', label; else raise warning 'FAIL: %', label; end if; end $$;
create or replace function t.fails(q text, label text) returns void language plpgsql as $$
begin execute q; raise warning 'FAIL (should have errored): %', label;
exception when others then raise notice 'PASS: % [%]', label, sqlerrm; end $$;
grant usage on schema t to authenticated;
grant execute on all functions in schema t to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001','ann@x.test','{"name":"Ann"}'),
 ('aaaaaaaa-0000-0000-0000-000000000002','bo@x.test','{"name":"Bo"}'),
 ('aaaaaaaa-0000-0000-0000-000000000003','cy@x.test','{}'),
 ('aaaaaaaa-0000-0000-0000-000000000004','di@x.test','{}');
select t.ok((select count(*) from public.profiles) = 4, 'profile auto-created for each new user');
select t.ok((select display_name from public.profiles where id='aaaaaaaa-0000-0000-0000-000000000003') = 'cy', 'display name falls back to email prefix');

set role authenticated;

-- ===== Ann creates the Paris group =====
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
select public.create_group('Paris','cad','Ann') as g1 \gset
select t.ok((select currency from public.groups where id=:'g1') = 'CAD', 'currency upper-cased on create');
select t.ok((select count(*) from public.group_members where group_id=:'g1' and role='owner') = 1, 'creator is owner');
select id as ta from public.travelers where group_id=:'g1' \gset
insert into public.travelers (group_id, name) values (:'g1','Cy-no-account') returning id as tc \gset
select t.fails($$insert into public.travelers (group_id, name, user_id) values ('$$||:'g1'||$$','Sneaky','aaaaaaaa-0000-0000-0000-000000000002')$$, 'cannot set traveler.user_id directly');
select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g1',
  format('{"spent_on":"2026-10-01","vendor":"Dinner","amount":100,"currency":"EUR","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'tc')::jsonb) \gset
select t.ok((select count(*) from public.expense_splits where expense_id=:'e1') = 2, 'expense saved with 2 splits');
select t.fails(format($$select public.save_expense(gen_random_uuid(), '%s', '{"spent_on":"2026-10-01","amount":0,"currency":"EUR","payer_id":"%s","split_mode":"equal"}'::jsonb, '[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'g1', :'ta', :'ta'), 'amount must be > 0');
select t.fails(format($$select public.save_expense(gen_random_uuid(), '%s', '{"spent_on":"2026-10-01","amount":5,"currency":"EUR","payer_id":"%s","split_mode":"equal"}'::jsonb, '[]'::jsonb)$$, :'g1', :'ta'), 'needs at least one split');
-- edit: replace the split (update path)
select public.save_expense(:'e1', :'g1',
  format('{"spent_on":"2026-10-01","vendor":"Dinner","amount":100,"currency":"EUR","settled_amount":151.2,"payer_id":"%s","split_mode":"percent"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":70},{"traveler_id":"%s","value":30}]', :'ta', :'tc')::jsonb) \gset
select t.ok((select count(*) from public.expense_splits where expense_id=:'e1') = 2 and (select split_mode from public.expenses where id=:'e1')='percent' and (select settled_amount from public.expenses where id=:'e1')=151.2, 'edit replaces split and stores settled amount');
select t.fails(format($$update public.groups set currency='USD' where id='%s'$$, :'g1'), 'currency locked once expenses exist');
select invite_code as code1 from public.groups where id=:'g1' \gset
insert into storage.objects (bucket_id, name) values ('receipts', :'g1' || '/' || :'e1' || '/a.jpg');
select t.ok((select count(*) from storage.objects) = 1, 'member can upload receipt to own group folder');
select t.fails($$insert into storage.objects (bucket_id, name) values ('receipts','not-a-uuid/x.jpg')$$, 'junk storage path rejected');

-- ===== Bo creates a different group and tries to reach Paris =====
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002',false);
select t.ok((select count(*) from public.groups) = 0, 'Bo sees no groups yet');
select t.ok((select count(*) from public.expenses) = 0 and (select count(*) from public.travelers) = 0 and (select count(*) from public.expense_splits) = 0, 'Bo sees none of Ann''s rows');
select t.ok((select count(*) from public.profiles where id <> 'aaaaaaaa-0000-0000-0000-000000000002') = 0, 'Bo cannot read other profiles');
select public.create_group('Banff','CAD','Bo') as g2 \gset
select id as tb2 from public.travelers where group_id=:'g2' \gset
select t.ok((select count(*) from public.groups) = 1, 'Bo sees only his own group');
select t.fails(format($$select public.save_expense(gen_random_uuid(), '%s', '{"spent_on":"2026-10-01","amount":5,"currency":"CAD","payer_id":"%s","split_mode":"equal"}'::jsonb, '[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'g1', :'ta', :'ta'), 'non-member cannot save expense into Paris');
select t.fails(format($$insert into public.expenses (group_id, spent_on, amount, currency, payer_id, split_mode) values ('%s','2026-10-01',5,'CAD','%s','equal')$$, :'g1', :'ta'), 'non-member cannot insert directly (RLS)');
select t.fails(format($$select public.save_expense('%s', '%s', '{"spent_on":"2026-10-01","amount":1,"currency":"CAD","payer_id":"%s","split_mode":"equal"}'::jsonb, '[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'e1', :'g2', :'tb2', :'tb2'), 'cannot overwrite Ann''s expense id via own group');
with u as (update public.groups set name='pwned' where id=:'g1' returning 1) select count(*) as n from u \gset
select t.ok(:n = 0, 'non-member cannot rename Paris');
with d as (delete from public.expenses where id=:'e1' returning 1) select count(*) as n from d \gset
select t.ok(:n = 0, 'non-member cannot delete Ann''s expense');
select t.ok((select count(*) from storage.objects) = 0, 'non-member cannot see Paris receipts');
select t.fails(format($$insert into storage.objects (bucket_id, name) values ('receipts','%s/x/b.jpg')$$, :'g1'), 'non-member cannot upload into Paris folder');
select t.fails(format($$select public.save_expense(gen_random_uuid(), '%s', '{"spent_on":"2026-10-01","amount":5,"currency":"CAD","payer_id":"%s","split_mode":"equal"}'::jsonb, '[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'g2', :'ta', :'tb2'), 'cannot use another group''s traveler as payer (composite FK)');
select t.fails(format($$select public.rotate_invite_code('%s')$$, :'g1'), 'non-member cannot rotate Paris code');

-- ===== Invite flow =====
select t.ok(public.group_preview('nonsense') is null, 'preview of unknown code is null');
select t.ok((public.group_preview(:'code1')->>'name') = 'Paris' and (public.group_preview(:'code1')->>'already_member')::boolean = false, 'preview shows group name before joining');
select t.ok(jsonb_array_length(public.group_preview(:'code1')->'travelers') = 1, 'preview lists only unclaimed travelers');
select t.fails($$select public.join_group('wrongcode')$$, 'wrong code rejected');
select public.join_group(upper(:'code1'), :'tc') as joined \gset
select t.ok(:'joined' = :'g1', 'Bo joins Paris, claiming the Cy-no-account traveler (code case-insensitive)');
select t.ok((select count(*) from public.expenses where group_id=:'g1') = 1, 'Bo now sees Paris expenses');
select t.ok((select count(*) from storage.objects) = 1, 'Bo now sees Paris receipts');
select t.ok((select count(*) from public.profiles) = 2, 'Bo can now read co-members'' profiles only');
select t.ok(public.join_group(:'code1') = :'g1', 'joining twice is harmless');
with u as (update public.groups set name='pwned' where id=:'g1' returning 1) select count(*) as n from u \gset
select t.ok(:n = 0, 'plain member cannot rename the group');
select t.fails(format($$select public.rotate_invite_code('%s')$$, :'g1'), 'plain member cannot rotate invite code');
with d as (delete from public.groups where id=:'g1' returning 1) select count(*) as n from d \gset
select t.ok(:n = 0, 'plain member cannot delete the group');

-- ===== Cy claims the same traveler: must fail and leave no membership =====
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000003',false);
select t.fails(format($$select public.join_group('%s', '%s')$$, :'code1', :'tc'), 'cannot claim an already-claimed traveler');
select t.ok((select count(*) from public.groups) = 0, 'failed claim leaves no membership behind');
select public.join_group(:'code1', null, 'Cy Two') \gset
select t.ok((select name from public.travelers where group_id=:'g1' and user_id='aaaaaaaa-0000-0000-0000-000000000003') = 'Cy Two', 'joiner can create a new traveler instead');

-- ===== Owner powers =====
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
select public.rotate_invite_code(:'g1') as code2 \gset
select t.ok(:'code2' <> :'code1', 'owner rotated the invite code');
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000004',false);
select t.ok(public.group_preview(:'code1') is null and public.group_preview(:'code2') is not null, 'old code dead, new code works');
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
select t.fails(format($$delete from public.group_members where group_id='%s' and user_id='aaaaaaaa-0000-0000-0000-000000000001'$$, :'g1'), 'sole owner cannot leave');
select public.save_payment(gen_random_uuid(), :'g1', format('{"from_id":"%s","to_id":"%s","amount":10}', :'tc', :'ta')::jsonb) \gset
select t.fails(format($$select public.save_payment(gen_random_uuid(), '%s', '{"from_id":"%s","to_id":"%s","amount":5}'::jsonb)$$, :'g1', :'ta', :'ta'), 'cannot pay yourself');
select t.fails(format($$delete from public.travelers where id='%s'$$, :'ta'), 'cannot delete a traveler who is on expenses');
select public.create_group('Empty','USD','Ann') as g3 \gset
update public.groups set currency='EUR' where id=:'g3';
select t.ok((select currency from public.groups where id=:'g3') = 'EUR', 'owner can change currency before any expense');
with d as (delete from public.group_members where group_id=:'g1' and user_id='aaaaaaaa-0000-0000-0000-000000000002' returning 1) select count(*) as n from d \gset
select t.ok(:n = 1, 'owner can remove a member');
select t.ok((select user_id from public.travelers where id=:'tc') is null and (select name from public.travelers where id=:'tc') is not null, 'removed member''s traveler stays on the books, unlinked');
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002',false);
select t.ok((select count(*) from public.expenses where group_id=:'g1') = 0, 'removed member loses access immediately');
select t.ok((select count(*) from storage.objects) = 0, 'removed member loses receipt access');

-- ===== Group delete cascades =====
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
with d as (delete from public.groups where id=:'g1' returning 1) select count(*) as n from d \gset
select t.ok(:n = 1, 'owner can delete the group');
reset role;
select t.ok((select count(*) from public.expenses where group_id=:'g1') = 0 and (select count(*) from public.expense_splits where group_id=:'g1') = 0 and (select count(*) from public.payments where group_id=:'g1') = 0 and (select count(*) from public.travelers where group_id=:'g1') = 0, 'group delete cascades to every table');
