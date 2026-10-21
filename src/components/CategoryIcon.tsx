import { categoryOf } from '../lib/itinerary'
import { resolveGlyph, type IconMap } from '../lib/itineraryIcons'

/** The small tinted tile for an item. With a subtype (Flight, Hotel, Museum…) it shows that subtype's icon, and a custom
 *  category or subtype shows the icon chosen for its name. Always in the category's colours. Decorative: the name is in the text. */
export default function CategoryIcon({ category, categoryLabel = '', subtype = '', icons, size = 40 }: { category: string; categoryLabel?: string; subtype?: string; icons?: IconMap; size?: number }) {
  const c = categoryOf(category)
  const glyph = resolveGlyph({ category, category_label: categoryLabel, subtype }, icons)
  return (
    <span className="tyicon" aria-hidden="true" style={{ width: size, height: size, background: c.tint, borderRadius: Math.round(size * 0.27) }}>
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.52)} height={Math.round(size * 0.52)} fill="none" stroke={c.ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: glyph }} />
    </span>
  )
}
