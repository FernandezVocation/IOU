export type SplitMode = 'equal' | 'percent' | 'exact' | 'shares'

export interface Group {
  id: string
  name: string
  currency: string
  invite_code: string
  created_by: string | null
  created_at: string
  /** What the group is for: Trip, Household, Event, or anything typed. Missing on old data. */
  kind?: string
  /** The currency expenses are entered in by default. Missing means the settle currency. */
  spending_currency?: string | null
  /** Picked icon name and #RRGGBB colour. Missing means the default for the group type. */
  icon?: string | null
  color?: string | null
}
export interface Member {
  user_id: string
  /** owner: the original admin. admin: a co-admin who can change anything except the owner. member: adds expenses, changes only their own. */
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  display_name: string
}
export interface Traveler {
  id: string
  group_id: string
  name: string
  color: string
  user_id: string | null
  sort_order: number
  /** The currency this person's card statement is in. Missing means the settle currency. */
  statement_currency?: string | null
}
export interface SplitRow { traveler_id: string; value: number }
export interface Receipt {
  id: string
  expense_id: string
  group_id: string
  path: string
  mime: string
  name: string | null
  size_bytes: number | null
}
export type ExpenseStatus = 'final' | 'estimate' | 'pending' | 'needs_info'

export interface Expense {
  id: string
  group_id: string
  spent_on: string
  spent_at: string | null
  vendor: string
  /** What it was for, e.g. "Florence to Rome" (the vendor is "Italo"). */
  description?: string
  /** A label only: final (default), estimate, pending or needs_info. */
  status?: ExpenseStatus
  /** The vault item this expense is for, if any. */
  vault_item_id?: string | null
  /** The itinerary item this expense is for, if any. */
  itinerary_item_id?: string | null
  location: string
  category: string
  /** Optional second level under the category ("Food" › "Dinner"). */
  subcategory?: string
  notes: string
  amount: number
  currency: string
  settled_amount: number | null
  /** What the payer's card statement charged, in their statement currency (turned into an estimate at the group rate). */
  charged_amount?: number | null
  charged_currency?: string | null
  payer_id: string
  split_mode: SplitMode
  created_at: string
  updated_at: string
  created_by?: string | null
  updated_by?: string | null
  splits: SplitRow[]
  receipts: Receipt[]
}
export type PaymentStatus = 'pending' | 'confirmed'
export interface Payment {
  id: string
  group_id: string
  from_id: string
  to_id: string
  amount: number
  paid_on: string
  /** Missing means confirmed (data from before payment confirmation existed). */
  status?: PaymentStatus
  method?: string
  note?: string
  created_by?: string | null
  created_at?: string
  confirmed_by?: string | null
  confirmed_at?: string | null
  updated_by?: string | null
  updated_at?: string
  batch_id?: string | null
}
export interface GroupData {
  group: Group
  members: Member[]
  travelers: Traveler[]
  expenses: Expense[]
  payments: Payment[]
  rates: Record<string, number>
  me: Traveler | null
  /** Owner or co-admin: can change anything, manage people and links. */
  isOwner: boolean
  /** The original owner only (deletes the group). Missing means the same as isOwner. */
  isPrimaryOwner?: boolean
  /** Member of the group. Only a read-only link page sets this to false.  Owner or co-admin or member. Missing (old data, tests) means yes; only a read-only view sets it to false. */
  canEdit?: boolean
}
