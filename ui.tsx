import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { initial } from '../lib/format'

/* ---------- toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const t = useRef<ReturnType<typeof setTimeout>>()
  const show = useCallback((m: string) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 3600) }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  )
}

/* ---------- two-tap confirm ---------- */
/** Destructive buttons ask for a second tap instead of a modal; the arm resets after 4 s. */
export function useArm() {
  const [key, setKey] = useState<string | null>(null)
  const t = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(t.current), [])
  return {
    is: (k: string) => key === k,
    arm: (k: string) => { setKey(k); clearTimeout(t.current); t.current = setTimeout(() => setKey(null), 4000) },
    clear: () => setKey(null),
  }
}

/* ---------- avatar ---------- */
export function Avatar({ name, color }: { name: string; color: string }) {
  return <span className="av" style={{ background: color }} aria-hidden="true">{initial(name)}</span>
}

/* ---------- bottom sheet / full-screen panel ---------- */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="in">
        <header>
          <span />
          <h2>{title}</h2>
          <button className="btn small" onClick={onClose}>Close</button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return <div className="empty" role="status">{label}</div>
}

/* ---------- confirmation dialog ---------- */
/** For destructive actions. Cancel is focused first, so an accidental Enter does not delete. */
export function ConfirmDialog({ title, children, confirmLabel = 'Delete', tone = 'danger', busy = false, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary'; busy?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onCancel])
  return (
    <div className="dlg-back" role="presentation" onClick={onCancel}>
      <div className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" onClick={e => e.stopPropagation()}>
        <h2 id="dlg-title">{title}</h2>
        <div className="dlg-body">{children}</div>
        <div className="row2">
          <button className="btn" ref={cancelRef} onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={tone === 'primary' ? 'btn primary' : 'btn danger armed'} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
