-- Expense personal vault (0014). Run after 0001-0014 on the stubbed Postgres (see README "Tests").
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
 ('eeeeeeee-0000-0000-0000-000000000031','ann@x.test','{"name":"Ann"}'),
 ('eeeeeeee-0000-0000-0000-000000000032','ed@x.test','{"name":"Ed"}'),
 ('eeeeeeee-0000-0000-0000-000000000033','eve@x.test','{"name":"Eve"}');
\set ann '''eeeeeeee-0000-0000-0000-000000000031'''
\set ed  '''eeeeeeee-0000-0000-0000-000000000032'''
\set eve '''eeeeeeee-0000-0000-0000-000000000033'''

set role authenticated;
select set_config('request.jwt.claim.sub', :ann, false);
select public.get_or_create_personal_vault() as pa \gset
select public.get_or_create_personal_vault() as pa2 \gset
select t.ok(:'pa' = :'pa2', 'opening My vault twice gives the same vault');
select t.ok((select personal and group_id is null from public.vaults where id=:'pa'::uuid), 'it is flagged personal and not linked to a group');
select t.ok((select role from public.vault_members where vault_id=:'pa'::uuid and user_id=:ann::uuid) = 'owner', 'its creator owns it');
select set_config('request.jwt.claim.sub', :ed, false);
select public.get_or_create_personal_vault() as pe \gset
select t.ok(:'pe' <> :'pa', 'each person gets their own');
select t.ok((select count(*) from public.vaults) = 1, 'and sees only theirs');
select t.fails(format($$select public.join_vault('%s')$$, (select invite_code from public.vaults where id=:'pe'::uuid)), 'nobody can join a personal vault with its invite code');

-- Ed cannot be added to Ann's vault by any path
select set_config('request.jwt.claim.sub', :ann, false);
select t.fails(format($$insert into public.vault_members (vault_id, user_id, role) values ('%s', %L, 'member')$$, :'pa', 'eeeeeeee-0000-0000-0000-000000000032'), 'a second member cannot be added directly');
select public.create_group('Italy','CAD','Ann') as g \gset
select t.fails(format($$select public.link_vault('%s','%s',true)$$, :'pa', :'g'), 'it cannot be linked to a group');
select t.fails(format($$update public.vaults set personal = false where id='%s'$$, :'pa'), 'the personal flag cannot be changed');
select t.ok((select personal from public.vaults where id=:'pa'::uuid), 'and stays personal');

-- items work like any vault, and stay invisible to others
insert into public.vault_items (vault_id, type, title, created_by) values (:'pa', 'document', 'Insurance card', :ann::uuid) returning id as ins \gset
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok((select count(*) from public.vault_items where id=:'ins') = 0, 'another person cannot see its items');
select t.fails(format($$insert into public.vault_items (vault_id, title, created_by) values ('%s','Sneaky', %L)$$, :'pa', 'eeeeeeee-0000-0000-0000-000000000032'), 'or add to it');

-- a shared itinerary item can point at a personal vault item; only the owner can use the link
select set_config('request.jwt.claim.sub', :ann, false);
select public.create_itinerary('Trip') as it \gset
insert into public.itinerary_items (itinerary_id, title, vault_item_id, created_by) values (:'it', 'Flight', :'ins', :ann::uuid) returning id as ii \gset
select t.ok((select vault_item_id = :'ins'::uuid from public.itinerary_items where id=:'ii'), 'the owner links an itinerary item to a personal vault item');
select t.ok(public.v_can_see_item(:'ins'::uuid), 'and can see it');
select set_config('request.jwt.claim.sub', :ed, false);
select t.ok(not public.v_can_see_item(:'ins'::uuid), 'nobody else can');
-- the guards hold even for a privileged writer (the triggers, not just permissions)
reset role;
select t.fails(format($$insert into public.vault_members (vault_id, user_id, role) values ('%s', %L, 'member')$$, :'pa', 'eeeeeeee-0000-0000-0000-000000000032'), 'the guard refuses a second member even without permission checks');
select t.fails(format($$update public.vaults set personal = false where id='%s'$$, :'pa'), 'the guard refuses to change the personal flag even without permission checks');
select t.fails(format($$update public.vaults set group_id = '%s' where id='%s'$$, :'g', :'pa'), 'the guard refuses to link a personal vault to a group even without permission checks');
