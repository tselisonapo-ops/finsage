import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import SystemErrorDetail from './pages/SystemErrorDetail';
import TicketList from './pages/TicketList'
import TicketDetail from './pages/TicketDetail'
import NewTicket from './pages/NewTicket'
import CustomerList from './pages/CustomerList'
import Customer360 from './pages/Customer360'
import CustomerSubscription from './pages/CustomerSubscription';
import Settings from './pages/Settings'
import SystemHealth from "./pages/SystemHealth";
import AuditTrail from './pages/AuditTrail'
import NotificationSettings from "./pages/NotificationSettings";
import Automation from './pages/Automation'

function ProtectedRoute({ children }) {
  const { agent, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-surface-900 flex items-center justify-center text-surface-400">Loading...</div>
  if (!agent) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { agent, loading } = useAuth()
  if (loading) return null
  if (agent) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter basename="/control">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="/system/errors/:eventId" element={<SystemErrorDetail />} />
            <Route path="tickets" element={<TicketList />} />
            <Route path="tickets/new" element={<NewTicket />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="customers" element={<CustomerList />} />
            <Route path="customers/:id" element={<Customer360 />} />
            <Route path="/customers/:companyId/subscription" element={<CustomerSubscription />}/>
            <Route path="settings" element={<Settings />} />
            <Route path="/system/health" element={<SystemHealth />}/>
            <Route path="/audit" element={<AuditTrail />}/>
            <Route path="/notifications" element={<NotificationSettings />}/>
            <Route path="/automation" element={<Automation />}/>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}