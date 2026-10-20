import type { ItemType } from '../lib/checklist'
import { ICONS } from '../lib/groupLook'

const PATHS: Record<ItemType, string> = {
  todo: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.500 12l2.500 2.500 4.500-5"/>',
  purchase: '<path d="M3 4h2.500l2 11h10l2-8H7"/><circle cx="9" cy="19.500" r="1.200"/><circle cx="17" cy="19.500" r="1.200"/>',
  packing: '<rect x="5" y="8" width="14" height="12" rx="2.500"/><path d="M9 8V5.500A1.500 1.500 0 0 1 10.500 4h3A1.500 1.500 0 0 1 15 5.500V8M9 12v5M15 12v5"/>',
  booking: '<rect x="3.500" y="5" width="17" height="15" rx="2.500"/><path d="M3.500 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>',
  custom: '<path d="M12 3l2.600 5.500 6 .8-4.400 4.200 1.100 6-5.300-2.900L6.700 19.500l1.100-6L3.400 9.300l6-.8z"/>',
}
export const TYPE_COLORS: Record<ItemType, string> = { todo: '#3556CC', purchase: '#1E7A42', packing: '#C25416', booking: '#7239A8', custom: '#5F6B66' }

/** Small coloured icon that tells the item types apart at a glance. */
export default function ChecklistTypeIcon({ type, size = 18, icon }: { type: ItemType; size?: number; icon?: string }) {
  const own = type === 'custom' && icon ? ICONS.find(x => x.id === icon)?.svg : undefined
  return (
    <svg className="ck-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={TYPE_COLORS[type]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: own ?? PATHS[type] }} />
  )
}
