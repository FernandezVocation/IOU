-- Itineraries (0012). Run after 0001-0012 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000001','ann@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000002','ed@x.test','{"name":"Ed"}'),
 ('eeeeeeee-0000-0000-0000-000000000003','eve@x.test','{"name":"Eve"}'),
 ('eeeeeeee-0000-0000-0000-000000000004','out@x.test','{"name":"Outsider"}');

\set ann '''eeeeeeee-0000-0000-0000-000000000001'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000002'''
\set eve '''eeeeeeee-0000-0000-0000-000000000003'''
\set out '''eeeeeeee-0000-0000-0000-000000000004'''

-- ===== standalone itinerary; Ed and Eve join by invite code =====
set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_itinerary('Italy 2026', 'plane', '#3556CC') as it \gset
select invite_code as inv from public.itineraries where id=:'it' \gset
select t.ok((select role from public.itinerary_members where itinerary_id=:'it' and user_id=:ann::uuid) = 'owner', 'the creator is the owner');
select t.ok((select group_id is null and vault_id is null from public.itineraries where id=:'it'), 'an itinerary can exist with no group and no vault');
select t.fails($$select public.create_itinerary('   ')$$, 'a name is required');
select set_config('request.jwt.claim.sub', :ed, false); select public.join_itinerary(:'inv') \gset
select set_config('request.jwt.claim.sub', :eve, false); select public.join_itinerary(:'inv') \gset
select t.ok((select role from public.itinerary_members where itinerary_id=:'it' and user_id=:ed::uuid) = 'member', 'joiners are members');
select t.fails($$select public.join_itinerary('nope')$$, 'a wrong invite code is refused');
select t.ok((select count(*) from public.itinerary_people(:'it')) = 3 and (select name from public.itinerary_people(:'it') where role='owner') = 'Ann', 'members can list the people with names');
select set_config('request.jwt.claim.sub', :out, false);
select t.fails(format($$select * from public.itinerary_people('%s')$$, :'it'), 'an outsider cannot list the people');
select t.ok((select count(*) from public.itineraries) = 0, 'an outsider sees no itineraries');
select t.fails(format($$insert into public.itinerary_items (itinerary_id, title) values ('%s','Sneaky')$$, :'it'), 'an outsider cannot add items');

-- ===== members add; edit only their own; owner edits any =====
select set_config('request.jwt.claim.sub', :ed, false);
insert into public.itinerary_items (itinerary_id, category, subtype, title, description, vendor, starts_on, starts_at, ends_on, ends_at, from_place, to_place, notes, people, created_by)
  values (:'it', 'transport', 'train', 'Italo', 'Venice to Florence', 'Italo (NTV)', '2026-10-10', '09:10', '2026-10-10', '11:40', 'Venezia Santa Lucia', 'Firenze S. M. Novella', 'Coach 4 seat 12A', '{Ann,Ed,Nonna}', :ed::uuid) returning id as i1 \gset
select t.ok((select title from public.itinerary_items where id=:'i1') = 'Italo', 'a member adds an item');
select t.fails(format($$insert into public.itinerary_items (itinerary_id, title, created_by) values ('%s','Forged', %L)$$, :'it', 'eeeeeeee-0000-0000-0000-000000000001'), 'an item cannot be added in someone else''s name');
select t.fails(format($$insert into public.itinerary_items (itinerary_id, title, category) values ('%s','Odd','spaceship')$$, :'it'), 'an unknown category is refused');
select t.fails(format($$insert into public.itinerary_items (itinerary_id, title, description) values ('%s','Long', repeat('x',201))$$, :'it'), 'a description over 200 characters is refused');
update public.itinerary_items set title='Italo FI-RM' where id=:'i1';
select t.ok((select title from public.itinerary_items where id=:'i1') = 'Italo FI-RM', 'and changes their own');
select set_config('request.jwt.claim.sub', :eve, false);
update public.itinerary_items set title='Hacked' where id=:'i1';
select t.ok((select title from public.itinerary_items where id=:'i1') = 'Italo FI-RM', 'another member cannot change it');
delete from public.itinerary_items where id=:'i1';
select t.ok((select count(*) from public.itinerary_items where id=:'i1') = 1, 'or delete it');
select set_config('request.jwt.claim.sub', :ann, false);
update public.itinerary_items set title='Italo Venice-Florence' where id=:'i1';
select t.ok((select title from public.itinerary_items where id=:'i1') = 'Italo Venice-Florence', 'the owner changes any item');
select t.fails($$update public.itinerary_items set created_by = null where id = (select id from public.itinerary_items limit 1)$$, 'who added an item cannot be changed');
select t.fails($$update public.itinerary_items set itinerary_id = gen_random_uuid() where id = (select id from public.itinerary_items limit 1)$$, 'an item cannot be moved to another itinerary');

-- ===== only-me items =====
select set_config('request.jwt.claim.sub', :ed, false);
insert into public.itinerary_items (itinerary_id, title, private, created_by) values (:'it', 'Surprise gift', true, :ed::uuid) returning id as ip \gset
select t.ok((select count(*) from public.itinerary_items where id=:'ip') = 1, 'the author sees their only-me item');
select set_config('request.jwt.claim.sub', :ann, false);
select t.ok((select count(*) from public.itinerary_items where id=:'ip') = 0, 'the owner does not see it');
update public.itinerary_items set title='Peek' where id=:'ip';
delete from public.itinerary_items where id=:'ip';
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select title from public.itinerary_items where id=:'ip') = 'Surprise gift', 'and cannot change or delete it');

-- ===== roles =====
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$select public.set_itinerary_role('%s', %L, 'admin')$$, :'it', 'eeeeeeee-0000-0000-0000-000000000003'), 'a member cannot change roles');
select set_config('request.jwt.claim.sub', :ann, false);
select public.set_itinerary_role(:'it', :eve::uuid, 'admin');
select t.ok((select role from public.itinerary_members where itinerary_id=:'it' and user_id=:eve::uuid) = 'admin', 'the owner makes a co-admin');
select t.fails(format($$select public.set_itinerary_role('%s', %L, 'owner')$$, :'it', 'eeeeeeee-0000-0000-0000-000000000003'), 'ownership cannot be handed out this way');
select set_config('request.jwt.claim.sub', :eve, false);
update public.itinerary_items set vendor='Italo' where id=:'i1';
select t.ok((select vendor from public.itinerary_items where id=:'i1') = 'Italo', 'a co-admin changes any item they can see');
update public.itinerary_items set title='Peek' where id=:'ip';
select t.ok((select count(*) from public.itinerary_items where id=:'ip') = 0, 'but not another person''s only-me item');
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$select public.create_itinerary_link('%s','Mom','itinerary')$$, :'it'), 'a member cannot create links');
select set_config('request.jwt.claim.sub', :eve, false);
delete from public.itinerary_members where itinerary_id=:'it' and user_id=:ann::uuid;
select t.ok((select count(*) from public.itinerary_members where itinerary_id=:'it' and role='owner') = 1, 'a co-admin cannot remove the owner');
delete from public.itineraries where id=:'it';
select t.ok((select count(*) from public.itineraries where id=:'it') = 1, 'only the owner deletes an itinerary');

-- ===== linking to a group and a vault =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_group('Italy','CAD','Ann') as g \gset
select invite_code as ginv from public.groups where id=:'g' \gset
select set_config('request.jwt.claim.sub', :ed, false); select public.join_group(:'ginv', null, 'Ed') \gset
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_vault('Italy docs', null, null, :'g', true) as v \gset
select public.create_itinerary('Linked', null, null, :'g', :'v', true) as it2 \gset
select t.ok((select group_id = :'g'::uuid and vault_id = :'v'::uuid from public.itineraries where id=:'it2'), 'an itinerary links to a group and a vault');
select t.ok((select count(*) from public.itinerary_members where itinerary_id=:'it2') = 2, 'adding the group''s people makes them members');
select public.create_itinerary('Second trip', null, null, :'g', :'v', false) as it3 \gset
select t.ok((select count(*) from public.itineraries where group_id=:'g') = 2, 'a group may have more than one itinerary');
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$select public.create_itinerary('Nope', null, null, '%s')$$, :'g'), 'a plain group member cannot link a group');
select set_config('request.jwt.claim.sub', :out, false);
select t.fails(format($$select public.create_itinerary('Nope', null, null, null, '%s')$$, :'v'), 'someone outside the vault cannot link it');
select set_config('request.jwt.claim.sub', :ann, false);
select public.unlink_itinerary_group(:'it3');
select public.unlink_itinerary_vault(:'it3');
select t.ok((select group_id is null and vault_id is null from public.itineraries where id=:'it3'), 'links can be removed');
select public.link_itinerary_group(:'it3', :'g'::uuid, false);
select public.link_itinerary_vault(:'it3', :'v'::uuid);
select t.ok((select group_id = :'g'::uuid and vault_id = :'v'::uuid from public.itineraries where id=:'it3'), 'and added later');
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$select public.unlink_itinerary_group('%s')$$, :'it2'), 'a member cannot change the links');

-- ===== linking an item to a vault item =====
select set_config('request.jwt.claim.sub', :ann, false);
insert into public.vault_items (vault_id, type, title, created_by) values (:'v', 'ticket', 'Italo ticket', :ann::uuid) returning id as vt \gset
insert into public.vault_items (vault_id, type, title, private, created_by) values (:'v', 'document', 'Ann passport', true, :ann::uuid) returning id as vp \gset
insert into public.itinerary_items (itinerary_id, title, vault_item_id, created_by) values (:'it2', 'Train', :'vt', :ann::uuid) returning id as ii \gset
select t.ok((select vault_item_id = :'vt'::uuid from public.itinerary_items where id=:'ii'), 'an item links to a vault item the author can see');
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$insert into public.itinerary_items (itinerary_id, title, vault_item_id, created_by) values ('%s','Peek', '%s', %L)$$, :'it2', :'vp', 'eeeeeeee-0000-0000-0000-000000000002'), 'an item cannot link a vault item the author cannot see');
update public.itinerary_items set notes='edited by Ed' where id=:'ii';
select t.ok((select vault_item_id = :'vt'::uuid from public.itinerary_items where id=:'ii'), 'editing leaves an existing link alone');
select set_config('request.jwt.claim.sub', :ann, false);
delete from public.vault_items where id=:'vt';
select t.ok((select vault_item_id is null from public.itinerary_items where id=:'ii'), 'deleting the vault item just unlinks the itinerary item');

-- ===== read-only links =====
select set_config('request.jwt.claim.sub', :ann, false);
insert into public.itinerary_items (itinerary_id, title, notes, vault_item_id, people, created_by) values (:'it2', 'Hotel', 'door code 4321', null, '{Ann}', :ann::uuid) returning id as ih \gset
insert into public.itinerary_items (itinerary_id, title, private, created_by) values (:'it2', 'Secret', true, :ann::uuid) returning id as is2 \gset
insert into public.vault_items (vault_id, type, title, created_by) values (:'v', 'ticket', 'Hotel voucher', :ann::uuid) returning id as vh \gset
update public.itinerary_items set vault_item_id=:'vh' where id=:'ih';
select public.create_itinerary_link(:'it2', 'Mom', 'itinerary') as tok_all \gset
select public.create_itinerary_link(:'it2', 'Driver', 'items', array[:'ih']::uuid[], true) as tok_one \gset
select t.fails(format($$select public.create_itinerary_link('%s','Bad','items','{%s}')$$, :'it2', :'is2'), 'a link cannot include an only-me item');
select t.fails(format($$select public.create_itinerary_link('%s','Empty','items')$$, :'it2'), 'an items link needs at least one item');
select t.fails(format($$select public.create_itinerary_link('%s','Past','itinerary','{}',false,now() - interval '1 day')$$, :'it2'), 'an expiry in the past is refused');
select t.ok((select count(*) from public.itinerary_links where itinerary_id=:'it2') = 2, 'the owner sees the links');
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.itinerary_links) = 0, 'a member does not see link tokens');
select t.fails(format($$select public.create_itinerary_link('%s','Mom','itinerary')$$, :'it2'), 'a member cannot create links');
reset role; set role anon;
select t.ok(public.get_shared_itinerary(:'tok_all') is not null, 'anyone holding a whole-itinerary link can open it');
select t.ok(jsonb_array_length(public.get_shared_itinerary(:'tok_all') -> 'items') = 2, 'it shows items that are not only-me');
select t.ok(not (public.get_shared_itinerary(:'tok_all')::text like '%Secret%'), 'and never an only-me item');
select t.ok(not (public.get_shared_itinerary(:'tok_all')::text like '%4321%'), 'notes are left out by default');
select t.ok((public.get_shared_itinerary(:'tok_one') -> 'items' -> 0 ->> 'notes') = 'door code 4321', 'notes appear when the link includes them');
select t.ok(jsonb_array_length(public.get_shared_itinerary(:'tok_one') -> 'items') = 1, 'an items link shows only the picked item');
select t.ok((public.get_shared_itinerary(:'tok_one') -> 'items' -> 0 ->> 'has_ticket') = 'true', 'a linked item only shows that a ticket exists');
select t.ok(not (public.get_shared_itinerary(:'tok_one')::text ~ 'vault_item_id|created_by|invite_code|user_id|path'), 'no vault ids or account details leak');
select t.ok(public.get_shared_itinerary('0000000000000000000000000000000000000000000000ff') is null, 'an unknown token returns nothing');
select t.ok(public.get_shared_itinerary('not a token') is null, 'a malformed token returns nothing');
select t.fails($$select * from public.itinerary_items$$, 'anonymous visitors cannot read tables');
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
delete from public.itinerary_links where token = :'tok_all';
reset role; set role anon;
select t.ok(public.get_shared_itinerary(:'tok_all') is null, 'turning a link off ends access at once');
reset role; update public.itinerary_links set expires_at = now() - interval '1 minute' where token = :'tok_one';
select t.ok(public.get_shared_itinerary(:'tok_one') is null, 'an expired link returns nothing');
reset role;
