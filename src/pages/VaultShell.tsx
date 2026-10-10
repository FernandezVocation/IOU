import { createContext, useContext } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useVaultData, type VaultData } from '../lib/useVault'
import { Spinner } from '../components/ui'

interface Ctx { data: VaultData; reload: () => Promise<void> }
const VaultCtx = createContext<Ctx | null>(null)
/** Exposed so tests can render a screen without the network-backed provider. */
export const VaultContext = VaultCtx

export function useVault(): Ctx {
  const v = useContext(VaultCtx)
  if (!v) throw new Error('useVault must be used inside a vault route')
  return v
}

/** Loads the vault once and shares it with every screen under /vault/:id. */
export function VaultProvider() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data, error, loading, reload } = useVaultData(id, user?.id ?? '')
  if (loading && !data) return <Spinner label="Loading vault…" />
  if (!data) {
    return (
      <div className="app">
        <div className="notice err" role="alert">{error ?? 'Could not load this vault.'}</div>
        <Link className="btn block" to="/vaults">Back to your vaults</Link>
      </div>
    )
  }
  return <VaultCtx.Provider value={{ data, reload }}>{error && <div className="notice err" role="alert" style={{ margin: 12 }}>{error}</div>}<Outlet /></VaultCtx.Provider>
}
