-- IOU 0014: a personal vault ("My vault") for things too private for a group vault: insurance, passports, tickets.
--   vaults.personal   true for one vault per person, created the first time they open it (get_or_create_personal_vault).
-- A personal vault has exactly one member, its owner. Nobody can join it, it cannot be linked to a group, and the
-- flag cannot be changed afterwards. Everything else works as in any vault (items, files, Add to itinerary, links the
-- owner chooses to make). An itinerary item can still point at a personal vault item: only the owner can see it.
-- Run AFTER 0009-0013. Safe to run more than once.

alter table public.vaults add column if not exists personal boolean not null default false;
create unique index if not exists vaults_one_personal_per_person on public.vaults (created_by) where personal;

-- One member only, whatever path tries to add another (join link, linking a group with "add everyone", direct insert).
create or replace function public.guard_personal_vault() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'vault_members' then
    if exists (select 1 from public.vaults v where v.id = new.vault_id and v.personal)
       and exists (select 1 from public.vault_members m where m.vault_id = new.vault_id and m.user_id <> new.user_id) then
      raise exception 'A personal vault is only for its owner.' using errcode = '42501';
    end if;
  else
    if new.personal and new.group_id is not null then raise exception 'A personal vault cannot be linked to a group.' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and new.personal is distinct from old.personal then raise exception 'A vault cannot become personal or stop being personal.' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
drop trigger if exists vault_members_personal on public.vault_members;
create trigger vault_members_personal before insert on public.vault_members for each row execute function public.guard_personal_vault();
drop trigger if exists vaults_personal on public.vaults;
create trigger vaults_personal before insert or update on public.vaults for each row execute function public.guard_personal_vault();

create or replace function public.get_or_create_personal_vault() returns uuid
language plpgsql security definer set search_path = public as $$
declare vid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select id into vid from public.vaults where personal and created_by = auth.uid();
  if vid is null then
    insert into public.vaults (name, icon, color, personal) values ('My vault', 'lock', '#59298B', true) returning id into vid;
    insert into public.vault_members (vault_id, user_id, role) values (vid, auth.uid(), 'owner');
  end if;
  return vid;
end $$;

-- A personal vault has no invite link that works, and cannot be linked to a group.
create or replace function public.join_vault(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare vid uuid; pers boolean;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select id, personal into vid, pers from public.vaults where invite_code = p_code;
  if vid is null or pers then raise exception 'That invite link is not valid.'; end if;
  insert into public.vault_members (vault_id, user_id, role) values (vid, auth.uid(), 'member') on conflict do nothing;
  return vid;
end $$;

revoke all on function public.get_or_create_personal_vault() from public, anon;
grant execute on function public.get_or_create_personal_vault() to authenticated;
notify pgrst, 'reload schema';
