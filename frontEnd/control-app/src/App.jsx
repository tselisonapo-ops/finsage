import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TicketList from './pages/TicketList'
import TicketDetail from './pages/TicketDetail'
import NewTicket from './pages/NewTicket'
import CustomerList from './pages/CustomerList'
import Customer360 from './pages/Customer360'
import Settings from './pages/Settings'

function ProtectedRoute({ children }) {
  const { agent, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-surface-900 flex items-center justify-center text-surface-400">Loading...</div>
  if (!agent) return <Navigate to="/control/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { agent, loading } = useAuth()
  if (loading) return null
  if (agent) return <Navigate to="/control" replace />
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
            <Route path="tickets" element={<TicketList />} />
            <Route path="tickets/new" element={<NewTicket />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="customers" element={<CustomerList />} />
            <Route path="customers/:id" element={<Customer360 />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}