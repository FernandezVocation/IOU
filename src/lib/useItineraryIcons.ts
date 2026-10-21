import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { buildIconMap, EMPTY_ICONS, type IconMap } from './itineraryIcons'

/** Chosen icons for every itinerary the person can see, by itinerary id. For screens that show items from several itineraries
 *  (such as an expense linked to an itinerary item). Failing to load just means the default icons are used. */
export function useAllItineraryIcons(needed = true): Record<string, IconMap> {
  const [all, setAll] = useState<Record<string, IconMap>>({})
  useEffect(() => {
    if (!needed) return
    let live = true
    ;(async () => {
      try {
        const r = await supabase.from('itinerary_icons').select('itinerary_id, kind, name_key, icon')
        if (r.error || !live) return
        const by: Record<string, Array<{ kind: string; name_key: string; icon: string }>> = {}
        for (const x of (r.data ?? []) as Array<{ itinerary_id: string; kind: string; name_key: string; icon: string }>) (by[x.itinerary_id] ??= []).push(x)
        setAll(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, buildIconMap(v)])))
      } catch { /* default icons */ }
    })()
    return () => { live = false }
  }, [needed])
  return all
}
export const iconsFor = (all: Record<string, IconMap>, itineraryId: string | undefined): IconMap => (itineraryId && all[itineraryId]) || EMPTY_ICONS
