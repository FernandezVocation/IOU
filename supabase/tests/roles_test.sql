-- Roles and read-only links. Run after 0001-0005 on the stubbed Postgres (see README "Tests").
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
 ('dddddddd-0000-0000-0000-000000000001','owner@x.test','{"name":"Ann"}'),
 ('dddddddd-0000-0000-0000-000000000002','editor@x.test','{"name":"Ed"}'),
 ('dddddddd-0000-0000-0000-000000000003','editor2@x.test','{"name":"Eve"}'),
 ('dddddddd-0000-0000-0000-000000000004','viewer@x.test','{"name":"Vic"}'),
 ('dddddddd-0000-0000-0000-000000000005','visitor@x.test','{"name":"Anon"}');

-- ===== Ann owns Italy; Ed, Eve, Cora join =====
set role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000001',false);
select public.create_group('Italy','CAD','Ann') as g \gset
select id as ta from public.travelers where group_id=:'g' \gset
insert into public.travelers (group_id, name) values (:'g','Sam-no-account') returning id as ts \gset
insert into public.travelers (group_id, name) values (:'g','Lee-no-account') returning id as tl \gset
select invite_code as inv from public.groups where id=:'g' \gset
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000002',false); select public.join_group(:'inv', null, 'Ed') \gset
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000003',false); select public.join_group(:'inv', null, 'Eve') \gset
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000004',false); select public.join_group(:'inv', null, 'Cora') \gset
select id as te from public.travelers where group_id=:'g' and user_id='dddddddd-0000-0000-0000-000000000002' \gset
select id as tcora from public.travelers where group_id=:'g' and user_id='dddddddd-0000-0000-0000-000000000004' \gset

select t.ok((select role from public.group_members where group_id=:'g' and user_id='dddddddd-0000-0000-0000-000000000004') = 'member', 'people who join through the invite link are members, not view-only');
select t.ok((select role from public.group_members where group_id=:'g' and user_id='dddddddd-0000-0000-0000-000000000001') = 'owner', 'the creator is the owner');

-- ===== members: add anything, change only their own =====
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000002',false);
select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-01","vendor":"Trevi","notes":"NOTE-TREVI","amount":1400,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'te')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te', :'ts')::jsonb) \gset
select t.ok((select vendor from public.expenses where id=:'e1') = 'Trevi', 'a member adds an expense');
select public.save_expense(:'e1', :'g', format('{"spent_on":"2026-10-01","vendor":"Trevi Fountain","notes":"NOTE-TREVI","amount":1400,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'te')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te', :'ts')::jsonb) \gset
select t.ok((select vendor from public.expenses where id=:'e1') = 'Trevi Fountain', 'and fixes their own');
select public.save_payment(gen_random_uuid(), :'g', format('{"from_id":"%s","to_id":"%s","amount":10}', :'ts', :'te')::jsonb) \gset
select t.ok((select count(*) from public.payments where group_id=:'g') = 1, 'a member records a payment');
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000003',false);
select t.fails(format($$select public.save_expense('%s','%s','{"spent_on":"2026-10-01","vendor":"Mine now","amount":1400,"currency":"CAD","payer_id":"%s","split_mode":"equal"}'::jsonb,'[{"traveler_id":"%s","value":1}]'::jsonb)$$, :'e1', :'g', :'te', :'ta'), 'a member cannot rewrite an expense someone else added');
update public.expenses set vendor='Hacked' where id=:'e1';
delete from public.expenses where id=:'e1';
select t.ok((select vendor from public.expenses where id=:'e1') = 'Trevi Fountain', 'nor edit or delete it directly');
select t.ok(not public.can_modify_expense(:'e1'), 'can_modify_expense says no');
select t.ok((select count(*) from public.expenses where group_id=:'g') = 1, 'but a member can read everything');
select t.fails(format($$select public.set_member_role('%s','dddddddd-0000-0000-0000-000000000004','admin')$$, :'g'), 'a member cannot promote anyone, themselves included');
select t.fails(format($$select public.create_share_link('%s','x',array['%s']::uuid[])$$, :'g', :'ts'), 'a member cannot create a read-only link');
select t.fails(format($$select public.rotate_invite_code('%s')$$, :'g'), 'a member cannot replace the invite link');
delete from public.groups where id=:'g';
select t.ok((select count(*) from public.groups where id=:'g') = 1, 'a member cannot delete the group');
select gen_random_uuid() as e2 \gset
select public.save_expense(:'e2', :'g', format('{"spent_on":"2026-10-02","vendor":"Vatican","notes":"NOTE-VATICAN","amount":700,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ts')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te', :'ts')::jsonb) \gset
select t.ok((select vendor from public.expenses where id=:'e2') = 'Vatican', 'another member adds their own expense');

-- ===== the owner makes Cora a co-admin =====
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000001',false);
select t.fails(format($$select public.set_member_role('%s','dddddddd-0000-0000-0000-000000000002','viewer')$$, :'g'), 'view-only is no longer a level');
select t.fails(format($$select public.set_member_role('%s','dddddddd-0000-0000-0000-000000000001','member')$$, :'g'), 'the owner cannot be demoted');
select public.set_member_role(:'g','dddddddd-0000-0000-0000-000000000004','admin');
select t.ok((select role from public.group_members where group_id=:'g' and user_id='dddddddd-0000-0000-0000-000000000004') = 'admin', 'the owner can make someone a co-admin');

-- ===== co-admin: anything the owner can, except the owner =====
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000004',false);
select public.save_expense(:'e2', :'g', format('{"spent_on":"2026-10-02","vendor":"Vatican (co-admin fix)","notes":"NOTE-VATICAN","amount":700,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ts')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te', :'ts')::jsonb) \gset
select t.ok((select vendor from public.expenses where id=:'e2') = 'Vatican (co-admin fix)', 'a co-admin edits anyone''s expense');
select t.ok((select created_by from public.expenses where id=:'e2') = 'dddddddd-0000-0000-0000-000000000003', '...and the original author is kept');
update public.expenses set vendor='Trevi (co-admin)' where id=:'e1';
select t.ok((select vendor from public.expenses where id=:'e1') = 'Trevi (co-admin)', 'including directly');
select public.set_member_role(:'g','dddddddd-0000-0000-0000-000000000003','admin');
select public.set_member_role(:'g','dddddddd-0000-0000-0000-000000000003','member');
select t.ok((select role from public.group_members where group_id=:'g' and user_id='dddddddd-0000-0000-0000-000000000003') = 'member', 'a co-admin can change other people''s level');
select t.fails(format($$select public.set_member_role('%s','dddddddd-0000-0000-0000-000000000001','member')$$, :'g'), 'a co-admin cannot demote the owner');
delete from public.group_members where group_id=:'g' and user_id='dddddddd-0000-0000-0000-000000000001';
select t.ok((select count(*) from public.group_members where group_id=:'g' and role='owner') = 1, 'a co-admin cannot remove the owner');
delete from public.group_members where group_id=:'g' and user_id='dddddddd-0000-0000-0000-000000000003';
select t.ok((select count(*) from public.group_members where group_id=:'g' and user_id='dddddddd-0000-0000-0000-000000000003') = 0, 'a co-admin can remove an ordinary member');
delete from public.groups where id=:'g';
select t.ok((select count(*) from public.groups where id=:'g') = 1, 'a co-admin cannot delete the group');
select public.rotate_invite_code(:'g') as newcode \gset
select t.ok(:'newcode' <> :'inv', 'a co-admin can replace the invite link');
update public.groups set name='Italy 2026' where id=:'g';
select t.ok((select name from public.groups where id=:'g') = 'Italy 2026', 'and rename the group');

-- ===== read-only links: the owner decides the scope =====
select public.create_share_link(:'g', 'Whole group', '{}'::uuid[], null, 'group') as tg \gset
select public.create_share_link(:'g', 'Sam', array[:'ts']::uuid[], null, 'person') as tp \gset
select t.ok((select scope from public.share_links where token=:'tg') = 'group' and (select count(*) from public.share_link_travelers where group_id=:'g') = 1, 'a group link needs no people; a person link needs at least one');
select t.fails(format($$select public.create_share_link('%s','none','{}'::uuid[],null,'person')$$, :'g'), 'a person link with nobody is refused');
select t.fails(format($$select public.create_share_link('%s','bad','{}'::uuid[],null,'everything')$$, :'g'), 'unknown scope is refused');
set role anon;
select public.get_shared_trip(:'tg') as jg \gset
select public.get_shared_trip(:'tp') as jp \gset
select t.ok(jsonb_array_length(:'jg'::jsonb -> 'expenses') = 2 and (:'jg'::jsonb ->> 'scope') = 'group' and jsonb_array_length(:'jg'::jsonb -> 'travelers') = 6, 'group link: every expense and every person');
select t.ok(position('NOTE-TREVI' in :'jg') > 0 and position('NOTE-VATICAN' in :'jg') > 0, 'group link: every expense comes with its notes');
select t.ok(position('created_by' in :'jg') = 0 and position('owner@x.test' in :'jg') = 0 and position(:'inv' in :'jg') = 0 and position(:'newcode' in :'jg') = 0, 'group link: still no account details or invite code');
-- Sam paid Vatican (700, split 3 ways: Ann, Ed, Sam) and is in Trevi (1400, paid by Ed, split Ann/Ed/Sam)
select t.ok((:'jp'::jsonb ->> 'scope') = 'person' and jsonb_array_length(:'jp'::jsonb -> 'expenses') = 2, 'person link: Sam''s two expenses');
select t.ok(not exists (select 1 from jsonb_array_elements(:'jp'::jsonb -> 'travelers') x where x ->> 'name' = 'Lee-no-account'), 'person link: people unrelated to Sam are not even named');
-- Trevi was paid by Ed: Ann's and Ed's own rows are folded into Ed's row so Ann's share is not visible
select (:'jp'::jsonb -> 'expenses') as pe \gset
select t.ok((select jsonb_array_length(x -> 'splits') from jsonb_array_elements(:'pe'::jsonb) x where x ->> 'vendor' like 'Trevi%') = 2, 'person link: for an expense someone else paid, other people''s rows are folded into the payer''s');
select t.ok((select x ->> 'split_mode' from jsonb_array_elements(:'pe'::jsonb) x where x ->> 'vendor' like 'Trevi%') = 'shares', '...and equal splits become shares so Sam''s share stays exact');
select t.ok((select jsonb_array_length(x -> 'splits') from jsonb_array_elements(:'pe'::jsonb) x where x ->> 'vendor' like 'Vatican%') = 3, 'person link: for an expense Sam paid, he sees who owes him');

-- Sam's computed share of Trevi is 1400/3, from rows: Sam 1, Ed 2 (= Ann + Ed)
select t.ok((select sum((s ->> 'value')::numeric) from jsonb_array_elements(:'pe'::jsonb) x, jsonb_array_elements(x -> 'splits') s where x ->> 'vendor' like 'Trevi%') = 3, 'shares add back up to the original 3 people');

-- ===== exact / percent splits do not leak other people's amounts =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000001',false);
select gen_random_uuid() as e4 \gset
select public.save_expense(:'e4', :'g', format('{"spent_on":"2026-10-03","vendor":"Ann-and-Ed-only","notes":"NOTE-NOT-SAMS","amount":40,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te')::jsonb) \gset
select gen_random_uuid() as e3 \gset
select public.save_expense(:'e3', :'g', format('{"spent_on":"2026-10-03","vendor":"Dinner","amount":100,"currency":"CAD","payer_id":"%s","split_mode":"exact"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":10},{"traveler_id":"%s","value":30},{"traveler_id":"%s","value":60}]', :'ts', :'te', :'ta')::jsonb) \gset
set role anon;
select get_shared_trip as jp2 from public.get_shared_trip(:'tp') \gset
select t.ok(position('NOTE-TREVI' in :'jp2') > 0 and position('NOTE-VATICAN' in :'jp2') > 0, 'person link: notes on the person''s own expenses are included');
select t.ok(position('NOTE-NOT-SAMS' in :'jp2') = 0 and position('Ann-and-Ed-only' in :'jp2') = 0, 'person link: notes on other people''s expenses never are');
select t.ok((select s ->> 'value' from jsonb_array_elements(:'jp2'::jsonb -> 'expenses') x, jsonb_array_elements(x -> 'splits') s where x ->> 'vendor' = 'Dinner' and s ->> 'traveler_id' = :'ts')::numeric = 10, 'exact split: Sam sees his own 10');
select t.ok((select count(*) from jsonb_array_elements(:'jp2'::jsonb -> 'expenses') x, jsonb_array_elements(x -> 'splits') s where x ->> 'vendor' = 'Dinner') = 2 and (select sum((s ->> 'value')::numeric) from jsonb_array_elements(:'jp2'::jsonb -> 'expenses') x, jsonb_array_elements(x -> 'splits') s where x ->> 'vendor' = 'Dinner') = 100 and position(:'te' in (select x::text from jsonb_array_elements(:'jp2'::jsonb -> 'expenses') x where x ->> 'vendor' = 'Dinner')) = 0, 'exact split: Ed''s 30 is not visible anywhere (Ann paid: Sam''s 10, and the other 90 folded into Ann''s row)');

-- ===== anonymous visitor, receipts, and turning a link off =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000001',false);
insert into public.receipts (expense_id, group_id, path, mime) values (:'e2', :'g', :'g' || '/' || :'e2' || '/r.jpg', 'image/jpeg');
set role anon;
select get_shared_trip as jg2 from public.get_shared_trip(:'tg') \gset
select t.ok(position('/r.jpg' in :'jg2') > 0, 'group link lists receipt files');
select get_shared_trip as jp3 from public.get_shared_trip(:'tp') \gset
select t.ok(position('/r.jpg' in :'jp3') = 0 and position('receipt' in :'jp3') = 0, 'person link never lists receipts');
reset role; set role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000005',false);
select t.ok(not public.viewer_link_can_read_receipt(:'g' || '/' || :'e2' || '/r.jpg'), 'a stranger cannot read receipts before opening a link');
select t.ok(public.claim_share_link(:'tg'), 'opening a group link registers the visitor');
select t.ok(public.viewer_link_can_read_receipt(:'g' || '/' || :'e2' || '/r.jpg'), '...and lets them read that group''s receipt files');
select t.ok(not public.viewer_link_can_read_receipt('00000000-0000-0000-0000-000000000000/x.jpg'), '...but not another group''s');
select t.ok(not public.claim_share_link(:'tp'), 'a person link does not grant receipt access');
select t.ok(not public.claim_share_link('0000000000000000000000000000000000000000dead'), 'a made-up token is refused');
select t.ok((select count(*) from public.expenses) = 0, 'the visitor still cannot read tables directly');
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000001',false);
delete from public.share_links where token=:'tg';
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000005',false);
select t.ok(not public.viewer_link_can_read_receipt(:'g' || '/' || :'e2' || '/r.jpg'), 'turning the link off ends receipt access at once');
-- only the owner can see or remove links
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000002',false);
select t.ok((select count(*) from public.share_links) = 0, 'members cannot list links (the tokens are secrets)');
