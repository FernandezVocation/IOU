-- Vault item description. Run after 0001-0010 on the stubbed Postgres (see README "Tests").
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
select t.ok(exists (select 1 from information_schema.columns where table_name='vault_items' and column_name='description' and data_type='text'), 'vault items have a description column');
select t.ok((select column_default from information_schema.columns where table_name='vault_items' and column_name='description') like '''''%', 'it defaults to empty, so older items stay valid');
select t.ok(has_column_privilege('authenticated','public.vault_items','description','UPDATE'), 'signed-in users can edit it (row rules still decide whose)');
select t.ok(pg_get_functiondef('public.get_shared_vault(text)'::regprocedure) like '%''description'', i.description%', 'read-only links carry the description');
select t.ok(not has_function_privilege('anon','public.get_shared_vault(text)','EXECUTE') = false, 'the link function stays open to visitors');
