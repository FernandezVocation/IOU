-- 0010: every vault item gets a Description (title "Italo", description "Venice to Florence").
-- Safe to run more than once. Run after 0009.
alter table public.vault_items add column if not exists description text not null default '' check (char_length(description) <= 200);

grant update (type, title, description, starts_on, starts_at, ends_on, ends_at, place, address, website, notes, private) on public.vault_items to authenticated;

-- Read-only links now include the description too.
create or replace function public.get_shared_vault(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.vault_links; v public.vaults; res jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.vault_links where token = p_token and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select * into v from public.vaults where id = l.vault_id;
  select jsonb_build_object(
    'vault', jsonb_build_object('name', v.name, 'icon', v.icon, 'color', v.color),
    'label', l.label,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'type', i.type, 'title', i.title, 'description', i.description, 'starts_on', i.starts_on, 'starts_at', i.starts_at,
        'ends_on', i.ends_on, 'ends_at', i.ends_at, 'place', i.place, 'address', i.address, 'website', i.website, 'notes', i.notes,
        'file_count', (select count(*) from public.vault_files f where f.item_id = i.id))
        order by i.starts_on nulls last, i.starts_at nulls last, i.title)
      from public.vault_items i
      where i.vault_id = l.vault_id and not i.private
        and (l.scope = 'vault' or exists (select 1 from public.vault_link_items li where li.link_id = l.id and li.item_id = i.id))
    ), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.get_shared_vault(text) from public;
grant execute on function public.get_shared_vault(text) to anon, authenticated;

notify pgrst, 'reload schema';
