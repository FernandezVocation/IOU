import { categoryOf } from '../lib/itinerary'

/** The small tinted tile for a category. Decorative: the category's name is always in the text. */
export default function CategoryIcon({ category, size = 40 }: { category: string; size?: number }) {
  const c = categoryOf(category)
  return (
    <span className="tyicon" aria-hidden="true" style={{ width: size, height: size, background: c.tint, borderRadius: Math.round(size * 0.27) }}>
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.52)} height={Math.round(size * 0.52)} fill="none" stroke={c.ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: c.icon }} />
    </span>
  )
}
