import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendly, safeNext } from '../lib/format'

type Mode = 'in' | 'up' | 'link'

export default function AuthPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { user } = useAuth()
  const [mode, setMode] = useState<Mode>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => { if (user) nav(next, { replace: true }) }, [user, next, nav])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setNotice(null)
    const redirectTo = window.location.origin + next
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (mode === 'up') {
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.')
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() }, emailRedirectTo: redirectTo } })
        if (error) throw error
        if (!data.session) setNotice('Check your email for a confirmation link, then come back and sign in.')
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo, shouldCreateUser: true, data: name.trim() ? { name: name.trim() } : undefined } })
        if (error) throw error
        setNotice('We emailed you a sign-in link. Open it on this device.')
      }
    } catch (err) {
      setError(friendly(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <h1>Trip Ledger</h1>
      <p className="muted" style={{ marginTop: 0 }}>Log every expense on a group trip and see who owes whom, in real time.</p>
      <div className="seg" role="group" aria-label="Sign in method" style={{ margin: '18px 0 4px' }}>
        <button type="button" aria-pressed={mode === 'in'} onClick={() => setMode('in')}>Sign in</button>
        <button type="button" aria-pressed={mode === 'up'} onClick={() => setMode('up')}>Create account</button>
        <button type="button" aria-pressed={mode === 'link'} onClick={() => setMode('link')}>Email link</button>
      </div>
      <form onSubmit={submit}>
        {mode !== 'in' && (
          <>
            <label className="lbl" htmlFor="name">Your name</label>
            <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={40} required={mode === 'up'} />
          </>
        )}
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        {mode !== 'link' && (
          <>
            <label className="lbl" htmlFor="pw">Password</label>
            <input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required />
          </>
        )}
        {error && <div className="notice err" role="alert">{error}</div>}
        {notice && <div className="notice ok" role="status">{notice}</div>}
        <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy}>
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Email me a link'}
        </button>
      </form>
    </div>
  )
}
