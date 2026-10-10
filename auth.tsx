import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  displayName: string
  signOut: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setLoading(false) } })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => { setSession(s); setLoading(false) })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthState>(() => {
    const user = session?.user ?? null
    const meta = (user?.user_metadata ?? {}) as { name?: string }
    return {
      user, session, loading,
      displayName: (meta.name || user?.email?.split('@')[0] || '').slice(0, 40),
      signOut: async () => { await supabase.auth.signOut() },
    }
  }, [session, loading])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
