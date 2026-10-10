import { useEffect, useState } from 'react'

export interface QrImage { url: string; label: string; mime: string }

/**
 * A ticket or code on a plain white screen, as large as it fits, for scanning at a gate.
 * A web page cannot change the phone's brightness, so this keeps the screen awake (where the browser allows)
 * and shows the code on white. Turn the brightness up before you reach the gate.
 */
export default function QrView({ title, when, images, onClose }: { title: string; when: string; images: QrImage[]; onClose: () => void }) {
  const [n, setN] = useState(0)

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then(l => { lock = l }).catch(() => { /* not allowed here; harmless */ })
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('keydown', k); lock?.release().catch(() => { /* ignore */ }) }
  }, [onClose])

  const cur = images[n]
  return (
    <div className="qrview" role="dialog" aria-modal="true" aria-label={`${title}, full screen`}>
      <div className="qrtop">
        <button className="ib" onClick={onClose} aria-label="Close"><svg className="i" viewBox="0 0 24 24" width="22" height="22"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        {images.length > 1 && <span className="muted small">{n + 1} of {images.length}</span>}
        <span style={{ width: 44 }} />
      </div>
      <h1>{title}</h1>
      {when && <p>{when}</p>}
      {cur && (cur.mime === 'application/pdf'
        ? <a className="btn primary" href={cur.url} target="_blank" rel="noopener noreferrer">Open the PDF</a>
        : <img className="qrimg" src={cur.url} alt={cur.label ? `${title}, ${cur.label}` : title} />)}
      {images.length > 1 && (
        <div className="qrsw" role="group" aria-label="Which code">
          {images.map((im, i) => <button key={i} aria-pressed={n === i} onClick={() => setN(i)}>{im.label || `Code ${i + 1}`}</button>)}
        </div>
      )}
      <p className="qrnote">Raise your screen brightness before you scan.</p>
    </div>
  )
}
