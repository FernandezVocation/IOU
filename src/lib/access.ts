import type { Expense, GroupData } from './types'

/** Owner or editor. Viewers, and read-only link pages, get false. */
export const canEditGroup = (d: GroupData): boolean => d.canEdit !== false

/**
 * May this person change or delete this expense? The owner can change any; an editor only the ones they added.
 * Mirrors can_modify_expense() in the database, which is the real gate.
 */
export function canModifyExpense(d: GroupData, e: Expense, userId: string): boolean {
  if (d.canEdit === undefined) return true
  if (!d.canEdit) return false
  return d.isOwner || (!!e.created_by && e.created_by === userId)
}

export const roleLabel = (role: string): string => (role === 'owner' ? 'Owner' : role === 'editor' ? 'Can add expenses' : 'View only')
