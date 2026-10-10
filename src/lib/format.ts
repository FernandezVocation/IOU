export const COMMON_CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CHF', 'MXN', 'NZD', 'INR', 'CNY', 'THB', 'KRW', 'SEK', 'NOK', 'DKK', 'AED', 'TRY', 'BRL', 'ZAR']

export const fmtDate = (d: string): string => {
  try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) } catch { return d }
}
export const fmtTime = (t: string | null): string => {
  if (!t) return ''
  try { return new Date('2000-01-01T' + t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) } catch { return t }
}
const p2 = (n: number) => String(n).padStart(2, '0')
export const todayStr = (): string => { const n = new Date(); return `${n.getFullYear()}-${p2(n.getMonth() + 1)}-${p2(n.getDate())}` }
export const nowTime = (): string => { const n = new Date(); return `${p2(n.getHours())}:${p2(n.getMinutes())}` }
export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'
export const initial = (s: string): string => (s.trim()[0] ?? '?').toUpperCase()

/** Turn a Supabase/Postgres error into something a traveler can act on. */
export function friendly(e: unknown): string {
  const err = e as { message?: string; code?: string } | null
  const msg = err?.message ?? ''
  const code = err?.code ?? ''
  if (code === '23503' || /foreign key/i.test(msg)) return 'That person is still used on an expense or payment.'
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'You do not have permission to do that.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'You appear to be offline. Check your connection and try again.'
  if (/Invalid login credentials/i.test(msg)) return 'Email or password is incorrect.'
  if (/already registered/i.test(msg)) return 'That email already has an account. Sign in instead.'
  if (/Email not confirmed/i.test(msg)) return 'Confirm your email first. Check your inbox for the link.'
  if (/payload too large|exceeded the maximum allowed size/i.test(msg)) return 'That file is too large (10 MB max).'
  return msg || 'Something went wrong. Try again.'
}

/** Only allow same-site paths as post-login redirects. */
export const safeNext = (n: string | null): string => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/')

/** jsPDF's built-in fonts are Latin-1: swap smart punctuation, replace anything else with "?". */
export const l1 = (s: unknown): string =>
  String(s ?? '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2192/g, '->').replace(/[^\u0000-\u00ff]/g, '?')
