import { resolveGlyph, subtypeHasIcon, type IconMap } from '../lib/itineraryIcons'

/** A small inline icon for a subtype name, for chips and headings. Renders nothing when the subtype has no icon of its own. */
export default function SubtypeGlyph({ subtype, icons, size = 16 }: { subtype: string; icons?: IconMap; size?: number }) {
  if (!subtypeHasIcon(subtype, icons)) return null
  const g = resolveGlyph({ category: 'custom', subtype }, icons)
  return <svg className="ck-ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: g }} />
}
