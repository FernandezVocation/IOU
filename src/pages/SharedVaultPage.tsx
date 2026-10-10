import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import GroupIcon from '../components/GroupIcon'
import TypeIcon from '../components/TypeIcon'
import QrView from '../components/QrView'
import { Spinner, ToastProvider } from '../components/ui'
import { friendly } from '../lib/format'
import { fetchSharedVault, openVaultSession, signedVaultUrls, type SharedVault, type SharedVaultItem } from '../lib/sharedVault'
import { arrange, directionsUrl, mapUrl, typeOf, websiteUrl, whenLabel, type VaultItem } from '../lib/vault'

type State = { s: 'loading' } | { s: 'invalid' } | { s: 'error'; msg: string } | { s: 'ok'; v: SharedVault }

/** Public, read-only page behind a secret link. No sign-in, no editing. */
export default function SharedVaultPage() {
  return <ToastProvider><Inner /></ToastProvider>
}

const asItem = (i: SharedVaultItem): VaultItem => ({ ...i, vault_id: 'shared', private: false, created_by: '', files: i.files.map(f => ({ ...f, item_id: i.id })) })

function Inner() {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ s: 'loading' })
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [noFiles, setNoFiles] = useState(false)
  const [open, setOpen] = useState<SharedVaultItem | null>(null)
  const [full, setFull] = useState<SharedVaultItem | null>(null)

  const load = useCallback(async () => {
    try {
      const v = await fetchSharedVault(token)
      setState(v ? { s: 'ok', v } : { s: 'invalid' })
      if (v) {
        const paths = v.items.flatMap(i => i.files.map(f => f.path))
        if (paths.length) {
          const c = await openVaultSession(token)
          if (c) setUrls(await signedVaultUrls(c, paths)); else setNoFiles(true)
        }
      }
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
  const files = (i: SharedVaultItem) => i.files.filter(f => urls[f.path]).map(f => ({ url: urls[f.path], label: f.label || f.name, mime: f.mime }))

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
      {noFiles && <div className="notice">Photos and PDFs aren’t available on this link right now. The details below are.</div>}
      {v.items.length === 0 && <div className="empty"><b>Nothing shared yet</b></div>}
      {sections.map(s => (
        <section key={s.key} className="vsec" aria-label={s.label}>
          <h2 className="vday">{s.label}{s.sub && <span>{s.sub}</span>}</h2>
          {s.items.map(it => (
            <button key={it.id} className="vrow vbtn" onClick={() => setOpen(v.items.find(x => x.id === it.id) ?? null)}>
              <span className="vtime">{it.starts_at ? whenLabel({ starts_on: null, starts_at: it.starts_at, ends_on: null, ends_at: null }) : '–'}</span>
              <TypeIcon type={it.type} size={38} />
              <span className="vtx"><b>{it.title}</b><span>{[typeOf(it.type).label, it.place].filter(Boolean).join(' · ')}</span></span>
            </button>
          ))}
        </section>
      ))}

      {open && (() => {
        const it = asItem(open), imgs = files(open), site = websiteUrl(open.website), map = mapUrl(it), dir = directionsUrl(it)
        return (
          <div className="sheet" role="dialog" aria-modal="true" aria-label={open.title}>
            <div className="in">
              <header><span /><h2>{open.title}</h2><button className="btn small" onClick={() => setOpen(null)}>Close</button></header>
              <div className="sub">{typeOf(open.type).label} · {whenLabel(open)}</div>
              {imgs.length > 0 && <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setFull(open)}>Show {imgs.length > 1 ? 'codes' : 'ticket or code'} full screen</button>}
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
              {open.files.length > 0 && <div className="vfiles">{open.files.map(f => urls[f.path] && (
                <div className="vfile" key={f.id}>{f.mime.startsWith('image/') ? <a href={urls[f.path]} target="_blank" rel="noopener noreferrer"><img src={urls[f.path]} alt={f.label || f.name || 'Attached file'} /></a> : <a className="btn" href={urls[f.path]} target="_blank" rel="noopener noreferrer">Open {f.name || 'PDF'}</a>}{f.label && <span className="muted small">{f.label}</span>}</div>
              ))}</div>}
            </div>
          </div>
        )
      })()}
      {full && <QrView title={full.title} when={whenLabel(full)} images={files(full)} onClose={() => setFull(null)} />}
    </div>
  )
}
