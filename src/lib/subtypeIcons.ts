/** One icon (the inside of a 24x24 stroke icon) for each itinerary subtype. Subtypes are free text, so common
 *  alternative names map onto the same icon; anything unknown falls back to its category's icon. */
export const SUBTYPE_ICONS: Record<string, string> = {
  flight: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
  train: '<rect x="5" y="3" width="14" height="13" rx="3"/><path d="M5 10h14M8 20l2-4M16 20l-2-4"/><circle cx="9" cy="13" r=".8"/><circle cx="15" cy="13" r=".8"/>',
  bus: '<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16M7 17v3M17 17v3"/><circle cx="8" cy="14" r=".8"/><circle cx="16" cy="14" r=".8"/>',
  car: '<path d="M5 16v-5l2-5h10l2 5v5M3 16h18M5 16v3M19 16v3M5 11h14"/><circle cx="8" cy="13.5" r=".8"/><circle cx="16" cy="13.5" r=".8"/>',
  taxi: '<path d="M5 17v-5l2-4h10l2 4v5M3 17h18M10 4h4v2h-4zM5 12h14"/><circle cx="8" cy="14.5" r=".8"/><circle cx="16" cy="14.5" r=".8"/>',
  ferry: '<path d="M4 15l8-3 8 3-2 5H6zM12 12V3l5 6h-5"/>',
  hotel: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>',
  airbnb: '<path d="M3 11l9-8 9 8M5 10v11h14V10M10 21v-6h4v6"/>',
  hostel: '<path d="M4 21V3M20 21V3M4 8h16M4 16h16M7 8V6h5v2M7 16v-2h5v2"/>',
  restaurant: '<path d="M4 17h16M5 17a7 7 0 0 1 14 0M12 8V6M10 6h4M3 20h18"/>',
  cafe: '<path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 9h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>',
  bar: '<path d="M4 4h16l-8 9zM12 13v7M8 20h8"/>',
  market: '<path d="M3 9l2-5h14l2 5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 12v8h14v-8"/>',
  museum: '<path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18"/>',
  landmark: '<path d="M12 3l3 6-1 12h-4L9 9zM6 21h12"/>',
  tour: '<path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
  hike: '<path d="M3 20l6-11 4 7 3-4 5 8z"/>',
  beach: '<path d="M12 4a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8zM12 12v8M3 21h18"/>',
  show: '<path d="M3 9V6h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6zM14 6v12"/>',
  class: '<path d="M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  souvenirs: '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13M12 8c-2-4-6-3-5 0 .6 1.5 3 1 5 0zM12 8c2-4 6-3 5 0-.6 1.5-3 1-5 0z"/>',
  clothes: '<path d="M8 3l-5 4 3 3 2-1v12h8V9l2 1 3-3-5-4a4 4 0 0 1-8 0z"/>',
  groceries: '<path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9" cy="19.5" r="1.2"/><circle cx="17" cy="19.5" r="1.2"/>',
  meeting: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 20a6 6 0 0 0-3-5"/>',
  call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  conference: '<rect x="3" y="4" width="18" height="11" rx="1.5"/><path d="M12 15v5M8 20h8"/>',
}

/** Other names people type, matched on whole words, mapped to an icon above. Tested in order. */
const ALIASES: Array<[RegExp, keyof typeof SUBTYPE_ICONS]> = [
  [/\b(flight|flights|plane|airline|airport)\b/, 'flight'],
  [/\b(train|rail|railway|metro|subway|tram|tube|amtrak|via rail)\b/, 'train'],
  [/\b(bus|coach|shuttle)\b/, 'bus'],
  [/\b(taxi|cab|uber|lyft|rideshare|ride share|ride-share)\b/, 'taxi'],
  [/\b(car|rental|rental car|drive|driving|parking)\b/, 'car'],
  [/\b(ferry|boat|cruise|ship|vaporetto)\b/, 'ferry'],
  [/\b(hotel|resort|inn|motel|lodge|b&b|bnb)\b/, 'hotel'],
  [/\b(airbnb|apartment|vrbo|rental home|house|villa|cottage|cabin)\b/, 'airbnb'],
  [/\b(hostel|camping|campsite|dorm)\b/, 'hostel'],
  [/\b(restaurant|dinner|lunch|breakfast|brunch|meal|dining|bistro|trattoria)\b/, 'restaurant'],
  [/\b(cafe|café|coffee|bakery|tea)\b/, 'cafe'],
  [/\b(bar|pub|club|nightlife|drinks|wine|brewery)\b/, 'bar'],
  [/\b(market|food hall)\b/, 'market'],
  [/\b(museum|gallery|exhibit|exhibition)\b/, 'museum'],
  [/\b(landmark|monument|sight|sightseeing|castle|church|cathedral|attraction)\b/, 'landmark'],
  [/\b(tour|excursion|guided|walking tour|day trip)\b/, 'tour'],
  [/\b(hike|hiking|trail|walk|trek)\b/, 'hike'],
  [/\b(beach|swim|swimming|snorkel|pool)\b/, 'beach'],
  [/\b(show|concert|theatre|theater|movie|film|opera|game|match|event)\b/, 'show'],
  [/\b(class|lesson|workshop|course|cooking class)\b/, 'class'],
  [/\b(souvenir|souvenirs|gift|gifts)\b/, 'souvenirs'],
  [/\b(clothes|clothing|fashion|shoes)\b/, 'clothes'],
  [/\b(groceries|grocery|supermarket|shop|shopping)\b/, 'groceries'],
  [/\b(meeting|interview|appointment)\b/, 'meeting'],
  [/\b(call|video call|phone)\b/, 'call'],
  [/\b(conference|summit|talk|presentation|seminar)\b/, 'conference'],
]

/** The icon for a subtype name, or null when there is none (the category icon is used instead). */
export function subtypeIcon(subtype: string): string | null {
  const s = subtype.trim().toLowerCase()
  if (!s) return null
  if (SUBTYPE_ICONS[s]) return SUBTYPE_ICONS[s]
  if (s === 'car / rental') return SUBTYPE_ICONS.car
  if (s === 'taxi / rideshare') return SUBTYPE_ICONS.taxi
  if (s === 'café') return SUBTYPE_ICONS.cafe
  for (const [re, key] of ALIASES) if (re.test(s)) return SUBTYPE_ICONS[key]
  return null
}
