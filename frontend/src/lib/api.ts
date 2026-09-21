import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '')
const apiOrigin = configuredApiUrl || (window.location.protocol === 'file:' ? 'http://localhost:5001' : '')
const BASE_URL = apiOrigin ? `${apiOrigin}/api` : '/api'

export const getApiOrigin = () => apiOrigin || 'http://localhost:5001'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token on every request
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('bt_auth')
  if (stored) {
    const { token } = JSON.parse(stored)
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Refresh silencioso: si una petición devuelve 401, intenta renovar el token
// con el refresh token y reintenta la petición original una sola vez.
interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

let refreshPromise: Promise<string | null> | null = null

async function tryRefresh(): Promise<string | null> {
  const stored = localStorage.getItem('bt_auth')
  if (!stored) return null

  const auth = JSON.parse(stored)
  if (!auth.refreshToken) return null

  try {
    // Usar una instancia plana para no entrar en bucle con el interceptor
    const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken: auth.refreshToken })
    const { token, refreshToken, expira } = res.data.data as {
      token: string; refreshToken: string; expira: string
    }
    localStorage.setItem('bt_auth', JSON.stringify({ ...auth, token, refreshToken, expira }))
    return token
  } catch {
    localStorage.removeItem('bt_auth')
    return null
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true

      if (!refreshPromise) {
        refreshPromise = tryRefresh().finally(() => {
          refreshPromise = null
        })
      }

      const newToken = await refreshPromise

      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }

      window.location.hash = '#/login'
    }

    return Promise.reject(error)
  },
)

export default api
