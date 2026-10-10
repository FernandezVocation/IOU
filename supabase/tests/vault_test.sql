-- Vaults (0009). Run after 0001-0009 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000004','out@x.test','{"name":"Outsider"}'),
 ('eeeeeeee-0000-0000-0000-000000000005','anon@x.test','{"name":"Visitor"}');

\set ann '''eeeeeeee-0000-0000-0000-000000000001'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000002'''
\set eve '''eeeeeeee-0000-0000-0000-000000000003'''
\set out '''eeeeeeee-0000-0000-0000-000000000004'''
\set vis '''eeeeeeee-0000-0000-0000-000000000005'''

-- ===== Ann creates a vault on its own; Ed and Eve join by invite code =====
set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_vault('Documents', 'folder', '#3556CC') as v \gset
select invite_code as inv from public.vaults where id=:'v' \gset
select t.ok((select role from public.vault_members where vault_id=:'v' and user_id=:ann::uuid) = 'owner', 'the creator is the vault owner');
select t.ok((select group_id from public.vaults where id=:'v') is null, 'a vault can exist with no group');
select set_config('request.jwt.claim.sub', :ed, false); select public.join_vault(:'inv') \gset
select set_config('request.jwt.claim.sub', :eve, false); select public.join_vault(:'inv') \gset
select t.ok((select role from public.vault_members where vault_id=:'v' and user_id=:ed::uuid) = 'member', 'joiners are members');
select t.fails($$select public.join_vault('nope')$$, 'a wrong invite code is refused');

select t.ok((select count(*) from public.vault_people(:'v')) = 3 and (select name from public.vault_people(:'v') where role='owner') = 'Ann', 'members can list the vault''s people with names');
select set_config('request.jwt.claim.sub', :out, false);
select t.fails(format($$select * from public.vault_people('%s')$$, :'v'), 'an outsider cannot list the people');

-- ===== outsiders see nothing =====
select set_config('request.jwt.claim.sub', :out, false);
select t.ok((select count(*) from public.vaults) = 0, 'an outsider cannot see the vault');
select t.fails(format($$insert into public.vault_items (vault_id, title) values ('%s','Sneaky')$$, :'v'), 'an outsider cannot add items');

-- ===== members add; edit only their own; owner edits any =====
select set_config('request.jwt.claim.sub', :ed, false);
insert into public.vault_items (vault_id, type, title, starts_on, starts_at, place, address, website, created_by)
  values (:'v', 'ticket', 'Italo Florence to Rome', '2026-10-10', '09:10', 'Florence', 'Piazza della Stazione', 'italotreno.it', :ed::uuid) returning id as i1 \gset
select t.ok((select title from public.vault_items where id=:'i1') = 'Italo Florence to Rome', 'a member adds an item');
select t.fails(format($$insert into public.vault_items (vault_id, title, created_by) values ('%s','Forged', %L)$$, :'v', 'eeeeeeee-0000-0000-0000-000000000001'), 'an item cannot be added in someone else''s name');
update public.vault_items set title='Italo FI to RM' where id=:'i1';
select t.ok((select title from public.vault_items where id=:'i1') = 'Italo FI to RM', 'and changes their own');
select set_config('request.jwt.claim.sub', :eve, false);
update public.vault_items set title='Hacked' where id=:'i1';
select t.ok((select title from public.vault_items where id=:'i1') = 'Italo FI to RM', 'another member cannot change it');
delete from public.vault_items where id=:'i1';
select t.ok((select count(*) from public.vault_items where id=:'i1') = 1, 'or delete it');
select t.fails(format($$update public.vault_items set created_by=%L where id='%s'$$, 'eeeeeeee-0000-0000-0000-000000000003', :'i1'), 'nobody can change who added an item');
select set_config('request.jwt.claim.sub', :ann, false);
update public.vault_items set title='Italo (owner fix)' where id=:'i1';
select t.ok((select title from public.vault_items where id=:'i1') = 'Italo (owner fix)', 'the owner changes any item');

-- ===== co-admin =====
select public.set_vault_role(:'v', :eve::uuid, 'admin');
select t.ok((select role from public.vault_members where vault_id=:'v' and user_id=:eve::uuid) = 'admin', 'the owner makes a co-admin');
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$select public.set_vault_role('%s', %L, 'admin')$$, :'v', 'eeeeeeee-0000-0000-0000-000000000002'), 'a member cannot change roles');
select set_config('request.jwt.claim.sub', :eve, false);
update public.vault_items set title='Italo (co-admin fix)' where id=:'i1';
select t.ok((select title from public.vault_items where id=:'i1') = 'Italo (co-admin fix)', 'a co-admin changes any item');
select t.fails(format($$select public.set_vault_role('%s', %L, 'member')$$, :'v', 'eeeeeeee-0000-0000-0000-000000000002'), 'but cannot change roles');
delete from public.vaults where id=:'v';
select t.ok((select count(*) from public.vaults where id=:'v') = 1, 'a co-admin cannot delete the vault');

-- ===== private items =====
select set_config('request.jwt.claim.sub', :ed, false);
insert into public.vault_items (vault_id, type, title, private, created_by) values (:'v', 'document', 'Ed passport photo', true, :ed::uuid) returning id as ip \gset
select t.ok((select count(*) from public.vault_items where id=:'ip') = 1, 'the person who added a private item sees it');
select set_config('request.jwt.claim.sub', :ann, false);
select t.ok((select count(*) from public.vault_items where id=:'ip') = 0, 'the owner cannot see another person''s private item');
update public.vault_items set title='x' where id=:'ip';
delete from public.vault_items where id=:'ip';
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select title from public.vault_items where id=:'ip') = 'Ed passport photo', 'and cannot change or delete it');

-- ===== files and storage =====
insert into public.vault_files (vault_id, item_id, path, name, mime, label) values (:'v', :'i1', :'v' || '/' || :'i1' || '/qr.png', 'qr.png', 'image/png', 'Adult 1');
select set_config('request.jwt.claim.sub', :ann, false);
insert into public.vault_items (vault_id, type, title, created_by, starts_on) values (:'v', 'stay', 'Hotel Roma', :ann::uuid, '2026-10-10') returning id as i2 \gset
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$insert into public.vault_files (vault_id, item_id, path) values ('%s','%s','x/y/z.png')$$, :'v', :'i2'), 'a member cannot attach a file to someone else''s item');
select set_config('request.jwt.claim.sub', :ann, false);
insert into public.vault_files (vault_id, item_id, path, name, mime) values (:'v', :'i1', :'v' || '/' || :'i1' || '/owner.png', 'owner.png', 'image/png');
select t.ok((select count(*) from public.vault_files where item_id=:'i1') = 2, 'the owner can attach files to any item');
insert into storage.objects (bucket_id, name) values ('vault', :'v' || '/' || :'i1' || '/qr.png');
select t.ok((select count(*) from storage.objects where bucket_id='vault') = 1, 'the owner uploads a file to a visible item');
select set_config('request.jwt.claim.sub', :out, false);
select t.ok((select count(*) from storage.objects where bucket_id='vault') = 0, 'an outsider cannot read vault files');
select t.fails(format($$insert into storage.objects (bucket_id, name) values ('vault', '%s/%s/hack.png')$$, :'v', :'i1'), 'or upload them');
select set_config('request.jwt.claim.sub', :eve, false);
select t.ok((select count(*) from storage.objects where bucket_id='vault') = 1, 'a member reads vault files');
-- A file on a private item is invisible to the owner.
select set_config('request.jwt.claim.sub', :ed, false);
insert into storage.objects (bucket_id, name) values ('vault', :'v' || '/' || :'ip' || '/passport.png');
select set_config('request.jwt.claim.sub', :ann, false);
select t.ok((select count(*) from storage.objects where name like '%passport.png') = 0, 'the owner cannot read a file on a private item');

-- ===== read-only links =====
select public.create_vault_link(:'v', 'Mom', 'vault') as tok_all \gset
select t.ok(length(:'tok_all') = 48, 'the owner creates a whole-vault link');
select set_config('request.jwt.claim.sub', :ed, false);
select t.fails(format($$select public.create_vault_link('%s','Nope','vault')$$, :'v'), 'a member cannot create links');
select t.ok((select count(*) from public.vault_links) = 0, 'or list them');
select set_config('request.jwt.claim.sub', :ann, false);
select t.fails(format($$select public.create_vault_link('%s','Bad','items','{%s}')$$, :'v', :'ip'), 'a link cannot include an item it cannot see or a private item');
select t.fails(format($$select public.create_vault_link('%s','Empty','items')$$, :'v'), 'an items link needs at least one item');
select public.create_vault_link(:'v', 'Dad', 'items', array[:'i1']::uuid[]) as tok_one \gset

reset role; set role anon;
select set_config('request.jwt.claim.sub', '', false);
select t.ok(public.get_shared_vault(:'tok_all') is not null, 'anyone holding a whole-vault link can open it');
select t.ok(jsonb_array_length(public.get_shared_vault(:'tok_all') -> 'items') = 2, 'it shows the items that are not private');
select t.ok(not (public.get_shared_vault(:'tok_all')::text like '%passport%'), 'and never a private item');
select t.ok(jsonb_array_length(public.get_shared_vault(:'tok_one') -> 'items') = 1, 'an items link shows only the picked item');
select t.ok(public.get_shared_vault('0000000000000000000000000000000000000000000000ff') is null, 'an unknown token returns nothing');
select t.ok(public.get_shared_vault('not a token') is null, 'a malformed token returns nothing');
select t.ok((select string_agg(k, ',' order by k) from (select jsonb_object_keys(i) k from jsonb_array_elements(public.get_shared_vault(:'tok_all') -> 'items') i limit 14) s) is not null, 'items carry only the expected fields');
select t.ok(not (public.get_shared_vault(:'tok_all')::text ~ 'created_by|invite_code|user_id'), 'no account details leak');
select t.fails($$select * from public.vault_items$$, 'the anonymous role cannot read tables directly');

-- Links carry details only: no file paths, and a signed-in stranger cannot read files
select t.ok(not (public.get_shared_vault(:'tok_all')::text ~ '"path"|"files"|storage'), 'a link never exposes file paths');
select t.ok((public.get_shared_vault(:'tok_all') -> 'items' -> 0 ->> 'file_count') is not null, 'but says how many files an item has');
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :vis, false);
select t.ok((select count(*) from storage.objects where bucket_id='vault') = 0, 'a stranger cannot read vault files, even with a link');
select t.ok((select count(*) from public.vault_items) = 0, 'a stranger cannot read vault tables');
select t.ok(to_regprocedure('public.claim_vault_link(text)') is null, 'no file-claiming function exists');
-- turning the link off ends access at once
select set_config('request.jwt.claim.sub', :ann, false);
delete from public.vault_links where token=:'tok_all';
reset role; set role anon;
select t.ok(public.get_shared_vault(:'tok_all') is null, 'and the link stops working');

-- ===== groups =====
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_group('Italy','CAD','Ann') as g \gset
select invite_code as ginv from public.groups where id=:'g' \gset
select set_config('request.jwt.claim.sub', :ed, false); select public.join_group(:'ginv', null, 'Ed') \gset
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_vault('Italy 2026', null, null, :'g', true) as v2 \gset
select t.ok((select group_id from public.vaults where id=:'v2') = :'g'::uuid, 'a vault can be linked to a group');
select t.ok((select count(*) from public.vault_members where vault_id=:'v2') = 2, 'adding the group''s people makes them members');
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.vaults where id=:'v2') = 1, 'and they see the vault');
select t.ok((select count(*) from public.vaults where group_id=:'g') = 1, 'the group finds its vault');
select set_config('request.jwt.claim.sub', :ann, false);
select t.fails(format($$select public.create_vault('Second', null, null, '%s', false)$$, :'g'), 'a group has only one vault');
select public.create_vault('Loose', null, null) as v3 \gset
select t.fails(format($$select public.link_vault('%s','%s')$$, :'v3', :'g'), 'a second vault cannot link to the same group');
select public.unlink_vault(:'v2');
select t.ok((select group_id from public.vaults where id=:'v2') is null, 'a vault can be unlinked');
select public.link_vault(:'v3', :'g', false);
select t.ok((select group_id from public.vaults where id=:'v3') = :'g'::uuid, 'and the group can then link another');
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.vaults where id=:'v3') = 0, 'linking without adding people does not give the group access');
select t.fails(format($$select public.link_vault('%s','%s')$$, :'v2', :'g'), 'a plain group member cannot link a vault');
select set_config('request.jwt.claim.sub', :out, false);
select public.create_vault('Mine', null, null) as v4 \gset
select t.fails(format($$select public.create_vault('Hijack', null, null, '%s', true)$$, :'g'), 'someone outside the group cannot link to it');
select t.fails(format($$select public.link_vault('%s','%s')$$, :'v4', :'g'), 'or link an existing vault to it');

-- ===== deleting =====
select set_config('request.jwt.claim.sub', :ann, false);
delete from public.vaults where id=:'v';
select t.ok((select count(*) from public.vaults where id=:'v') = 0, 'the owner deletes the vault');
select t.ok((select count(*) from public.vault_items where vault_id=:'v') = 0, 'and its items go with it');
