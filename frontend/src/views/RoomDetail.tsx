import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { ArrowLeft, Building2, RefreshCw, AlertCircle, Zap, ZapOff } from 'lucide-react'
import api from '../api/client'

interface RoomDetail {
  id: number
  name: string
  max_capacity: number
  target_temp: number
}

interface SensorReading {
  sensor_id: string
  temperature: number
  humidity: number
  co2_ppm: number | null
  timestamp: string
  anomaly_detected?: boolean
  cognitive_action?: {
    ac_status: string
    cooling_mode: string | null
    target: number | null
    thermal_load_offset: number
    model: string
  }
}

function fmt(n: number | null | undefined, unit = '', dec = 1) {
  return n == null ? '—' : `${n.toFixed(dec)}${unit}`
}

export default function RoomDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [room, setRoom] = useState<RoomDetail | null>(null)
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      api.get<RoomDetail>(`/admin/rooms/${id}`),
      api.get<SensorReading[]>(`/sensors/?room_id=${id}&limit=40`),
    ])
      .then(([roomRes, readingsRes]) => {
        setRoom(roomRes.data)
        setReadings(readingsRes.data)
      })
      .catch(err => {
        setError(err?.response?.data?.detail ?? 'Error cargando datos del aula.')
      })
      .finally(() => setLoading(false))
  }, [id])

  const latest = readings[0] ?? null
  const chartData = [...readings].reverse().map(r => ({
    time: new Date(r.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
    temperature: r.temperature,
    humidity: r.humidity,
    target: r.cognitive_action?.target ?? null,
  }))

  const isOn = latest?.cognitive_action?.ac_status === 'ON'

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
        <RefreshCw size={16} className="animate-spin" /> Cargando…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/40 rounded-lg px-4 py-3 text-sm text-red-300 max-w-md">
        <AlertCircle size={16} className="shrink-0" /> {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/rooms')} className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Building2 size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{room?.name}</h1>
            <p className="text-xs text-slate-400">Cap: {room?.max_capacity} · Target: {room?.target_temp}°C</p>
          </div>
        </div>
      </div>

      {/* AC status + last reading */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`rounded-xl p-5 flex items-center gap-4 ${isOn ? 'bg-blue-900/30 border border-blue-500/40' : 'bg-slate-800 border border-slate-700'}`}>
          {isOn ? <Zap size={32} className="text-blue-400" /> : <ZapOff size={32} className="text-slate-500" />}
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">AC Status</p>
            <p className={`text-2xl font-bold ${isOn ? 'text-blue-300' : 'text-slate-400'}`}>{latest?.cognitive_action?.ac_status ?? '—'}</p>
            {latest?.cognitive_action?.cooling_mode && <p className="text-xs text-blue-400">{latest.cognitive_action.cooling_mode}</p>}
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Temperatura actual</p>
          <p className={`text-2xl font-bold ${(latest?.temperature ?? 0) > 40 ? 'text-red-400' : 'text-blue-300'}`}>{fmt(latest?.temperature, '°C')}</p>
          <p className="text-xs text-slate-500">Target ajustado: {fmt(latest?.cognitive_action?.target, '°C')}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Modelo activo</p>
          <p className="text-2xl font-bold text-purple-300 capitalize">{latest?.cognitive_action?.model ?? '—'}</p>
          <p className="text-xs text-slate-500">Sensor: {latest?.sensor_id ?? '—'}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-slate-800 rounded-xl p-5">
        <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wide mb-4">Historial de lecturas</h2>
        {chartData.length === 0
          ? <div className="h-64 flex items-center justify-center text-slate-500 text-sm">Sin lecturas para este aula</div>
          : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="temperature" name="Temperatura (°C)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="humidity" name="Humedad (%)" stroke="#06b6d4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="target" name="Target AC (°C)" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
      </div>

      {/* Readings table */}
      <div className="bg-slate-800 rounded-xl p-5 overflow-x-auto">
        <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wide mb-4">Últimas lecturas</h2>
        {readings.length === 0
          ? <p className="text-slate-500 text-sm text-center py-6">Sin lecturas</p>
          : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase border-b border-slate-700">
                  {['Sensor', 'Temp', 'Humedad', 'CO₂', 'AC', 'Timestamp'].map(h => (
                    <th key={h} className="text-left pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readings.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="py-2 pr-4 font-mono text-slate-300 text-xs">{r.sensor_id}</td>
                    <td className={`py-2 pr-4 font-semibold ${r.temperature > 40 ? 'text-red-400' : 'text-blue-300'}`}>{fmt(r.temperature, '°C')}</td>
                    <td className="py-2 pr-4 text-cyan-300">{fmt(r.humidity, '%')}</td>
                    <td className="py-2 pr-4 text-green-300">{fmt(r.co2_ppm, '', 0)}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${r.cognitive_action?.ac_status === 'ON' ? 'bg-blue-900/50 text-blue-300' : 'bg-slate-700 text-slate-400'}`}>
                        {r.cognitive_action?.ac_status ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 text-slate-400 text-xs">{new Date(r.timestamp).toLocaleString('es')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}
