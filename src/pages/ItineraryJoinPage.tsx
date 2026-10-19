import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { Spinner } from '../components/ui'

/** Opening an itinerary invite link joins it as a member. */
export default function ItineraryJoinPage() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  async function join() {
    setError(null)
    const { data, error } = await supabase.rpc('join_itinerary', { p_code: code })
    if (error) { setError(friendly(error)); return }
    nav('/itinerary/' + (data as string), { replace: true })
  }
  useEffect(() => { setReady(true) }, [])

  if (!ready) return <Spinner />
  return (
    <div className="app">
      <div className="top"><div><h1>Join this itinerary</h1><div className="sub">You’ll join as a member: you can add items and change the ones you add.</div></div></div>
      {error && <div className="notice err" role="alert">{error}</div>}
      <button className="btn primary block" onClick={join}>Join itinerary</button>
      <Link className="btn block" to="/itineraries" style={{ marginTop: 10 }}>Not now</Link>
    </div>
  )
}
