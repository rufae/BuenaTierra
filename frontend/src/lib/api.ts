import axios from 'axios'

// En Electron (file:// protocol) no hay proxy Vite — apuntamos directamente al API local
const BASE_URL = window.location.protocol === 'file:'
  ? 'http://localhost:5001/api'
  : '/api'

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

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('bt_auth')
      // HashRouter en Electron: navegar por hash; BrowserRouter en web: ruta normal
      window.location.hash = '#/login'
    }
    return Promise.reject(error)
  }
)

export default api
