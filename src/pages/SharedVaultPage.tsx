import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import GroupIcon from '../components/GroupIcon'
import TypeIcon from '../components/TypeIcon'
import { Spinner, ToastProvider } from '../components/ui'
import { friendly } from '../lib/format'
import { fetchSharedVault, type SharedVault, type SharedVaultItem } from '../lib/sharedVault'
import { arrange, directionsUrl, mapUrl, typeOf, websiteUrl, whenLabel, type VaultItem } from '../lib/vault'

type State = { s: 'loading' } | { s: 'invalid' } | { s: 'error'; msg: string } | { s: 'ok'; v: SharedVault }

/** Public, read-only page behind a secret link. No sign-in, no editing. */
export default function SharedVaultPage() {
  return <ToastProvider><Inner /></ToastProvider>
}

const asItem = (i: SharedVaultItem): VaultItem => ({ ...i, vault_id: 'shared', private: false, created_by: '', files: [] })

function Inner() {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ s: 'loading' })
  const [open, setOpen] = useState<SharedVaultItem | null>(null)

  const load = useCallback(async () => {
    try {
      const v = await fetchSharedVault(token)
      setState(v ? { s: 'ok', v } : { s: 'invalid' })
    } catch (e) { setState({ s: 'error', msg: friendly(e) }) }
  }, [token])

  useEffect(() => {
    load()
    const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex,nofollow'; document.head.appendChild(meta)
    return () => meta.remove()
  }, [load])

  const sections = useMemo(() => state.s === 'ok' ? arrange(state.v.items.map(asItem), 'date') : [], [state])

  if (state.s === 'loading') return <Spinner />
  if (state.s === 'invalid') return (
    <div className="auth"><h1>Link not available</h1><p className="muted">This link isn’t valid any more. It may have been turned off. Ask the person who shared it for a fresh one.</p></div>
  )
  if (state.s === 'error') return <div className="auth"><div className="notice err" role="alert">{state.msg}</div><button className="btn" onClick={load}>Try again</button></div>

  const v = state.v

  return (
    <div className="app">
      <div className="top">
        <div>
          <div className="gh">
            <GroupIcon group={{ kind: 'Vault', icon: v.vault.icon, color: v.vault.color }} size={44} />
            <div><h1>{v.vault.name}</h1><div className="sub">Read-only · shared with {v.label} · times are local to each place</div></div>
          </div>
        </div>
      </div>
      <div className="notice">Read-only link: details only. Attached photos, PDFs and QR codes aren’t included, so ask the owner to send those directly.</div>
      {v.items.length === 0 && <div className="empty"><b>Nothing shared yet</b></div>}
      {sections.map(s => (
        <section key={s.key} className="vsec" aria-label={s.label}>
          <h2 className="vday">{s.label}{s.sub && <span>{s.sub}</span>}</h2>
          {s.items.map(it => (
            <button key={it.id} className="vrow vbtn" onClick={() => setOpen(v.items.find(x => x.id === it.id) ?? null)}>
              <span className="vtime">{it.starts_at ? whenLabel({ starts_on: null, starts_at: it.starts_at, ends_on: null, ends_at: null }) : '–'}</span>
              <TypeIcon type={it.type} size={38} />
              <span className="vtx"><b>{it.title}</b><span>{[it.description, typeOf(it.type).label, it.place].filter(Boolean).join(' · ')}</span></span>
            </button>
          ))}
        </section>
      ))}

      {open && (() => {
        const it = asItem(open), site = websiteUrl(open.website), map = mapUrl(it), dir = directionsUrl(it)
        return (
          <div className="sheet" role="dialog" aria-modal="true" aria-label={open.title}>
            <div className="in">
              <header><span /><h2>{open.title}</h2><button className="btn small" onClick={() => setOpen(null)}>Close</button></header>
              {open.description && <div style={{ fontWeight: 600 }}>{open.description}</div>}
              <div className="sub">{typeOf(open.type).label} · {whenLabel(open)}</div>
              {(map || dir || site) && <div className="vlinks">
                {map && <a className="btn" href={map} target="_blank" rel="noopener noreferrer">Map</a>}
                {dir && <a className="btn" href={dir} target="_blank" rel="noopener noreferrer">Directions</a>}
                {site && <a className="btn" href={site} target="_blank" rel="noopener noreferrer">Website</a>}
              </div>}
              <div className="panel vfacts">
                {open.place && <div><span>Place</span><b>{open.place}</b></div>}
                {open.address && <div><span>Address</span><b>{open.address}</b></div>}
                {open.notes && <div><span>Notes</span><b style={{ whiteSpace: 'pre-wrap' }}>{open.notes}</b></div>}
              </div>
              {open.file_count > 0 && <div className="muted small" style={{ marginTop: 8 }}>{open.file_count} attached file{open.file_count === 1 ? '' : 's'} not shown on read-only links.</div>}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
