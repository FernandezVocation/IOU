import { useState } from 'react'
import { CATEGORIES, catDef, catStyle } from '../lib/categories'

interface Props {
  category: string
  subcategory: string
  /** Earlier expenses in this group, used to offer back custom entries that were typed before. */
  history: Array<{ category: string; subcategory?: string }>
  onChange: (category: string, subcategory: string) => void
}

const uniq = (a: string[]) => [...new Set(a)]

/** Category chips, then sub-category chips for the chosen one. Both levels accept any typed text via "Custom…". */
export default function CategoryPicker({ category, subcategory, history, onChange }: Props) {
  const def = catDef(category)
  const [customCat, setCustomCat] = useState(() => !!category && !catDef(category))
  const [customSub, setCustomSub] = useState(() => !!subcategory && !(def?.subs.includes(subcategory)))

  const rememberedCats = uniq(history.map(h => h.category).filter(c => c && !catDef(c))).slice(0, 8)
  const rememberedSubs = def
    ? uniq(history.filter(h => h.category === category && h.subcategory && !def.subs.includes(h.subcategory)).map(h => h.subcategory as string)).slice(0, 8)
    : []

  const pickCat = (name: string) => { setCustomCat(false); setCustomSub(false); onChange(name, category === name ? subcategory : '') }
  const pickRememberedCat = (name: string) => { setCustomCat(true); setCustomSub(false); onChange(name, category === name ? subcategory : '') }
  const pickCustomCat = () => { setCustomCat(true); setCustomSub(false); if (catDef(category)) onChange('', '') }
  const pickSub = (s: string) => { setCustomSub(false); onChange(category, subcategory === s ? '' : s) }
  const pickCustomSub = () => { setCustomSub(true); if (def?.subs.includes(subcategory)) onChange(category, '') }

  const customCatActive = customCat && !rememberedCats.includes(category)
  const customSubActive = customSub && !rememberedSubs.includes(subcategory)

  return (
    <div>
      <span className="lbl" id="cat-l">Category</span>
      <div className="chips" role="group" aria-labelledby="cat-l" style={{ marginTop: 0 }}>
        {CATEGORIES.map(c => (
          <button type="button" key={c.name} className="chip withdot" aria-pressed={!customCat && category === c.name} onClick={() => pickCat(c.name)}>
            <i className="dot" style={catStyle(c.name)} />{c.name}
          </button>
        ))}
        {rememberedCats.map(c => (
          <button type="button" key={'r' + c} className="chip withdot" aria-pressed={customCat && category === c} onClick={() => pickRememberedCat(c)}>
            <i className="dot" style={catStyle(c)} />{c}
          </button>
        ))}
        <button type="button" className="chip dashed" aria-pressed={customCatActive} onClick={pickCustomCat}>Custom…</button>
      </div>

      {customCat && (
        <>
          <label className="lbl" htmlFor="cat">Custom category <span className="muted">(type anything)</span></label>
          <input type="text" id="cat" maxLength={60} autoComplete="off" placeholder="e.g. Pets, Childcare, Laundry" value={category} onChange={e => onChange(e.target.value, subcategory)} />
          <label className="lbl" htmlFor="subcat">Sub-category <span className="muted">(optional, type anything)</span></label>
          <input type="text" id="subcat" maxLength={60} autoComplete="off" value={subcategory} onChange={e => onChange(category, e.target.value)} />
        </>
      )}

      {!customCat && def && (
        <>
          <span className="lbl" id="sub-l">Sub-category <span className="muted">(optional)</span></span>
          <div className="chips" role="group" aria-labelledby="sub-l" style={{ marginTop: 0 }}>
            {def.subs.map(s => <button type="button" key={s} className="chip" aria-pressed={!customSub && subcategory === s} onClick={() => pickSub(s)}>{s}</button>)}
            {rememberedSubs.map(s => <button type="button" key={'r' + s} className="chip" aria-pressed={subcategory === s} onClick={() => { setCustomSub(true); onChange(category, s) }}>{s}</button>)}
            <button type="button" className="chip dashed" aria-pressed={customSubActive} onClick={pickCustomSub}>Custom…</button>
          </div>
          {customSub && (
            <>
              <label className="lbl" htmlFor="subcat">Custom sub-category</label>
              <input type="text" id="subcat" maxLength={60} autoComplete="off" placeholder="type anything" value={subcategory} onChange={e => onChange(category, e.target.value)} />
            </>
          )}
        </>
      )}
    </div>
  )
}
