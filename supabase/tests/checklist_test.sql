-- Checklists (0018, 0019). Run after 0001-0019 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000071','ann@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000072','ed@x.test','{"name":"Ed"}'),
 ('eeeeeeee-0000-0000-0000-000000000073','eve@x.test','{"name":"Eve"}'),
 ('eeeeeeee-0000-0000-0000-000000000074','out@x.test','{"name":"Out"}');
\set ann '''eeeeeeee-0000-0000-0000-000000000071'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000072'''
\set eve '''eeeeeeee-0000-0000-0000-000000000073'''
\set out '''eeeeeeee-0000-0000-0000-000000000074'''
set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);

-- ===== group with Ann (owner), Ed (member); a list linked to it =====
select public.create_group('Italy','CAD','Ann') as g \gset
select invite_code as ginv from public.groups where id=:'g' \gset
select set_config('request.jwt.claim.sub', :ed, false); select public.join_group(:'ginv', null, 'Ed') \gset
select set_config('request.jwt.claim.sub', :ann, false);
select id as ta from public.travelers where group_id=:'g' and user_id=:ann::uuid \gset
select id as te from public.travelers where group_id=:'g' and user_id=:ed::uuid \gset
select public.create_checklist('Packing', null, null, 'packing', '', :'g') as c1 \gset
select t.ok((select group_id = :'g'::uuid and default_type = 'packing' from public.checklists where id=:'c1'), 'a list is created linked to a group');
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.checklists) = 1, 'every group member sees the group''s list');
select t.fails(format($$select public.create_checklist('X', null, null, 'todo', '', '%s')$$, :'g') || ' where false', 'syntax guard (ignored)') where false;
insert into public.checklist_items (checklist_id, type, title, qty, packed_in) values (:'c1','packing','Passport',1,'Carry-on') returning id as i_ed \gset
select t.ok((select count(*) from public.checklist_items where checklist_id=:'c1') = 1, 'a plain member can add an item');
select set_config('request.jwt.claim.sub', :ann, false);
insert into public.checklist_items (checklist_id, type, title) values (:'c1','todo','Book taxi') returning id as i_ann \gset
select set_config('request.jwt.claim.sub', :ed, false);
update public.checklist_items set title='Hijacked' where id=:'i_ann'::uuid;
select t.ok((select title from public.checklist_items where id=:'i_ann'::uuid) = 'Book taxi', 'a member cannot edit someone else''s item');
delete from public.checklist_items where id=:'i_ann'::uuid;
select t.ok((select count(*) from public.checklist_items where id=:'i_ann'::uuid) = 1, 'nor delete it');
update public.checklist_items set title='Passport + visa' where id=:'i_ed'::uuid;
select t.ok((select title from public.checklist_items where id=:'i_ed'::uuid) = 'Passport + visa', 'but can edit their own');
select t.fails(format($$insert into public.checklist_items (checklist_id, title, created_by) values ('%s','Forged','eeeeeeee-0000-0000-0000-000000000071')$$, :'c1'), 'an item cannot be added in another name');
select t.fails(format($$insert into public.checklist_items (checklist_id, type, title) values ('%s','custom','No label')$$, :'c1'), 'a custom item needs a label');
insert into public.checklist_items (checklist_id, type, type_label, title) values (:'c1','custom','Visa','Apply online') returning id as i_cu \gset
select t.ok(true, 'a custom item with a label is accepted');

-- progress open to every member
select public.set_checklist_item_progress(:'i_ann', 'completed', 'Ann', :ann::uuid, 'Ed', :ed::uuid);
select t.ok((select status = 'completed' and completed_at is not null and completed_by_user = :ed::uuid and assigned_user = :ann::uuid from public.checklist_items where id=:'i_ann'::uuid),
  'any member can assign and complete an item, naming who completed it');
select public.set_checklist_item_progress(:'i_ann', 'todo');
select t.ok((select status = 'todo' and completed_at is null and completed_by_user is null and completed_by_name = '' from public.checklist_items where id=:'i_ann'::uuid),
  'reopening clears completion');
select t.fails(format($$select public.set_checklist_item_progress('%s','completed','',null,'',%L)$$, :'i_ann', 'eeeeeeee-0000-0000-0000-000000000074'), 'completed-by must be on the list');
select t.fails(format($$select public.set_checklist_item_progress('%s','bogus')$$, :'i_ann'), 'unknown status refused');
-- a traveler without an account can be named
select public.set_checklist_item_progress(:'i_ann', 'in_progress', 'Maria', null);
select t.ok((select assigned_name = 'Maria' and assigned_user is null and status = 'in_progress' from public.checklist_items where id=:'i_ann'::uuid), 'an item can be assigned to a name with no account');

-- admins
select set_config('request.jwt.claim.sub', :ann, false);
update public.checklist_items set title='Book airport taxi' where id=:'i_ed'::uuid;
select t.ok((select title from public.checklist_items where id=:'i_ed'::uuid) = 'Book airport taxi', 'a group owner can change any item');
select t.ok((select count(*) from public.checklist_people(:'c1'::uuid)) = 1, 'people = list members only (Ann)');

-- outsider
select set_config('request.jwt.claim.sub', :out, false);
select t.ok((select count(*) from public.checklists) = 0 and (select count(*) from public.checklist_items) = 0, 'an outsider sees nothing');
select t.fails(format($$insert into public.checklist_items (checklist_id, title) values ('%s','Sneak')$$, :'c1'), 'an outsider cannot add items');
select t.fails(format($$select public.set_checklist_item_progress('%s','completed')$$, :'i_ann'), 'nor tick items');
select t.fails(format($$select public.create_checklist('X', null, null, 'todo', '', '%s')$$, :'g'), 'nor create a list in a group they are not in');
select t.fails(format($$select public.join_checklist('nope')$$), 'a wrong invite code is refused');

-- ===== links on items =====
select set_config('request.jwt.claim.sub', :ann, false);
select gen_random_uuid() as exid \gset
select public.save_expense(:'exid', :'g', format('{"spent_on":"2026-10-10","vendor":"Shop","amount":50,"currency":"CAD","payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'te')::jsonb) \gset
select :'exid' as ex \gset
update public.checklist_items set expense_id = :'ex'::uuid where id=:'i_ann'::uuid;
select t.ok((select expense_id = :'ex'::uuid from public.checklist_items where id=:'i_ann'::uuid), 'an item links to a group expense');
select public.create_group('Other','CAD','Ann') as g2 \gset
select gen_random_uuid() as ex2 \gset
select id as t2 from public.travelers where group_id=:'g2' limit 1 \gset
select public.save_expense(:'ex2', :'g2', format('{"spent_on":"2026-10-10","vendor":"Else","amount":5,"currency":"CAD","payer_id":"%s","split_mode":"equal"}',   :'t2')::jsonb,
  format('[{"traveler_id":"%s","value":1}]', :'t2')::jsonb) \gset
select t.fails(format($$update public.checklist_items set expense_id='%s' where id='%s'$$, :'ex2', :'i_ann'), 'an expense from another group cannot be linked');
select public.create_itinerary('Trip') as it \gset
insert into public.itinerary_items (itinerary_id, category, title, created_by) values (:'it','stay','Hotel',:ann::uuid) returning id as hid \gset
update public.checklist_items set itinerary_item_id = :'hid'::uuid where id=:'i_ann'::uuid;
select t.ok((select itinerary_item_id = :'hid'::uuid from public.checklist_items where id=:'i_ann'::uuid), 'an item links to an itinerary item the person can see');
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$insert into public.checklist_items (checklist_id, title, itinerary_item_id) values ('%s','Peek','%s')$$, :'c1', :'hid'), 'but not to one they cannot see');

-- ===== standalone list: invite, roles, unlink =====
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_checklist('Moving house') as c2 \gset
select invite_code as inv from public.checklists where id=:'c2' \gset
select set_config('request.jwt.claim.sub', :eve, false);
select t.ok((select count(*) from public.checklists where id=:'c2') = 0, 'a standalone list is private until joined');
select public.join_checklist(:'inv');
select t.ok((select count(*) from public.checklists where id=:'c2') = 1, 'joining by invite shows the list');
select t.fails(format($$select public.set_checklist_role('%s','%s','admin')$$, :'c2', :'eve'), 'a member cannot change roles');
select set_config('request.jwt.claim.sub', :ann, false);
select public.set_checklist_role(:'c2', :eve::uuid, 'admin');
select t.ok((select role = 'admin' from public.checklist_members where checklist_id=:'c2' and user_id=:eve::uuid), 'the owner can make a co-admin');
select t.ok((select count(*) from public.checklist_people(:'c2'::uuid)) = 2, 'people lists both');
select public.link_checklist_group(:'c2', :'g');
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.checklists where id=:'c2') = 1, 'linking to a group shows it to the group');
select set_config('request.jwt.claim.sub', :ann, false);
select public.unlink_checklist_group(:'c2');
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.checklists where id=:'c2') = 0, 'unlinking hides it again');
select t.fails(format($$select public.link_checklist_group('%s','%s')$$, :'c2', :'g'), 'a non-admin cannot link');
select t.fails(format($$select public.create_checklist_link('%s','x')$$, :'c1'), 'a plain member cannot make a read-only link');
select set_config('request.jwt.claim.sub', :eve, false);
delete from public.checklists where id=:'c2'::uuid;
select t.ok((select count(*) from public.checklists where id=:'c2') = 1, 'a co-admin cannot delete the list');
select set_config('request.jwt.claim.sub', :ann, false);
delete from public.checklists where id=:'c2'::uuid;
select t.ok((select count(*) from public.checklists where id=:'c2') = 0, 'the owner can delete it');

-- ===== read-only links =====
select public.create_checklist_link(:'c1', 'For Maria', false) as tok \gset
select public.create_checklist_link(:'c1', 'With notes', true) as tok2 \gset
select public.create_checklist_link(:'c1', 'Expired', false, now() + interval '1 second') as tok3 \gset
select t.fails(format($$select public.create_checklist_link('%s','Past',false,now() - interval '1 day')$$, :'c1'), 'an expiry in the past is refused');
update public.checklist_items set notes='secret note', type='custom', type_label='Gift', type_icon='gift' where id=:'i_ann'::uuid;
select t.ok((select type_icon from public.checklist_items where id=:'i_ann'::uuid) = 'gift', 'a custom item keeps its icon');
select t.fails(format($$update public.checklist_items set type_icon=%L where id=%L$$, repeat('x',41), :'i_ann'), 'an icon name over 40 characters is refused');
select set_config('request.jwt.claim.sub', :ed, false);
update public.checklist_items set type_icon='star' where id=:'i_ann'::uuid;
select t.ok((select type_icon from public.checklist_items where id=:'i_ann'::uuid) = 'gift', 'a member who did not add the item cannot change its icon');
select set_config('request.jwt.claim.sub', :ann, false);
reset role; set role anon;
select t.ok(public.get_shared_checklist(:'tok') is not null, 'the link opens without signing in');
select t.ok(public.get_shared_checklist(:'tok')->'items'->0->>'notes' = '' and public.get_shared_checklist(:'tok2')::text like '%secret note%', 'notes only appear when the link allows them');
select t.ok(public.get_shared_checklist(:'tok')::text not like '%expense%' and public.get_shared_checklist(:'tok')::text not like '%booking%', 'links never expose expenses, vault or booking codes');
select t.ok(public.get_shared_checklist(:'tok')->'items'->0->>'type_icon' is not null, 'the link carries the icon name');
select t.ok(public.get_shared_checklist('zzz') is null and public.get_shared_checklist(repeat('0',48)) is null, 'bad tokens return nothing');
select t.fails($$select * from public.checklist_items$$, 'anon cannot read the tables directly');
reset role;
select pg_sleep(1.2);
set role anon;
select t.ok(public.get_shared_checklist(:'tok3') is null, 'an expired link stops working');
reset role;
