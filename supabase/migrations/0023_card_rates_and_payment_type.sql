-- IOU 0023: (1) estimates that go through the card the bill was paid on, (2) payment type and subtype on expenses.
-- Run after 0022. Safe to run more than once. Existing expenses are untouched.
--
-- (1) Group rates can now also be "bill currency > card currency" pairs, stored in group_rates with a key like 'EUR>QAR'
--     (meaning 1 EUR = x QAR). The estimate for an expense paid in EUR on a QAR card is then
--     amount x (EUR>QAR) x (QAR to group currency). An exact statement amount typed on the expense always wins.
--     expenses.card_currency is the card the expense was paid on (blank = the payer's usual card).
-- (2) expenses.pay_type / pay_subtype: how the purchase was paid (Cash, Credit card > Visa ...). Optional; a subtype needs a type.

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.group_rates'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%currency%' loop
    execute format('alter table public.group_rates drop constraint %I', c);
  end loop;
end $$;
alter table public.group_rates add constraint group_rates_currency_ok check (currency ~ '^[A-Z]{3}(>[A-Z]{3})?$');

alter table public.expenses add column if not exists card_currency text check (card_currency is null or card_currency ~ '^[A-Z]{3}$');
alter table public.expenses add column if not exists pay_type    text not null default '' check (char_length(pay_type) <= 60);
alter table public.expenses add column if not exists pay_subtype text not null default '' check (char_length(pay_subtype) <= 60);
do $$ begin
  alter table public.expenses add constraint expenses_pay_subtype_needs_type check (pay_subtype = '' or pay_type <> '');
exception when duplicate_object then null; end $$;

create or replace function public.save_expense(p_id uuid, p_group uuid, p jsonb, p_splits jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare st text := coalesce(nullif(p ->> 'status', ''), 'final'); vid uuid := nullif(p ->> 'vault_item_id', '')::uuid;
      xid uuid := nullif(p ->> 'itinerary_item_id', '')::uuid;
begin
  if st not in ('final', 'estimate', 'pending', 'needs_info') then raise exception 'Unknown status.'; end if;
  if vid is not null and vid is distinct from (select e.vault_item_id from public.expenses e where e.id = p_id) and not exists (
       select 1 from public.vault_items i join public.vaults v on v.id = i.vault_id
       where i.id = vid and (v.group_id = p_group or v.personal) and public.v_can_see_item(i.id)) then
    raise exception 'That vault item is not available for this group.';
  end if;
  -- Same rule for the itinerary item: it must sit in an itinerary linked to this group, and the caller must see it.
  if xid is not null and xid is distinct from (select e.itinerary_item_id from public.expenses e where e.id = p_id) and not exists (
       select 1 from public.itinerary_items i join public.itineraries t on t.id = i.itinerary_id
       where i.id = xid and t.group_id = p_group and public.it_can_see_item(i.id)) then
    raise exception 'That itinerary item is not available for this group.';
  end if;
  if not public.can_edit(p_group) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  if exists (select 1 from public.expenses where id = p_id and group_id = p_group) and not public.can_modify_expense(p_id) then
    raise exception 'You can only change expenses you added. Ask a group admin, or the person who added it.' using errcode = '42501';
  end if;

  insert into public.expenses (id, group_id, spent_on, spent_at, vendor, description, location, category, subcategory, notes,
                               amount, currency, settled_amount, charged_amount, charged_currency, payer_id, split_mode, status, vault_item_id, itinerary_item_id, booking_ref, card_currency, pay_type, pay_subtype)
  values (p_id, p_group, (p ->> 'spent_on')::date, nullif(p ->> 'spent_at', '')::time,
          coalesce(p ->> 'vendor', ''), left(coalesce(p ->> 'description', ''), 200), coalesce(p ->> 'location', ''),
          coalesce(p ->> 'category', ''), coalesce(p ->> 'subcategory', ''), coalesce(p ->> 'notes', ''),
          (p ->> 'amount')::numeric, upper(p ->> 'currency'),
          nullif(p ->> 'settled_amount', '')::numeric,
          nullif(p ->> 'charged_amount', '')::numeric, nullif(upper(coalesce(p ->> 'charged_currency', '')), ''),
          (p ->> 'payer_id')::uuid, p ->> 'split_mode', st, vid, xid, left(btrim(coalesce(p ->> 'booking_ref', '')), 60),
          nullif(upper(coalesce(p ->> 'card_currency', '')), ''), left(btrim(coalesce(p ->> 'pay_type', '')), 60),
          case when btrim(coalesce(p ->> 'pay_type', '')) = '' then '' else left(btrim(coalesce(p ->> 'pay_subtype', '')), 60) end)
  on conflict (id) do update set
    spent_on = excluded.spent_on, spent_at = excluded.spent_at, vendor = excluded.vendor, description = excluded.description,
    location = excluded.location, category = excluded.category, subcategory = excluded.subcategory, notes = excluded.notes,
    amount = excluded.amount, currency = excluded.currency, settled_amount = excluded.settled_amount,
    charged_amount = excluded.charged_amount, charged_currency = excluded.charged_currency,
    payer_id = excluded.payer_id, split_mode = excluded.split_mode,
    status = case when p ? 'status' then excluded.status else public.expenses.status end,
    vault_item_id = case when p ? 'vault_item_id' then excluded.vault_item_id else public.expenses.vault_item_id end,
    card_currency = case when p ? 'card_currency' then excluded.card_currency else public.expenses.card_currency end,
    pay_type = case when p ? 'pay_type' then excluded.pay_type else public.expenses.pay_type end,
    pay_subtype = case when p ? 'pay_type' then excluded.pay_subtype else public.expenses.pay_subtype end,
    booking_ref = case when p ? 'booking_ref' then excluded.booking_ref else public.expenses.booking_ref end,
    itinerary_item_id = case when p ? 'itinerary_item_id' then excluded.itinerary_item_id else public.expenses.itinerary_item_id end
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
      'group', jsonb_build_object('name', g.name, 'currency', g.currency, 'kind', g.kind, 'icon', g.icon, 'color', g.color, 'spending_currency', g.spending_currency),
      'linked', '[]'::jsonb,
      'travelers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.sort_order)
                             from public.travelers t where t.group_id = l.group_id), '[]'::jsonb),
      'expenses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id, 'spent_on', e.spent_on, 'spent_at', e.spent_at, 'vendor', e.vendor, 'description', e.description, 'location', e.location, 'notes', e.notes,
          'category', e.category, 'subcategory', e.subcategory, 'amount', e.amount, 'currency', e.currency,
          'settled_amount', e.settled_amount, 'charged_amount', e.charged_amount, 'charged_currency', e.charged_currency, 'card_currency', coalesce(e.card_currency, e.charged_currency, (select t2.statement_currency from public.travelers t2 where t2.id = e.payer_id)), 'payer_id', e.payer_id, 'split_mode', e.split_mode,
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
    'group', jsonb_build_object('name', g.name, 'currency', g.currency, 'kind', g.kind, 'icon', g.icon, 'color', g.color, 'spending_currency', g.spending_currency),
    'linked', to_jsonb(lk),
    'travelers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.sort_order)
                           from public.travelers t where t.group_id = l.group_id and t.id = any(vis)), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'spent_on', e.spent_on, 'spent_at', e.spent_at, 'vendor', e.vendor, 'description', e.description, 'location', e.location, 'notes', e.notes,
        'category', e.category, 'subcategory', e.subcategory, 'amount', e.amount, 'currency', e.currency,
        'settled_amount', e.settled_amount, 'charged_amount', e.charged_amount, 'charged_currency', e.charged_currency, 'card_currency', coalesce(e.card_currency, e.charged_currency, (select t2.statement_currency from public.travelers t2 where t2.id = e.payer_id)), 'payer_id', e.payer_id,
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

notify pgrst, 'reload schema';
