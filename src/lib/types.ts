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
}
export interface Member {
  user_id: string
  /** owner: everything. editor: adds expenses, changes only their own. viewer: read-only. */
  role: 'owner' | 'editor' | 'viewer'
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
export interface Expense {
  id: string
  group_id: string
  spent_on: string
  spent_at: string | null
  vendor: string
  location: string
  category: string
  /** Optional second level under the category ("Food" › "Dinner"). */
  subcategory?: string
  notes: string
  amount: number
  currency: string
  settled_amount: number | null
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
  isOwner: boolean
  /** Owner or editor. Missing (old data, tests) means yes; only a read-only view sets it to false. */
  canEdit?: boolean
}
