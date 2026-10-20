import { supabase } from './supabase'
import type { ChecklistItem } from './checklist'

/** Tick an item off (naming who did it) or reopen it. Everyone who can see the list may do this. */
export function tickItem(i: ChecklistItem, me: string) {
  const done = i.status === 'completed'
  return supabase.rpc('set_checklist_item_progress', {
    p_item: i.id, p_status: done ? 'todo' : 'completed',
    p_assigned_name: i.assigned_name, p_assigned_user: i.assigned_user,
    p_completed_by_name: '', p_completed_by_user: done ? null : me,
  })
}
