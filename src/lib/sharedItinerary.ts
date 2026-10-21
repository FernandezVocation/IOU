import { supabase } from './supabase'
import type { SharedItineraryItem } from './itinerary'

export interface SharedItinerary {
  itinerary: { name: string; icon: string | null; color: string | null }
  label: string
  include_notes: boolean
  items: SharedItineraryItem[]
  /** Icons chosen for custom category and subtype names. */
  icons?: Array<{ kind: string; name: string; icon: string }>
}

/** null when the link is unknown, expired or turned off. */
export async function fetchSharedItinerary(token: string): Promise<SharedItinerary | null> {
  const { data, error } = await supabase.rpc('get_shared_itinerary', { p_token: token })
  if (error) throw error
  return (data as SharedItinerary | null) ?? null
}
