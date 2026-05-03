import axios from 'axios'

const API_KEY = import.meta.env.VITE_API_KEY ?? ''

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
    ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
  },
})

export default api
