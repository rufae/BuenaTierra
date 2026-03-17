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
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Asegurar que el objeto tiene el campo `rol` (migración datos viejos sin rol)
    if (!parsed?.rol) return null
    return parsed
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStored)

  const login = useCallback(async (email: string, password: string, empresaId: number) => {
    // 1. Obtener el token
    const loginRes = await api.post('/auth/login', { email, password, empresaId })
    const { token, refreshToken, expira } = loginRes.data.data as {
      token: string; refreshToken: string; expira: string
    }

    // 2. Obtener los datos del usuario usando el token recién emitido
    const meRes = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const me = meRes.data as {
      id: string; email: string; nombre: string; empresaId: string; rol: string
    }

    // 3. Separar nombre / apellidos: el campo "nombre" del claim contiene NombreCompleto
    const partes = (me.nombre ?? '').trim().split(' ')
    const nombre    = partes[0] ?? ''
    const apellidos = partes.slice(1).join(' ')

    const data: AuthUser = {
      usuarioId:  parseInt(me.id, 10),
      empresaId:  parseInt(me.empresaId, 10),
      nombre,
      apellidos,
      email:      me.email,
      rol:        me.rol as AuthUser['rol'],
      token,
      refreshToken,
      expira,
    }

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

