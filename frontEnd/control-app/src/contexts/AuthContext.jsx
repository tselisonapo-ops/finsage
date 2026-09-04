import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [agent, setAgent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('control_token')
    if (!token) {
      setLoading(false)
      return
    }
    api.get('/auth/me').then(data => {
      setAgent(data)
    }).catch(() => {
      localStorage.removeItem('control_token')
    }).finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password })
    localStorage.setItem('control_token', data.token)
    setAgent(data.agent)
    return data
  }

  const logout = () => {
    localStorage.removeItem('control_token')
    setAgent(null)
  }

  return (
    <AuthContext.Provider value={{ agent, loading, login, logout, isAdmin: agent?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}