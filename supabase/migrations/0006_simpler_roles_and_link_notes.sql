-- IOU 0006: simpler roles, and notes on read-only links.
-- Run AFTER 0001-0005.
--
-- Roles (group_members.role):
--   owner   the original admin. The only one who can delete the group, and nobody can remove or demote them.
--   admin   a co-admin, chosen by the owner or another co-admin. Can change anything the owner can,
--           except delete the group or touch the owner: edit any expense or payment, manage who is in
--           the group and their level, create read-only links, change group settings.
--   member  everyone else with an account. Adds expenses and payments, and changes only their own expenses.
-- There is no view-only account. To let someone look without adding anything, send a read-only link.
-- Anyone who was a "viewer" or "editor" (0005) becomes a member.
--
-- Read-only links now include expense notes: a person link shows the notes on that person's own expenses,
-- a group link shows all of them.

alter table public.group_members drop constraint if exists group_members_role_check;
update public.group_members set role = 'member' where role in ('editor', 'viewer');
alter table public.group_members add constraint group_members_role_check check (role in ('owner', 'admin', 'member'));
alter table public.group_members alter column role set default 'member';

-- Every existing "owner only" rule (links, members, payments, settings, editing others' expenses) now covers
-- co-admins too, because they all go through is_owner().
create or replace function public.is_owner(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role in ('owner', 'admin'))
$$;
create function public.is_primary_owner(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'owner')
$$;
-- Everyone in the group may add things; who may change what is decided per expense and per payment.
create or replace function public.can_edit(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member(gid)
$$;

-- Deleting the group, and removing the owner, are for the owner alone.
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated using (public.is_primary_owner(id));
drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members for delete to authenticated
  using (user_id = auth.uid() or (public.is_owner(group_id) and role <> 'owner'));

create or replace function public.set_member_role(p_group uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not public.is_owner(p_group) then raise exception 'Only a group admin can change someone''s level.' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Choose co-admin or member.'; end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = p_user and role = 'owner') then
    raise exception 'The original owner''s access cannot be changed.' using errcode = '42501';
  end if;
  update public.group_members set role = p_role where group_id = p_group and user_id = p_user;
  if not found then raise exception 'That person is not in this group.'; end if;
end $$;

create or replace function public.join_group(p_code text, p_traveler_id uuid default null, p_new_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  g      public.groups;
  uid    uuid := auth.uid();
  nm     text;
  colors text[] := array['#2B44FF','#0E7C61','#C23B22','#8A4FD3','#B07A00','#0B8FA8','#C7366F','#5B6B2E'];
  n      int;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into g from public.groups where invite_code = lower(trim(p_code));
  if not found then raise exception 'That invite link is not valid any more.'; end if;
  if public.is_member(g.id) then return g.id; end if;

  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'member');

  if p_traveler_id is not null then
    update public.travelers set user_id = uid
     where id = p_traveler_id and group_id = g.id and user_id is null;
    if not found then raise exception 'That name was just claimed by someone else. Pick another.'; end if;
  else
    select count(*) into n from public.travelers where group_id = g.id;
    nm := coalesce(nullif(trim(p_new_name), ''),
                   (select nullif(display_name, '') from public.profiles where id = uid), 'Guest');
    insert into public.travelers (group_id, name, color, user_id)
    values (g.id, left(nm, 40), colors[1 + (n % 8)], uid);
  end if;
  return g.id;
end $$;

create or replace function public.save_expense(p_id uuid, p_group uuid, p jsonb, p_splits jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
begin
  if not public.can_edit(p_group) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  if exists (select 1 from public.expenses where id = p_id and group_id = p_group) and not public.can_modify_expense(p_id) then
    raise exception 'You can only change expenses you added. Ask a group admin, or the person who added it.' using errcode = '42501';
  end if;

  insert into public.expenses (id, group_id, spent_on, spent_at, vendor, location, category, subcategory, notes,
                               amount, currency, settled_amount, payer_id, split_mode)
  values (p_id, p_group, (p ->> 'spent_on')::date, nullif(p ->> 'spent_at', '')::time,
          coalesce(p ->> 'vendor', ''), coalesce(p ->> 'location', ''),
          coalesce(p ->> 'category', ''), coalesce(p ->> 'subcategory', ''), coalesce(p ->> 'notes', ''),
          (p ->> 'amount')::numeric, upper(p ->> 'currency'),
          nullif(p ->> 'settled_amount', '')::numeric,
          (p ->> 'payer_id')::uuid, p ->> 'split_mode')
  on conflict (id) do update set
    spent_on = excluded.spent_on, spent_at = excluded.spent_at, vendor = excluded.vendor,
    location = excluded.location, category = excluded.category, subcategory = excluded.subcategory, notes = excluded.notes,
    amount = excluded.amount, currency = excluded.currency, settled_amount = excluded.settled_amount,
    payer_id = excluded.payer_id, split_mode = excluded.split_mode
    where public.expenses.group_id = p_group;
  if not found then raise exception 'That expense belongs to a different group.'; end if;

  delete from public.expense_splits where expense_id = p_id;
  insert into public.expense_splits (expense_id, group_id, traveler_id, value)
  select p_id, p_group, (s ->> 'traveler_id')::uuid, (s ->> 'value')::numeric
  from jsonb_array_elements(p_splits) s;
  if not exists (select 1 from public.expense_splits where expense_id = p_id) then
    raise exception 'An expense needs at least one person in the split.';
  end if;
  return p_id;
end $$;

create or replace function public.payments_need_editor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.groups where id = old.group_id) and not public.can_edit(old.group_id) then
      raise exception 'You are not a member of this group.' using errcode = '42501';
    end if;
    return old;
  end if;
  if not public.can_edit(new.group_id) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.get_shared_trip(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l   public.share_links;
  g   public.groups;
  lk  uuid[];
  vis uuid[];
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.share_links where token = p_token and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select * into g from public.groups where id = l.group_id;
  select coalesce(array_agg(s.traveler_id), '{}') into lk from public.share_link_travelers s where s.link_id = l.id;

  if l.last_viewed_at is null or l.last_viewed_at < now() - interval '1 minute' then
    update public.share_links set last_viewed_at = now(), view_count = view_count + 1 where id = l.id;
  end if;

  if l.scope = 'group' then
    return jsonb_build_object(
      'scope', 'group', 'label', l.label,
      'group', jsonb_build_object('name', g.name, 'currency', g.currency),
      'linked', '[]'::jsonb,
      'travelers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.sort_order)
                             from public.travelers t where t.group_id = l.group_id), '[]'::jsonb),
      'expenses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id, 'spent_on', e.spent_on, 'spent_at', e.spent_at, 'vendor', e.vendor, 'location', e.location, 'notes', e.notes,
          'category', e.category, 'subcategory', e.subcategory, 'amount', e.amount, 'currency', e.currency,
          'settled_amount', e.settled_amount, 'payer_id', e.payer_id, 'split_mode', e.split_mode,
          'splits', coalesce((select jsonb_agg(jsonb_build_object('traveler_id', s.traveler_id, 'value', s.value))
                              from public.expense_splits s where s.expense_id = e.id), '[]'::jsonb),
          'receipts', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'path', r.path, 'name', r.name, 'mime', r.mime) order by r.created_at)
                                from public.receipts r where r.expense_id = e.id), '[]'::jsonb)))
        from public.expenses e where e.group_id = l.group_id), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'from_id', p.from_id, 'to_id', p.to_id, 'amount', p.amount,
                                                                'paid_on', p.paid_on, 'status', p.status))
                            from public.payments p where p.group_id = l.group_id), '[]'::jsonb),
      'rates', coalesce((select jsonb_object_agg(r.currency, r.rate) from public.group_rates r where r.group_id = l.group_id), '{}'::jsonb),
      'generated_at', now());
  end if;

  -- person link: work out which people the page needs to name
  select coalesce(array_agg(distinct x), '{}') into vis from (
    select unnest(lk) as x
    union select e.payer_id from public.expenses e
          where e.group_id = l.group_id
            and (e.payer_id = any(lk) or exists (select 1 from public.expense_splits s where s.expense_id = e.id and s.traveler_id = any(lk)))
    union select s.traveler_id from public.expense_splits s join public.expenses e on e.id = s.expense_id
          where e.group_id = l.group_id and e.payer_id = any(lk)
    union select p.from_id from public.payments p where p.group_id = l.group_id and (p.from_id = any(lk) or p.to_id = any(lk))
    union select p.to_id   from public.payments p where p.group_id = l.group_id and (p.from_id = any(lk) or p.to_id = any(lk))
  ) q;

  return jsonb_build_object(
    'scope', 'person', 'label', l.label,
    'group', jsonb_build_object('name', g.name, 'currency', g.currency),
    'linked', to_jsonb(lk),
    'travelers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.sort_order)
                           from public.travelers t where t.group_id = l.group_id and t.id = any(vis)), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'spent_on', e.spent_on, 'spent_at', e.spent_at, 'vendor', e.vendor, 'location', e.location, 'notes', e.notes,
        'category', e.category, 'subcategory', e.subcategory, 'amount', e.amount, 'currency', e.currency,
        'settled_amount', e.settled_amount, 'payer_id', e.payer_id,
        'split_mode', case when e.payer_id = any(lk) then e.split_mode when e.split_mode = 'equal' then 'shares' else e.split_mode end,
        'splits', case when e.payer_id = any(lk) then
            coalesce((select jsonb_agg(jsonb_build_object('traveler_id', s.traveler_id, 'value', s.value))
                      from public.expense_splits s where s.expense_id = e.id), '[]'::jsonb)
          else
            coalesce((select jsonb_agg(x) from (
              select jsonb_build_object('traveler_id', s.traveler_id, 'value', case when e.split_mode = 'equal' then 1 else s.value end) as x
                from public.expense_splits s where s.expense_id = e.id and s.traveler_id = any(lk)
              union all
              select jsonb_build_object('traveler_id', e.payer_id, 'value', case when e.split_mode = 'equal' then count(*)::numeric else sum(s.value) end)
                from public.expense_splits s where s.expense_id = e.id and not (s.traveler_id = any(lk))
                having count(*) > 0
            ) q2), '[]'::jsonb)
          end))
      from public.expenses e
      where e.group_id = l.group_id
        and (e.payer_id = any(lk) or exists (select 1 from public.expense_splits s where s.expense_id = e.id and s.traveler_id = any(lk)))
    ), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'from_id', p.from_id, 'to_id', p.to_id, 'amount', p.amount,
                                                              'paid_on', p.paid_on, 'status', p.status))
                          from public.payments p where p.group_id = l.group_id and (p.from_id = any(lk) or p.to_id = any(lk))), '[]'::jsonb),
    'rates', coalesce((select jsonb_object_agg(r.currency, r.rate) from public.group_rates r where r.group_id = l.group_id), '{}'::jsonb),
    'generated_at', now());
end $$;

revoke all on function public.is_primary_owner(uuid) from public, anon;
grant execute on function public.is_primary_owner(uuid) to authenticated;
revoke all on function public.get_shared_trip(text) from public;
grant execute on function public.get_shared_trip(text) to anon, authenticated;
notify pgrst, 'reload schema';
