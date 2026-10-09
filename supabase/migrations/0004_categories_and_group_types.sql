-- 0004: sub-categories on expenses, and a type for each group (Trip, Household, Event ... or anything typed).
-- Run after 0001, 0002 and 0003. Safe to run once; existing rows get an empty sub-category and the type 'Trip'.

alter table public.expenses add column subcategory text not null default '' check (char_length(subcategory) <= 60);
alter table public.groups   add column kind text not null default 'Trip' check (char_length(trim(kind)) between 1 and 40);
grant update (kind) on public.groups to authenticated;

-- create_group gains an optional type. The old three-argument version is replaced, not kept beside it.
drop function public.create_group(text, text, text);
create function public.create_group(p_name text, p_currency text, p_my_name text default null, p_kind text default 'Trip')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  uid uuid := auth.uid();
  nm  text;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  insert into public.groups (name, currency, kind, created_by)
  values (trim(p_name), upper(trim(p_currency)), left(coalesce(nullif(trim(p_kind), ''), 'Trip'), 40), uid) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, uid, 'owner');
  nm := coalesce(nullif(trim(p_my_name), ''),
                 (select nullif(display_name, '') from public.profiles where id = uid), 'Me');
  insert into public.travelers (group_id, name, color, user_id) values (gid, left(nm, 40), '#2B44FF', uid);
  return gid;
end $$;
revoke all on function public.create_group(text, text, text, text) from public, anon;
grant execute on function public.create_group(text, text, text, text) to authenticated;

-- save_expense now stores the sub-category.
create or replace function public.save_expense(p_id uuid, p_group uuid, p jsonb, p_splits jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_member(p_group) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
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

-- Balance links also carry the sub-category (still nothing private).
create or replace function public.get_shared_trip(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.share_links;
  g public.groups;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.share_links where token = p_token and (expires_at is null or expires_at > now());
  if not found then return null; end if;
  select * into g from public.groups where id = l.group_id;

  if l.last_viewed_at is null or l.last_viewed_at < now() - interval '1 minute' then
    update public.share_links set last_viewed_at = now(), view_count = view_count + 1 where id = l.id;
  end if;

  return jsonb_build_object(
    'label', l.label,
    'group', jsonb_build_object('name', g.name, 'currency', g.currency),
    'linked', coalesce((select jsonb_agg(s.traveler_id) from public.share_link_travelers s where s.link_id = l.id), '[]'::jsonb),
    'travelers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.sort_order)
                           from public.travelers t where t.group_id = l.group_id), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'spent_on', e.spent_on, 'spent_at', e.spent_at, 'vendor', e.vendor, 'location', e.location,
        'category', e.category, 'subcategory', e.subcategory, 'amount', e.amount, 'currency', e.currency, 'settled_amount', e.settled_amount,
        'payer_id', e.payer_id, 'split_mode', e.split_mode,
        'splits', coalesce((select jsonb_agg(jsonb_build_object('traveler_id', s.traveler_id, 'value', s.value))
                            from public.expense_splits s where s.expense_id = e.id), '[]'::jsonb)))
      from public.expenses e where e.group_id = l.group_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'from_id', p.from_id, 'to_id', p.to_id, 'amount', p.amount,
                                                              'paid_on', p.paid_on, 'status', p.status))
                          from public.payments p where p.group_id = l.group_id), '[]'::jsonb),
    'rates', coalesce((select jsonb_object_agg(r.currency, r.rate) from public.group_rates r where r.group_id = l.group_id), '{}'::jsonb),
    'generated_at', now()
  );
end $$;
