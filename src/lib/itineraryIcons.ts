import { ICONS } from './groupLook'
import { categoryOf } from './itinerary'
import { subtypeIcon } from './subtypeIcons'

/** Icons chosen for custom category names and custom subtype names, once per name. Keys are lower-case names. */
export interface IconMap { category: Record<string, string>; subtype: Record<string, string> }
export const EMPTY_ICONS: IconMap = { category: {}, subtype: {} }

export const iconKey = (name: string) => name.trim().toLowerCase().slice(0, 40)

/** Rows from the table (name_key) or from a shared link (name). */
export function buildIconMap(rows: Array<{ kind: string; name_key?: string; name?: string; icon: string }>): IconMap {
  const m: IconMap = { category: {}, subtype: {} }
  for (const r of rows) {
    const k = r.name_key ?? r.name ?? ''
    if (!k) continue
    if (r.kind === 'category') m.category[k] = r.icon
    else if (r.kind === 'subtype') m.subtype[k] = r.icon
  }
  return m
}

/** The icons offered when picking one for a custom name. Ids come from the group icon set. */
export const PICK_ICONS = [
  'star', 'heart', 'flag', 'sparkles', 'bulb', 'folder', 'passport', 'luggage', 'suitcase', 'ticket', 'camera', 'map',
  'compass', 'globe', 'plane', 'car', 'bus', 'train', 'boat', 'bike', 'bed', 'tent', 'mountain', 'beach',
  'umbrella', 'sun', 'snow', 'tree', 'utensils', 'coffee', 'glass', 'wine', 'pizza', 'cake', 'gift', 'cart',
  'bag', 'music', 'film', 'gamepad', 'book', 'cap', 'dumbbell', 'ball', 'golf', 'health', 'pill', 'paw',
  'wallet', 'card', 'receipt', 'briefcase', 'laptop', 'phone', 'printer', 'wrench', 'key', 'home', 'church', 'clock',
]

const svgOf = (id: string | undefined) => (id ? ICONS.find(i => i.id === id)?.svg : undefined)

/** The icon drawn inside the tile for an item. A chosen icon for its subtype wins, then a built-in subtype icon,
 *  then a chosen icon for a custom category, then the category's own icon. */
export function resolveGlyph(item: { category: string; category_label?: string; subtype?: string }, icons: IconMap = EMPTY_ICONS): string {
  const sub = (item.subtype ?? '').trim()
  if (sub) {
    const g = svgOf(icons.subtype[iconKey(sub)]) ?? subtypeIcon(sub)
    if (g) return g
  }
  if (item.category === 'custom' && item.category_label?.trim()) {
    const g = svgOf(icons.category[iconKey(item.category_label)])
    if (g) return g
  }
  return categoryOf(item.category).icon
}

/** Does this subtype name already have an icon of its own (built in, or chosen)? */
export const subtypeHasIcon = (name: string, icons: IconMap = EMPTY_ICONS) => !!svgOf(icons.subtype[iconKey(name)]) || !!subtypeIcon(name)
