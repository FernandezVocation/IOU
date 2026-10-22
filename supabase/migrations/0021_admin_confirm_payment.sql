-- IOU 0021: owners and co-admins can mark a payment as received on the receiver's behalf.
-- Before: only the receiver could confirm (or any other member, if the receiver has no account).
-- Now also: an owner or co-admin, unless they are the person who sent that payment (no confirming your own).
-- The record shows who confirmed it ("Confirmed on behalf of ... by ..."). Safe to run more than once.
create or replace function public.confirm_payment(p_id uuid) returns jsonb
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
  if recv_user is not null and recv_user = me then
    allowed := true;
  elsif recv_user is not null then
    allowed := public.is_owner(pay.group_id) and pay_user is distinct from me;
    if not allowed then raise exception 'Only the person who received this payment, or a group admin, can mark it received.' using errcode = '42501'; end if;
  else
    allowed := public.is_owner(pay.group_id) or pay_user is distinct from me;
    if not allowed then raise exception 'You cannot confirm a payment you made yourself. Ask another member of the trip.' using errcode = '42501'; end if;
  end if;
  update public.payments set status = 'confirmed', confirmed_by = me, confirmed_at = now(), updated_by = me, updated_at = now() where id = p_id;
  return jsonb_build_object('id', pay.id, 'status', 'confirmed');
end $$;
notify pgrst, 'reload schema';
