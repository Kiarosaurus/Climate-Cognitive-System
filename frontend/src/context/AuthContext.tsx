import {
  createContext, useContext, useState, useEffect,
  useCallback, type ReactNode,
} from 'react'
import axios from 'axios'
import { jwtDecode } from 'jwt-decode'
import api from '../api/client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface JwtPayload {
  sub: string
  role: string
  exp: number
}

interface User {
  username: string
  role: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

// ── Provider ──────────────────────────────────────────────────────────────────

function decodeUser(token: string): User | null {
  try {
    const { sub, role, exp } = jwtDecode<JwtPayload>(token)
    if (Date.now() / 1000 > exp) return null   // expired
    return { username: sub, role }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('token'),
  )
  const [user, setUser] = useState<User | null>(() => {
    const t = localStorage.getItem('token')
    return t ? decodeUser(t) : null
  })

  // ── Axios interceptors ────────────────────────────────────────────────────

  useEffect(() => {
    // Inject Bearer token on every request
    const reqId = api.interceptors.request.use(config => {
      const t = localStorage.getItem('token')
      if (t) config.headers.Authorization = `Bearer ${t}`
      return config
    })

    // Auto-logout on 401 (expired or invalid token)
    const resId = api.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401) {
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)
          window.location.href = '/login'
        }
        return Promise.reject(err)
      },
    )

    return () => {
      api.interceptors.request.eject(reqId)
      api.interceptors.response.eject(resId)
    }
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────

  const login = useCallback(async (username: string, password: string) => {
    // OAuth2PasswordRequestForm requires application/x-www-form-urlencoded
    const body = new URLSearchParams({ username, password })
    const { data } = await axios.post<{ access_token: string }>(
      '/api/v1/auth/login',
      body,
    )
    const decoded = decodeUser(data.access_token)
    if (!decoded) throw new Error('Token inválido recibido del servidor')
    localStorage.setItem('token', data.access_token)
    setToken(data.access_token)
    setUser(decoded)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
