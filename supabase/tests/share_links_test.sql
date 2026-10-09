-- Balance-link tests. Run after 0001 + 0002 on the stubbed Postgres (see README "Tests").
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
 ('bbbbbbbb-0000-0000-0000-000000000001','owner@x.test','{"name":"Ann"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','member@x.test','{"name":"Bo"}'),
 ('bbbbbbbb-0000-0000-0000-000000000003','outsider@x.test','{"name":"Zed"}');

-- ===== seed: Ann's trip (with a private note, a receipt row, rates, a payment) and Zed's other trip =====
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000001',false);
select public.create_group('Lisbon','CAD','Ann') as g1 \gset
select id as ta from public.travelers where group_id=:'g1' \gset
insert into public.travelers (group_id, name) values (:'g1','Bo-no-account') returning id as tb \gset
insert into public.travelers (group_id, name) values (:'g1','Cy-no-account') returning id as tc \gset
select gen_random_uuid() as e1 \gset
select public.save_expense(:'e1', :'g1', format('{"spent_on":"2026-09-12","vendor":"Hotel","notes":"SECRET-NOTE-DO-NOT-LEAK","amount":400,"currency":"EUR","settled_amount":600,"payer_id":"%s","split_mode":"equal"}', :'ta')::jsonb,
  format('[{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1},{"traveler_id":"%s","value":1}]', :'ta', :'tb', :'tc')::jsonb) \gset
select gen_random_uuid() as e2 \gset
select public.save_expense(:'e2', :'g1', format('{"spent_on":"2026-09-13","vendor":"Dinner","amount":90,"currency":"CAD","payer_id":"%s","split_mode":"percent"}', :'tb')::jsonb,
  format('[{"traveler_id":"%s","value":50},{"traveler_id":"%s","value":50}]', :'ta', :'tb')::jsonb) \gset
insert into public.receipts (expense_id, group_id, path, mime) values (:'e1', :'g1', :'g1' || '/' || :'e1' || '/r.jpg', 'image/jpeg');
insert into public.group_rates (group_id, currency, rate) values (:'g1', 'EUR', 1.5);
select public.save_payment(gen_random_uuid(), :'g1', format('{"from_id":"%s","to_id":"%s","amount":25}', :'tc', :'ta')::jsonb) \gset
select invite_code as invite1 from public.groups where id=:'g1' \gset
select public.join_group(:'invite1', null, 'Bo Member') \gset  -- (as Ann: already a member -> harmless)

select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000003',false);
select public.create_group('Other trip','USD','Zed') as g2 \gset
select id as tz from public.travelers where group_id=:'g2' \gset
select gen_random_uuid() as e9 \gset
select public.save_expense(:'e9', :'g2', format('{"spent_on":"2026-09-01","vendor":"OTHERVENDOR","amount":5,"currency":"USD","payer_id":"%s","split_mode":"equal"}', :'tz')::jsonb, format('[{"traveler_id":"%s","value":1}]', :'tz')::jsonb) \gset

-- ===== creating links =====
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000001',false);
select public.create_share_link(:'g1', 'Bo', array[:'tb']::uuid[]) as tok1 \gset
select t.ok(length(:'tok1') = 48 and :'tok1' ~ '^[0-9a-f]{48}$', 'token is 48 lowercase hex characters');
select public.create_share_link(:'g1', 'Cy', array[:'tc']::uuid[]) as tok2 \gset
select t.ok(:'tok1' <> :'tok2', 'every link gets its own token');
select t.ok((select count(*) from public.share_links where group_id=:'g1') = 2 and (select count(*) from public.share_link_travelers where group_id=:'g1') = 2, 'member can list links and who they cover');
select t.fails(format($$select public.create_share_link('%s','x',array['%s']::uuid[])$$, :'g1', :'tz'), 'cannot attach a traveler from another trip');
select t.fails(format($$select public.create_share_link('%s','x','{}'::uuid[])$$, :'g1'), 'must cover at least one traveler');
select t.fails(format($$select public.create_share_link('%s','   ',array['%s']::uuid[])$$, :'g1', :'tb'), 'link needs a name');
select t.fails(format($$select public.create_share_link('%s','x',array['%s']::uuid[], now() - interval '1 hour')$$, :'g1', :'tb'), 'expiry must be in the future');
select t.fails(format($$insert into public.share_links (group_id,label,token) values ('%s','x','%s')$$, :'g1', repeat('a',48)), 'clients cannot insert links directly');
select t.fails(format($$update public.share_links set token='%s' where group_id='%s'$$, repeat('b',48), :'g1'), 'clients cannot edit tokens');

-- ===== outsider (member of a different trip) =====
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000003',false);
select t.ok((select count(*) from public.share_links) = 0, 'outsider cannot list Lisbon links or tokens');
select t.fails(format($$select public.create_share_link('%s','sneaky',array['%s']::uuid[])$$, :'g1', :'tb'), 'outsider cannot create a link into Lisbon');
with d as (delete from public.share_links where group_id=:'g1' returning 1) select count(*) as n from d \gset
select t.ok(:n = 0, 'outsider cannot turn off Lisbon links');

-- ===== anonymous visitor: no tables, no other functions =====
reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false);
select t.fails('select count(*) from public.groups', 'anon cannot read groups');
select t.fails('select count(*) from public.expenses', 'anon cannot read expenses');
select t.fails('select count(*) from public.share_links', 'anon cannot read share_links (tokens)');
select t.fails('select count(*) from public.profiles', 'anon cannot read profiles');
select t.fails($$select public.create_group('x','CAD','y')$$, 'anon cannot create groups');
select t.fails($$select public.group_preview('abc')$$, 'anon cannot call group_preview');
select t.fails($$select public.is_member(gen_random_uuid())$$, 'anon cannot call is_member');
select t.fails(format($$select public.create_share_link('%s','x',array['%s']::uuid[])$$, :'g1', :'tb'), 'anon cannot create links');
select t.fails(format($$select public.save_expense(gen_random_uuid(),'%s','{}'::jsonb,'[]'::jsonb)$$, :'g1'), 'anon cannot save expenses');
select t.fails($$select * from storage.objects$$, 'anon cannot read storage objects');

-- ===== anonymous visitor with a valid token =====
select public.get_shared_trip(:'tok1') as j \gset
select t.ok(:'j'::jsonb is not null, 'valid token returns the trip');
select t.ok((:'j'::jsonb -> 'group' ->> 'name') = 'Lisbon' and (:'j'::jsonb -> 'group' ->> 'currency') = 'CAD', 'shows trip name and currency');
select t.ok(jsonb_array_length(:'j'::jsonb -> 'expenses') = 2 and jsonb_array_length(:'j'::jsonb -> 'travelers') = 3 and jsonb_array_length(:'j'::jsonb -> 'payments') = 1, 'returns exactly this trip''s expenses, travelers and payments');
select t.ok((:'j'::jsonb -> 'linked' ->> 0)::uuid = :'tb'::uuid and jsonb_array_length(:'j'::jsonb -> 'linked') = 1, 'says which traveler the link is for');
select t.ok((:'j'::jsonb -> 'rates' ->> 'EUR')::numeric = 1.5, 'includes estimate rates');
select t.ok(position('SECRET-NOTE-DO-NOT-LEAK' in :'j') = 0, 'private notes are never returned');
select t.ok(position('OTHERVENDOR' in :'j') = 0 and position(:'g2' in :'j') = 0 and position(:'tz' in :'j') = 0, 'nothing from another trip leaks');
select t.ok(position(:'invite1' in :'j') = 0 and position('invite_code' in :'j') = 0 and position('token' in :'j') = 0, 'invite code and tokens are not returned');
select t.ok(position('owner@x.test' in :'j') = 0 and position('bbbbbbbb-0000' in :'j') = 0 and position('created_by' in :'j') = 0 and position('receipt' in :'j') = 0 and position('/r.jpg' in :'j') = 0, 'no emails, account ids or receipts');
select t.ok((select array_agg(k order by k) from jsonb_object_keys(:'j'::jsonb -> 'expenses' -> 0) k) = array['amount','category','currency','id','location','payer_id','settled_amount','spent_at','spent_on','split_mode','splits','vendor'], 'expense objects contain only the whitelisted fields');
select t.ok(public.get_shared_trip(null) is null, 'null token -> null');
select t.ok(public.get_shared_trip('') is null and public.get_shared_trip('abc') is null and public.get_shared_trip(repeat('z',48)) is null, 'malformed tokens -> null');
select t.ok(public.get_shared_trip(upper(:'tok1')) is null, 'tokens are case-sensitive');
select t.ok(public.get_shared_trip(repeat('0',48)) is null and public.get_shared_trip(substr(:'tok1',1,47) || 'f') is null or substr(:'tok1',48,1) = 'f', 'near-miss tokens -> null');
select t.ok(public.get_shared_trip(:'tok1' || 'a') is null, 'token with extra characters -> null');
select t.ok((public.get_shared_trip(:'tok2') -> 'linked' ->> 0)::uuid = :'tc'::uuid, 'second link speaks for its own traveler');

-- ===== visit counting (once a minute) =====
reset role;
select t.ok((select view_count from public.share_links where token=:'tok1') = 1, 'first view counted (second call within a minute not counted)');
update public.share_links set last_viewed_at = now() - interval '2 minutes' where token=:'tok1';
set role anon; select set_config('request.jwt.claim.sub','',false);
select public.get_shared_trip(:'tok1') is not null as seen \gset
reset role;
select t.ok((select view_count from public.share_links where token=:'tok1') = 2, 'a view after a minute is counted');

-- dump the JSON for the TypeScript shape test
\pset tuples_only on
\pset format unaligned
\o /tmp/shared_shape.json
select public.get_shared_trip(:'tok1');
\o
\pset tuples_only off
\pset format aligned

-- ===== expiry, turning off, cascade =====
set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000001',false);
select public.create_share_link(:'g1', 'Temp', array[:'tb']::uuid[], now() + interval '1 hour') as tokx \gset
reset role;
set role anon; select set_config('request.jwt.claim.sub','',false);
select t.ok(public.get_shared_trip(:'tokx') is not null, 'link before its expiry works');
reset role;
update public.share_links set expires_at = now() - interval '1 second' where token=:'tokx';
set role anon; select set_config('request.jwt.claim.sub','',false);
select t.ok(public.get_shared_trip(:'tokx') is null, 'expired link stops working');

reset role; set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000001',false);
with d as (delete from public.share_links where token=:'tok1' returning 1) select count(*) as n from d \gset
select t.ok(:n = 1, 'member turns a link off');
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
select t.ok(public.get_shared_trip(:'tok1') is null, 'turned-off link stops working immediately');
select t.ok(public.get_shared_trip(:'tok2') is not null, 'other links are unaffected');

reset role; set role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000001',false);
with d as (delete from public.groups where id=:'g1' returning 1) select count(*) as n from d \gset
select t.ok(:n = 1, 'owner deletes the trip');
reset role;
select t.ok((select count(*) from public.share_links where group_id=:'g1') = 0 and (select count(*) from public.share_link_travelers where group_id=:'g1') = 0, 'trip delete removes its links');
set role anon; select set_config('request.jwt.claim.sub','',false);
select t.ok(public.get_shared_trip(:'tok2') is null, 'links of a deleted trip are dead');
reset role;
