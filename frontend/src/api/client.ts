import axios from 'axios'

const API_KEY = import.meta.env.VITE_API_KEY ?? ''

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  },
})

// AuthProvider registers this callback so the interceptor can signal expiry
// without coupling the axios module to React state directly.
export const authHandlers = { onSessionExpired: null as (() => void) | null }

api.interceptors.response.use(
  res => res,
  err => {
    const url: string = err.config?.url ?? ''
    const status: number = err.response?.status
    const isAuthError = (status === 401 || status === 403) && !url.includes('/auth/login')
    if (isAuthError) {
      if (authHandlers.onSessionExpired) {
        authHandlers.onSessionExpired()
      } else {
        sessionStorage.removeItem('token')
        window.location.replace('/login')
      }
    }
    return Promise.reject(err)
  },
)

export default api
