import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly, fmtTime } from '../lib/format'
import { arrange, filterItems, typeOf, type VaultItem } from '../lib/vault'
import TypeIcon from './TypeIcon'
import { Spinner } from './ui'

export interface VaultMeta { id: string; name: string; personal: boolean }

/** Whose vault an item sits in, for the label on its row. Private (My vault) items are marked so they are never mistaken for shared ones. */
export const vaultTag = (it: Pick<VaultItem, 'vault_id'>, vaults: Record<string, VaultMeta>) => {
  const v = vaults[it.vault_id]
  return v ? { name: v.personal ? 'My vault' : v.name, personal: v.personal } : { name: '', personal: false }
}

/** One timeline of items from every vault the person is in. `view` narrows it to group vaults, My vault, or both. */
export default function AllVaultItems({ vaults, view }: { vaults: VaultMeta[]; view: 'group' | 'private' | 'both' }) {
  const [items, setItems] = useState<VaultItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const meta = useMemo(() => Object.fromEntries(vaults.map(v => [v.id, v])) as Record<string, VaultMeta>, [vaults])

  useEffect(() => {
    if (!vaults.length) { setItems([]); return }
    supabase.from('vault_items').select('*').in('vault_id', vaults.map(v => v.id)).then(({ data, error }) => {
      if (error) { setError(friendly(error)); return }
      setItems(((data ?? []) as VaultItem[]).map(i => ({ ...i, files: [] })))
    })
  }, [vaults])

  const shown = useMemo(() => {
    const list = (items ?? []).filter(i => view === 'both' || (view === 'private') === !!meta[i.vault_id]?.personal)
    return filterItems(list, 'all', q)
  }, [items, view, q, meta])
  const sections = useMemo(() => arrange(shown, 'date'), [shown])

  if (error) return <div className="notice err" role="alert">{error}</div>
  if (items === null) return <Spinner />
  return (
    <div>
      {items.length > 4 && <input type="search" className="inp" placeholder="Search every vault" value={q} onChange={e => setQ(e.target.value)} aria-label="Search every vault" style={{ marginTop: 10 }} />}
      {shown.length === 0 && <div className="empty"><b>No items</b>Nothing to show in this view yet.</div>}
      {sections.map(s => (
        <section key={s.key} className="vsec" aria-label={s.label}>
          <h2 className="vday">{s.label}</h2>
          {s.items.map(it => {
            const tag = vaultTag(it, meta)
            return (
              <div className="vrow" key={it.id}>
                <Link className="vmain" to={`/vault/${it.vault_id}/item/${it.id}`}>
                  <span className="vtime">{it.starts_at ? fmtTime(it.starts_at) : '–'}<small>{it.starts_on ? '' : ''}</small></span>
                  <TypeIcon type={it.type} size={38} />
                  <span className="vtx">
                    <b>{it.title}{tag.personal && <em className="pv priv" title="In your private vault">Private</em>}{!tag.personal && it.private && <em className="pv">Only me</em>}</b>
                    <span>{[typeOf(it.type).label, tag.name, it.booking_ref ? `Ref ${it.booking_ref}` : '', it.place].filter(Boolean).join(' · ')}</span>
                  </span>
                  {it.description && <span className="vdesc" title={it.description}>{it.description}</span>}
                </Link>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
