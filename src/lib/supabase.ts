import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until the two env vars are set; the app shows a setup screen instead of crashing. */
export const configured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost:54321', key || 'not-configured', {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
