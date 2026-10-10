import type { GroupData, Payment } from './types'

export const METHODS = ['E-transfer', 'Cash', 'Bank transfer', 'Card', 'PayPal', 'Venmo', 'Cheque']

/** Name of an account holder. "You" for the signed-in user when `meId` is given. */
export function userName(data: GroupData, userId: string | null | undefined, meId: string | null = null): string {
  if (!userId) return 'someone'
  if (meId && userId === meId) return 'You'
  return data.members.find(m => m.user_id === userId)?.display_name || 'a former member'
}

const travelerUser = (data: GroupData, travelerId: string): string | null => data.travelers.find(t => t.id === travelerId)?.user_id ?? null
export const isPending = (p: Payment): boolean => p.status === 'pending'
/** A payment is "Sent" until the person who was paid ticks "Received". */
export const statusLabel = (p: Payment): 'Sent' | 'Received' => (isPending(p) ? 'Sent' : 'Received')

/**
 * What the signed-in user may do with a payment. This mirrors the rules enforced in the database
 * (save_payment / confirm_payment / delete_payment), so buttons only appear when they will work.
 * The database remains the authority.
 */
export interface PaymentPerms { canEdit: boolean; canDelete: boolean; canConfirm: boolean; canUnconfirm: boolean; confirmHint: string }
export function paymentPerms(data: GroupData, p: Payment, userId: string): PaymentPerms {
  const recvUser = travelerUser(data, p.to_id), payUser = travelerUser(data, p.from_id)
  if (data.canEdit === false) return { canEdit: false, canDelete: false, canConfirm: false, canUnconfirm: false, confirmHint: isPending(p) ? 'Sent. Waiting for confirmation.' : '' }
  const isRecv = recvUser !== null && recvUser === userId
  const isParty = isRecv || (payUser !== null && payUser === userId)
  const manage = data.isOwner || p.created_by === userId || isParty
  const allowed = isPending(p) ? manage : data.isOwner || isRecv
  const canConfirm = isPending(p) && (recvUser !== null ? isRecv : data.isOwner || payUser !== userId)
  const to = data.travelers.find(t => t.id === p.to_id)?.name ?? 'the receiver'
  return {
    canEdit: allowed, canDelete: allowed, canConfirm,
    // Undo a mistaken tick: whoever confirmed it, the receiver, or the owner (mirrors unconfirm_payment()).
    canUnconfirm: !isPending(p) && (data.isOwner || p.confirmed_by === userId || isRecv),
    confirmHint: isPending(p) ? (recvUser !== null ? (isRecv ? 'Sent. Waiting for you to confirm you received it.' : `Sent. Waiting for ${to} to confirm they received it.`) : `Sent. ${to} has no account, so another member of the group can confirm for them.`) : '',
  }
}

/** Will a payment recorded by this user to this receiver be confirmed straight away? */
export function autoConfirms(data: GroupData, toTravelerId: string, userId: string): boolean {
  const u = travelerUser(data, toTravelerId)
  return u !== null && u === userId
}

const day = (iso?: string | null): string => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch { return '' }
}

/** Human-readable audit lines: who entered it, who edited it, who confirmed it. */
export function paymentHistory(data: GroupData, p: Payment, meId: string | null): string[] {
  const out: string[] = []
  if (p.created_by) out.push(`Entered by ${userName(data, p.created_by, meId)}${p.created_at ? ' on ' + day(p.created_at) : ''}`)
  if (p.updated_by && p.updated_at && p.updated_at !== p.created_at && p.updated_by !== p.confirmed_by) out.push(`Edited by ${userName(data, p.updated_by, meId)} on ${day(p.updated_at)}`)
  if (!isPending(p) && p.confirmed_by) {
    const to = data.travelers.find(t => t.id === p.to_id)
    const onBehalf = to !== undefined && to.user_id !== p.confirmed_by
    out.push(onBehalf ? `Confirmed on behalf of ${to.name} by ${userName(data, p.confirmed_by, meId)} on ${day(p.confirmed_at)}`
                      : `Confirmed by ${userName(data, p.confirmed_by, meId)} on ${day(p.confirmed_at)}`)
  }
  return out
}
