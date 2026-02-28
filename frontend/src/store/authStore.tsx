import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { AuthUser } from '../types'
import api from '../lib/api'

interface AuthContextValue {
  user: AuthUser | null
  login: (email: string, password: string, empresaId: number) => Promise<void>
  logout: () => void
  updateUser: (patch: Partial<Pick<AuthUser, 'nombre' | 'apellidos' | 'email'>>) => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'bt_auth'

function loadStored(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStored)

  const login = useCallback(async (email: string, password: string, empresaId: number) => {
    const res = await api.post('/auth/login', { email, password, empresaId })
    const data: AuthUser = res.data.data
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    setUser(data)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [])

  const updateUser = useCallback((patch: Partial<Pick<AuthUser, 'nombre' | 'apellidos' | 'email'>>) => {
    setUser(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...patch }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

