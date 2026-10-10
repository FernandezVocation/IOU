-- Trip Ledger 0003: payment tracking with receiver confirmation, "who entered it", and cross-trip contacts.
-- Run AFTER 0001 and 0002. Safe on a database that already holds payments: they become "confirmed".

-- ───────────────────────── payments: status, method, note, audit ─────────────────────────
alter table public.payments
  add column method       text not null default '' check (char_length(method) <= 40),
  add column note         text not null default '' check (char_length(note) <= 300),
  add column status       text not null default 'confirmed' check (status in ('pending', 'confirmed')),
  add column confirmed_by uuid references public.profiles(id) on delete set null,
  add column confirmed_at timestamptz,
  add column updated_by   uuid references public.profiles(id) on delete set null,
  add column updated_at   timestamptz not null default now(),
  add column batch_id     uuid;                     -- payments made together across trips share one

-- Payments recorded before this migration were already counted in balances: keep them confirmed.
update public.payments set confirmed_at = created_at where status = 'confirmed' and confirmed_at is null;
alter table public.payments alter column status set default 'pending';
alter table public.payments add constraint payments_confirmed_has_time check ((status = 'confirmed') = (confirmed_at is not null));
create index payments_batch_idx on public.payments (batch_id) where batch_id is not null;

-- From now on payments change only through the functions below, which enforce who may do what.
revoke insert, update, delete on public.payments from authenticated;
grant select on public.payments to authenticated;

-- ───────────────────────── expenses: who last edited ─────────────────────────
alter table public.expenses add column updated_by uuid references public.profiles(id) on delete set null;

-- "Who entered it" must be trustworthy: the author is set by the database, never by the client.
create or replace function public.stamp_expense() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by = auth.uid(); end if;
  else
    new.created_by = old.created_by;
    new.updated_at = now();
    new.updated_by = auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_stamp before insert or update on public.expenses
  for each row execute function public.stamp_expense();

-- ───────────────────────── payment functions ─────────────────────────
create function public.traveler_user(p_traveler uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.travelers where id = p_traveler
$$;

-- Insert or edit one payment.
--   Recorded by the RECEIVER (their own account)  -> confirmed immediately.
--   Recorded by anyone else                       -> pending until the receiver confirms.
--   Editing a pending payment: its creator, either party, or the trip owner.
--   Editing a confirmed payment: the receiver or the trip owner only.
--   Changing who/how much on a payment resets it to pending, unless the receiver made the change.
create function public.save_payment(p_id uuid, p_group uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me         uuid := auth.uid();
  f          uuid := (p ->> 'from_id')::uuid;
  t          uuid := (p ->> 'to_id')::uuid;
  amt        numeric := (p ->> 'amount')::numeric;
  dt         date := coalesce(nullif(p ->> 'paid_on', '')::date, current_date);
  meth       text := left(trim(coalesce(p ->> 'method', '')), 40);
  nt         text := left(trim(coalesce(p ->> 'note', '')), 300);
  bid        uuid := nullif(p ->> 'batch_id', '')::uuid;
  recv_user  uuid;
  is_recv    boolean;
  old        public.payments;
  material   boolean;
  new_status text;
  res        public.payments;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if not public.is_member(p_group) then raise exception 'You are not a member of this group.' using errcode = '42501'; end if;
  if amt is null or amt <= 0 then raise exception 'Enter an amount greater than zero.'; end if;
  if dt < date '2000-01-01' or dt > current_date + 365 then raise exception 'Choose a sensible date.'; end if;
  if f is null or t is null or f = t then raise exception 'Choose two different people.'; end if;
  if not exists (select 1 from public.travelers where id = f and group_id = p_group)
     or not exists (select 1 from public.travelers where id = t and group_id = p_group) then
    raise exception 'Those people are not on this trip.';
  end if;

  recv_user := public.traveler_user(t);
  is_recv := recv_user is not null and recv_user = me;

  select * into old from public.payments where id = p_id;
  if not found then
    insert into public.payments (id, group_id, from_id, to_id, amount, paid_on, method, note, status,
                                 confirmed_by, confirmed_at, created_by, batch_id)
    values (p_id, p_group, f, t, amt, dt, meth, nt,
            case when is_recv then 'confirmed' else 'pending' end,
            case when is_recv then me end, case when is_recv then now() end, me, bid)
    returning * into res;
  else
    if old.group_id <> p_group then raise exception 'That payment belongs to a different trip.'; end if;
    -- coalesce(..., false): a traveler without an account has a NULL user, and NULL must never count as "allowed".
    if not (public.is_owner(p_group) or coalesce(old.created_by = me, false)
            or coalesce(public.traveler_user(old.from_id) = me, false) or coalesce(public.traveler_user(old.to_id) = me, false)) then
      raise exception 'Only the person who entered this payment, the people in it, or the trip owner can edit it.' using errcode = '42501';
    end if;
    if old.status = 'confirmed' and not (public.is_owner(p_group) or coalesce(public.traveler_user(old.to_id) = me, false)) then
      raise exception 'This payment is confirmed. Only the person who received it, or the trip owner, can change it.' using errcode = '42501';
    end if;
    material := (f <> old.from_id or t <> old.to_id or amt <> old.amount);
    new_status := case when is_recv then 'confirmed' when material then 'pending' else old.status end;
    update public.payments set
      from_id = f, to_id = t, amount = amt, paid_on = dt, method = meth, note = nt, status = new_status,
      confirmed_by = case when new_status <> 'confirmed' then null
                          when is_recv and (old.status <> 'confirmed' or material) then me
                          else old.confirmed_by end,
      confirmed_at = case when new_status <> 'confirmed' then null
                          when is_recv and (old.status <> 'confirmed' or material) then now()
                          else old.confirmed_at end,
      updated_by = me, updated_at = now()
    where id = p_id returning * into res;
  end if;
  return jsonb_build_object('id', res.id, 'status', res.status);
end $$;

-- The receiver confirms. If the receiver has no account, any other member (not the payer) may confirm
-- on their behalf, and the trip owner always may. The record shows who confirmed.
create function public.confirm_payment(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pay public.payments;
  recv_user uuid;
  pay_user uuid;
  allowed boolean;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into pay from public.payments where id = p_id;
  if not found or not public.is_member(pay.group_id) then raise exception 'Payment not found.' using errcode = '42501'; end if;
  if pay.status = 'confirmed' then return jsonb_build_object('id', pay.id, 'status', 'confirmed'); end if;
  recv_user := public.traveler_user(pay.to_id);
  pay_user := public.traveler_user(pay.from_id);
  if recv_user is not null then
    allowed := recv_user = me;
    if not allowed then raise exception 'Only the person who received this payment can confirm it.' using errcode = '42501'; end if;
  else
    allowed := public.is_owner(pay.group_id) or pay_user is distinct from me;
    if not allowed then raise exception 'You cannot confirm a payment you made yourself. Ask another member of the trip.' using errcode = '42501'; end if;
  end if;
  update public.payments set status = 'confirmed', confirmed_by = me, confirmed_at = now(), updated_by = me, updated_at = now() where id = p_id;
  return jsonb_build_object('id', pay.id, 'status', 'confirmed');
end $$;

-- Undo a confirmation (a mistaken tick). Allowed to whoever confirmed it, the receiver, or the trip owner.
create function public.unconfirm_payment(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pay public.payments;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into pay from public.payments where id = p_id;
  if not found or not public.is_member(pay.group_id) then raise exception 'Payment not found.' using errcode = '42501'; end if;
  if pay.status = 'pending' then return jsonb_build_object('id', pay.id, 'status', 'pending'); end if;
  if not (public.is_owner(pay.group_id) or coalesce(pay.confirmed_by = me, false) or coalesce(public.traveler_user(pay.to_id) = me, false)) then
    raise exception 'Only the person who confirmed it, the person who received it, or the trip owner can undo this.' using errcode = '42501';
  end if;
  update public.payments set status = 'pending', confirmed_by = null, confirmed_at = null, updated_by = me, updated_at = now() where id = p_id;
  return jsonb_build_object('id', pay.id, 'status', 'pending');
end $$;

create function public.delete_payment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  pay public.payments;
begin
  if me is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  select * into pay from public.payments where id = p_id;
  if not found or not public.is_member(pay.group_id) then raise exception 'Payment not found.' using errcode = '42501'; end if;
  if not (public.is_owner(pay.group_id) or coalesce(pay.created_by = me, false)
          or coalesce(public.traveler_user(pay.from_id) = me, false) or coalesce(public.traveler_user(pay.to_id) = me, false)) then
    raise exception 'Only the person who entered this payment, the people in it, or the trip owner can delete it.' using errcode = '42501';
  end if;
  if pay.status = 'confirmed' and not (public.is_owner(pay.group_id) or coalesce(public.traveler_user(pay.to_id) = me, false)) then
    raise exception 'This payment is confirmed. Only the person who received it, or the trip owner, can delete it.' using errcode = '42501';
  end if;
  delete from public.payments where id = p_id;
end $$;

-- One payment spread across several trips (the cross-trip overview). All or nothing.
create function public.save_payments_batch(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  bid uuid := gen_random_uuid();
  item jsonb;
  out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Nothing to record.';
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    out := out || jsonb_build_array(
      public.save_payment(gen_random_uuid(), (item ->> 'group_id')::uuid, item || jsonb_build_object('batch_id', bid)) ||
      jsonb_build_object('group_id', item ->> 'group_id'));
  end loop;
  return out;
end $$;

-- ───────────────────────── contacts (private, per user) ─────────────────────────
-- "Jack" in the Lisbon trip and "Jack" in the Banff trip are different travelers rows. A contact
-- says "these are the same person" so balances can be combined. Only the owner ever sees them.
create table public.contacts (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);
create table public.contact_travelers (
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  contact_id  uuid not null,
  primary key (owner_id, traveler_id),
  foreign key (contact_id, owner_id) references public.contacts (id, owner_id) on delete cascade
);
alter table public.contacts          enable row level security;
alter table public.contact_travelers enable row level security;

create policy contacts_own on public.contacts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy contact_travelers_own on public.contact_travelers for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.is_member((select t.group_id from public.travelers t where t.id = traveler_id)));

revoke all on public.contacts, public.contact_travelers from anon, authenticated;
grant select, delete on public.contacts, public.contact_travelers to authenticated;
grant insert (name), update (name) on public.contacts to authenticated;
grant insert (traveler_id, contact_id), update (contact_id) on public.contact_travelers to authenticated;

-- ───────────────────────── balance links now carry payment status ─────────────────────────
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
        'category', e.category, 'amount', e.amount, 'currency', e.currency, 'settled_amount', e.settled_amount,
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

-- ───────────────────────── privileges ─────────────────────────
revoke all on function public.traveler_user(uuid) from public, anon, authenticated;
revoke all on function public.save_payment(uuid, uuid, jsonb) from public, anon;
revoke all on function public.confirm_payment(uuid) from public, anon;
revoke all on function public.unconfirm_payment(uuid) from public, anon;
revoke all on function public.delete_payment(uuid) from public, anon;
revoke all on function public.save_payments_batch(jsonb) from public, anon;
grant execute on function public.save_payment(uuid, uuid, jsonb), public.confirm_payment(uuid), public.unconfirm_payment(uuid),
                          public.delete_payment(uuid), public.save_payments_batch(jsonb) to authenticated;
revoke all on function public.get_shared_trip(text) from public;
grant execute on function public.get_shared_trip(text) to anon, authenticated;
