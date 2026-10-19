import { createContext, useContext } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useItineraryData, type ItineraryData } from '../lib/useItinerary'
import { Spinner } from '../components/ui'

interface Ctx { data: ItineraryData; reload: () => Promise<void> }
const ItCtx = createContext<Ctx | null>(null)
/** Exposed so tests can render a screen without the network-backed provider. */
export const ItineraryContext = ItCtx

export function useItinerary(): Ctx {
  const v = useContext(ItCtx)
  if (!v) throw new Error('useItinerary must be used inside an itinerary route')
  return v
}

/** Loads the itinerary once and shares it with every screen under /itinerary/:id. */
export function ItineraryProvider() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data, error, loading, reload } = useItineraryData(id, user?.id ?? '')
  if (loading && !data) return <Spinner label="Loading itinerary…" />
  if (!data) {
    return (
      <div className="app">
        <div className="notice err" role="alert">{error ?? 'Could not load this itinerary.'}</div>
        <Link className="btn block" to="/itineraries">Back to your itineraries</Link>
      </div>
    )
  }
  return <ItCtx.Provider value={{ data, reload }}>{error && <div className="notice err" role="alert" style={{ margin: 12 }}>{error}</div>}<Outlet /></ItCtx.Provider>
}
