import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { configured } from './lib/supabase'
import { useAuth } from './lib/auth'
import { ToastProvider, Spinner } from './components/ui'
import AuthPage from './pages/AuthPage'
import GroupsPage from './pages/GroupsPage'
import NewGroupPage from './pages/NewGroupPage'
import JoinPage from './pages/JoinPage'
import { GroupProvider, TabsShell } from './pages/GroupShell'
import ExpensesTab from './pages/ExpensesTab'
import BalancesTab from './pages/BalancesTab'
import TripTab from './pages/TripTab'
import ReceiptsTab from './pages/ReceiptsTab'
import ReportsTab from './pages/ReportsTab'
import SharedPage from './pages/SharedPage'
import OverviewPage from './pages/OverviewPage'
import ExpenseEditor from './pages/ExpenseEditor'
import BreakdownTab from './pages/BreakdownTab'
import MoreTab from './pages/MoreTab'
import VaultsPage from './pages/VaultsPage'
import NewVaultPage from './pages/NewVaultPage'
import VaultJoinPage from './pages/VaultJoinPage'
import { VaultProvider } from './pages/VaultShell'
import VaultHome from './pages/VaultHome'
import VaultItemPage from './pages/VaultItemPage'
import VaultItemEditor from './pages/VaultItemEditor'
import SharedVaultPage from './pages/SharedVaultPage'

/** Old links to the Trip tab now land on group settings. */
function ToSettings() { const { id = '' } = useParams(); return <Navigate to={`/g/${id}/settings`} replace /> }

function RequireAuth() {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (!user) return <Navigate to={'/auth?next=' + encodeURIComponent(loc.pathname + loc.search)} replace />
  return <Outlet />
}

function SetupScreen() {
  return (
    <div className="auth">
      <h1>Almost there</h1>
      <p>This app needs a Supabase project. Add these two values to a <code>.env</code> file (or your host’s environment settings) and restart:</p>
      <div className="code">VITE_SUPABASE_URL<br />VITE_SUPABASE_ANON_KEY</div>
      <p className="muted small">Step-by-step instructions are in the README.</p>
    </div>
  )
}

export default function App() {
  if (!configured) return <SetupScreen />
  return (
    <ToastProvider>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/b/:token" element={<SharedPage />} />
        <Route path="/v/:token" element={<SharedVaultPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<GroupsPage />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/new" element={<NewGroupPage />} />
          <Route path="/vaults" element={<VaultsPage />} />
          <Route path="/vaults/new" element={<NewVaultPage />} />
          <Route path="/vj/:code" element={<VaultJoinPage />} />
          <Route path="/vault/:id" element={<VaultProvider />}>
            <Route index element={<VaultHome />} />
            <Route path="item/new" element={<VaultItemEditor />} />
            <Route path="item/:iid" element={<VaultItemPage />} />
            <Route path="item/:iid/edit" element={<VaultItemEditor />} />
          </Route>
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/g/:id" element={<GroupProvider />}>
            <Route element={<TabsShell />}>
              <Route index element={<ExpensesTab />} />
              <Route path="receipts" element={<ReceiptsTab />} />
              <Route path="balances" element={<BalancesTab />} />
              <Route path="reports" element={<ReportsTab />} />
              <Route path="breakdown" element={<BreakdownTab />} />
              <Route path="more" element={<MoreTab />} />
              <Route path="settings" element={<TripTab />} />
              <Route path="trip" element={<ToSettings />} />
            </Route>
            <Route path="expense/:eid" element={<ExpenseEditor />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}
