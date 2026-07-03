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

/** Extract the API error message (FastAPI's `response.data.detail`, falling back
 *  to the transport message) without scattering unsound casts across views.
 *  Returns undefined when nothing usable exists, so callers keep their own
 *  `?? 'context-specific fallback'`. */
export function getApiErrorDetail(err: unknown): string | undefined {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string }
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail != null) return JSON.stringify(detail)
  return e?.message
}

export default api
