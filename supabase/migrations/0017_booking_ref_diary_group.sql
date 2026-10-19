-- Booking reference on expenses, vault items and itinerary items; diary entries can also link to a group.
-- Safe to run more than once. Run after 0016.
alter table public.expenses         add column if not exists booking_ref text not null default '' check (char_length(booking_ref) <= 60);
alter table public.vault_items      add column if not exists booking_ref text not null default '' check (char_length(booking_ref) <= 60);
alter table public.itinerary_items  add column if not exists booking_ref text not null default '' check (char_length(booking_ref) <= 60);
grant update (booking_ref) on public.vault_items to authenticated;
grant update (booking_ref) on public.itinerary_items to authenticated;

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
                               amount, currency, settled_amount, charged_amount, charged_currency, payer_id, split_mode, status, vault_item_id, itinerary_item_id, booking_ref)
  values (p_id, p_group, (p ->> 'spent_on')::date, nullif(p ->> 'spent_at', '')::time,
          coalesce(p ->> 'vendor', ''), left(coalesce(p ->> 'description', ''), 200), coalesce(p ->> 'location', ''),
          coalesce(p ->> 'category', ''), coalesce(p ->> 'subcategory', ''), coalesce(p ->> 'notes', ''),
          (p ->> 'amount')::numeric, upper(p ->> 'currency'),
          nullif(p ->> 'settled_amount', '')::numeric,
          nullif(p ->> 'charged_amount', '')::numeric, nullif(upper(coalesce(p ->> 'charged_currency', '')), ''),
          (p ->> 'payer_id')::uuid, p ->> 'split_mode', st, vid, xid, left(btrim(coalesce(p ->> 'booking_ref', '')), 60))
  on conflict (id) do update set
    spent_on = excluded.spent_on, spent_at = excluded.spent_at, vendor = excluded.vendor, description = excluded.description,
    location = excluded.location, category = excluded.category, subcategory = excluded.subcategory, notes = excluded.notes,
    amount = excluded.amount, currency = excluded.currency, settled_amount = excluded.settled_amount,
    charged_amount = excluded.charged_amount, charged_currency = excluded.charged_currency,
    payer_id = excluded.payer_id, split_mode = excluded.split_mode,
    status = case when p ? 'status' then excluded.status else public.expenses.status end,
    vault_item_id = case when p ? 'vault_item_id' then excluded.vault_item_id else public.expenses.vault_item_id end,
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

-- Diary: an entry may also belong to a group (or neither: standalone). Sharing reaches members of
-- the linked itinerary and/or the linked group.
alter table public.diary_entries add column if not exists group_id uuid references public.groups(id) on delete set null;
grant update (group_id) on public.diary_entries to authenticated;

create or replace function public.d_can_see(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.diary_entries e where e.id = eid
                 and (e.created_by = auth.uid() or (e.shared and (
                       (e.itinerary_id is not null and public.it_is_member(e.itinerary_id))
                    or (e.group_id is not null and public.is_member(e.group_id))))))
$$;

drop policy if exists diary_entries_insert on public.diary_entries;
create policy diary_entries_insert on public.diary_entries for insert to authenticated
  with check (created_by = auth.uid() and (itinerary_id is null or public.it_is_member(itinerary_id)) and (group_id is null or public.is_member(group_id)));
drop policy if exists diary_entries_update on public.diary_entries;
create policy diary_entries_update on public.diary_entries for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and (itinerary_id is null or public.it_is_member(itinerary_id)) and (group_id is null or public.is_member(group_id)));

-- Link an existing expense to an itinerary item (used when an item is created from an expense).
-- Same rule as save_expense: the item must sit in an itinerary linked to the expense's group and be visible to the caller.
create or replace function public.link_expense_itinerary_item(p_expense uuid, p_item uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare gid uuid;
begin
  select group_id into gid from public.expenses where id = p_expense;
  if gid is null then raise exception 'Expense not found.'; end if;
  if not public.can_edit(gid) or not public.can_modify_expense(p_expense) then
    raise exception 'You can only change expenses you added. Ask a group admin, or the person who added it.' using errcode = '42501';
  end if;
  if p_item is not null and not exists (
       select 1 from public.itinerary_items i join public.itineraries t on t.id = i.itinerary_id
       where i.id = p_item and t.group_id = gid and public.it_can_see_item(i.id)) then
    raise exception 'That itinerary item is not available for this group.';
  end if;
  update public.expenses set itinerary_item_id = p_item where id = p_expense;
end $$;
revoke all on function public.link_expense_itinerary_item(uuid, uuid) from public;
grant execute on function public.link_expense_itinerary_item(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
