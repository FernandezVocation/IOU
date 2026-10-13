-- 0011: two optional add-ons on an expense.
--   status        final (default) | estimate | pending | needs_info   -- a label only; amounts and balances are unchanged
--   vault_item_id the vault item this expense is for (shows a small icon); cleared if the item is deleted
-- Safe to run more than once. Run after 0009 (needs vault_items).

alter table public.expenses add column if not exists status text not null default 'final';
alter table public.expenses drop constraint if exists expenses_status_check;
alter table public.expenses add  constraint expenses_status_check check (status in ('final', 'estimate', 'pending', 'needs_info'));
alter table public.expenses add column if not exists vault_item_id uuid references public.vault_items(id) on delete set null;
create index if not exists expenses_vault_item_idx on public.expenses (vault_item_id) where vault_item_id is not null;

-- Same function as before plus the two fields. A caller that sends neither leaves them as they were.
-- A vault item can only be newly linked if it belongs to this group's vault and the caller can see it
-- (an existing link is left alone when someone else edits the expense).
create or replace function public.save_expense(p_id uuid, p_group uuid, p jsonb, p_splits jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare st text := coalesce(nullif(p ->> 'status', ''), 'final'); vid uuid := nullif(p ->> 'vault_item_id', '')::uuid;
begin
  if st not in ('final', 'estimate', 'pending', 'needs_info') then raise exception 'Unknown status.'; end if;
  if vid is not null and vid is distinct from (select e.vault_item_id from public.expenses e where e.id = p_id) and not exists (
       select 1 from public.vault_items i join public.vaults v on v.id = i.vault_id
       where i.id = vid and v.group_id = p_group and public.v_can_see_item(i.id)) then
    raise exception 'That vault item is not available for this group.';
  end if;
  if not public.can_edit(p_group) then
    raise exception 'You are not a member of this group.' using errcode = '42501';
  end if;
  if exists (select 1 from public.expenses where id = p_id and group_id = p_group) and not public.can_modify_expense(p_id) then
    raise exception 'You can only change expenses you added. Ask a group admin, or the person who added it.' using errcode = '42501';
  end if;

  insert into public.expenses (id, group_id, spent_on, spent_at, vendor, description, location, category, subcategory, notes,
                               amount, currency, settled_amount, charged_amount, charged_currency, payer_id, split_mode, status, vault_item_id)
  values (p_id, p_group, (p ->> 'spent_on')::date, nullif(p ->> 'spent_at', '')::time,
          coalesce(p ->> 'vendor', ''), left(coalesce(p ->> 'description', ''), 200), coalesce(p ->> 'location', ''),
          coalesce(p ->> 'category', ''), coalesce(p ->> 'subcategory', ''), coalesce(p ->> 'notes', ''),
          (p ->> 'amount')::numeric, upper(p ->> 'currency'),
          nullif(p ->> 'settled_amount', '')::numeric,
          nullif(p ->> 'charged_amount', '')::numeric, nullif(upper(coalesce(p ->> 'charged_currency', '')), ''),
          (p ->> 'payer_id')::uuid, p ->> 'split_mode', st, vid)
  on conflict (id) do update set
    spent_on = excluded.spent_on, spent_at = excluded.spent_at, vendor = excluded.vendor, description = excluded.description,
    location = excluded.location, category = excluded.category, subcategory = excluded.subcategory, notes = excluded.notes,
    amount = excluded.amount, currency = excluded.currency, settled_amount = excluded.settled_amount,
    charged_amount = excluded.charged_amount, charged_currency = excluded.charged_currency,
    payer_id = excluded.payer_id, split_mode = excluded.split_mode,
    status = case when p ? 'status' then excluded.status else public.expenses.status end,
    vault_item_id = case when p ? 'vault_item_id' then excluded.vault_item_id else public.expenses.vault_item_id end
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

notify pgrst, 'reload schema';
