import axios from 'axios'

const API_KEY = import.meta.env.VITE_API_KEY ?? ''

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  },
})

api.interceptors.response.use(
  res => res,
  err => {
    const url: string = err.config?.url ?? ''
    // Guard: skip if the failing request was already the login endpoint
    // to avoid redirect loops when credentials are wrong.
    if (err.response?.status === 401 && !url.includes('/auth/login')) {
      sessionStorage.removeItem('token')
      // replace() avoids adding the expired-session page to browser history
      window.location.replace('/login')
    }
    return Promise.reject(err)
  },
)

export default api
