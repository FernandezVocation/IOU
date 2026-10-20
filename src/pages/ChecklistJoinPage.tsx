import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'

/** Opening a checklist invite link joins it as a member. */
export default function ChecklistJoinPage() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const [error, setError] = useState<string | null>(null)
  async function join() {
    setError(null)
    const { data, error } = await supabase.rpc('join_checklist', { p_code: code })
    if (error) { setError(friendly(error)); return }
    nav('/checklist/' + (data as string), { replace: true })
  }
  return (
    <div className="app">
      <div className="top"><div><h1>Join this checklist</h1><div className="sub">You’ll join as a member: you can add items, tick things off and change the items you add.</div></div></div>
      {error && <div className="notice err" role="alert">{error}</div>}
      <button className="btn primary block" onClick={join}>Join checklist</button>
      <Link className="btn block" to="/checklists" style={{ marginTop: 10 }}>Not now</Link>
    </div>
  )
}
