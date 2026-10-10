import { typeOf } from '../lib/vault'

/** The small tinted tile for a kind of vault item. Decorative: the type's name is always in the text. */
export default function TypeIcon({ type, size = 40 }: { type: string; size?: number }) {
  const t = typeOf(type)
  return (
    <span className="tyicon" aria-hidden="true" style={{ width: size, height: size, background: t.tint, borderRadius: Math.round(size * 0.27) }}>
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.52)} height={Math.round(size * 0.52)} fill="none" stroke={t.ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: t.icon }} />
    </span>
  )
}
