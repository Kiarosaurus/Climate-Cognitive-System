import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  Thermometer, Droplets, Wind, AlertTriangle,
  CheckCircle, RefreshCw, Send, Zap, ZapOff, Clock,
} from 'lucide-react'
import axios from 'axios'
import api from '../api/client'
import type { CombinedReading, ReadingInput } from '../types'

const SENSOR_IDS = ['sensor-001', 'sensor-002', 'sensor-003']
const MAX_POINTS = 40

function fmt(n: number | null | undefined, unit = '', dec = 1) {
  return n == null ? '—' : `${n.toFixed(dec)}${unit}`
}
function timeLabel(ms: number) {
  return new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function MetricCard({ icon, label, value, sub, color = 'text-slate-100' }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 flex items-center gap-3">
      <div className="text-slate-400">{icon}</div>
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  )
}

function CognitivePanel({ reading }: { reading: CombinedReading | null }) {
  const action = reading?.output.cognitive_action
  const room = reading?.output.room_context
  const isOn = action?.ac_status === 'ON'
  return (
    <div className="bg-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wide">Acción Cognitiva</h2>
      <div className={`rounded-lg p-4 flex items-center gap-3 ${isOn ? 'bg-blue-900/40 border border-blue-500/40' : 'bg-slate-700/40 border border-slate-600/40'}`}>
        {isOn ? <Zap size={28} className="text-blue-400" /> : <ZapOff size={28} className="text-slate-500" />}
        <div>
          <p className={`text-2xl font-bold ${isOn ? 'text-blue-300' : 'text-slate-400'}`}>{action?.ac_status ?? '—'}</p>
          {action?.cooling_mode && <p className="text-xs text-blue-400">{action.cooling_mode}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {[
          ['Target ajustado', fmt(action?.target, '°C')],
          ['Carga térmica', fmt(action?.thermal_load_offset, '°C', 3)],
          ['Modelo', action?.model ?? '—'],
          ['Personas esp.', room?.expected_people ?? '—'],
        ].map(([k, v]) => (
          <div key={String(k)} className="bg-slate-700/50 rounded p-2">
            <p className="text-slate-400 text-xs">{k}</p>
            <p className="text-slate-100 font-semibold">{String(v)}</p>
          </div>
        ))}
      </div>
      {room && (
        <div className="border-t border-slate-700 pt-3 text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300 text-sm">{room.room_name}</p>
          <p>Capacidad: {room.max_capacity} · Target: {room.target_temp}°C</p>
        </div>
      )}
    </div>
  )
}

export default function GlobalDashboard() {
  const [readings, setReadings] = useState<CombinedReading[]>([])
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<ReadingInput>({ sensor_id: SENSOR_IDS[0], temperature: 24.5, humidity: 55, co2_ppm: 800 })
  const [autoMode, setAutoMode] = useState(false)
  const autoRef = useRef(autoMode)
  autoRef.current = autoMode

  const checkHealth = useCallback(async () => {
    try { await axios.get('/health'); setApiOnline(true) }
    catch { setApiOnline(false) }
  }, [])

  useEffect(() => {
    checkHealth()
    const t = setInterval(checkHealth, 30_000)
    return () => clearInterval(t)
  }, [checkHealth])

  const sendReading = useCallback(async (input: ReadingInput) => {
    setSending(true); setError(null)
    try {
      const { data } = await api.post('/sensors/', { ...input, timestamp: new Date().toISOString() })
      setReadings(prev => [...prev.slice(-(MAX_POINTS - 1)), { input, output: data, sentAt: Date.now() }])
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
        ?? (err as { message?: string })?.message ?? 'Error desconocido'
      setError(String(msg))
    } finally { setSending(false) }
  }, [])

  useEffect(() => {
    if (!autoMode) return
    const t = setInterval(() => {
      if (!autoRef.current) return
      sendReading({
        sensor_id: SENSOR_IDS[Math.floor(Math.random() * SENSOR_IDS.length)],
        temperature: parseFloat((15 + Math.random() * 30).toFixed(1)),
        humidity: parseFloat((30 + Math.random() * 65).toFixed(1)),
        co2_ppm: parseFloat((350 + Math.random() * 1500).toFixed(0)),
      })
    }, 4_000)
    return () => clearInterval(t)
  }, [autoMode, sendReading])

  const latest = readings[readings.length - 1] ?? null
  const anomalyCount = readings.filter(r => r.output.anomaly_detected).length
  const chartData = readings.map(r => ({
    time: timeLabel(r.sentAt),
    temperature: r.input.temperature,
    humidity: r.input.humidity,
    target: r.output.cognitive_action?.target ?? null,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard Global</h1>
          <p className="text-sm text-slate-400">Monitoreo en tiempo real</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {apiOnline === null
            ? <span className="flex items-center gap-1 text-slate-400"><RefreshCw size={13} className="animate-spin" /> Verificando…</span>
            : apiOnline
              ? <span className="flex items-center gap-1 text-emerald-400">● API Online</span>
              : <span className="flex items-center gap-1 text-red-400">● API Offline</span>}
          {latest && <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={12} />{timeLabel(latest.sentAt)}</span>}
        </div>
      </div>

      {latest?.output.anomaly_detected && (
        <div className="bg-red-900/40 border border-red-500/50 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0" />
          <span className="font-semibold text-red-300">Anomalía — </span>
          <span className="text-slate-300 text-sm">{latest.output.sensor_id} · {fmt(latest.input.temperature, '°C')} · {fmt(latest.input.humidity, '% HR')}</span>
        </div>
      )}
      {error && <div className="bg-orange-900/40 border border-orange-500/50 rounded-xl px-4 py-3 text-sm text-orange-300">⚠ {error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={<Thermometer size={24} />} label="Temperatura" value={fmt(latest?.input.temperature, '°C')} sub={latest?.output.sensor_id} color={(latest?.input.temperature ?? 0) > 40 ? 'text-red-400' : 'text-blue-300'} />
        <MetricCard icon={<Droplets size={24} />} label="Humedad" value={fmt(latest?.input.humidity, '%')} color={(latest?.input.humidity ?? 0) > 95 ? 'text-red-400' : 'text-cyan-300'} />
        <MetricCard icon={<Wind size={24} />} label="CO₂" value={fmt(latest?.input.co2_ppm, ' ppm', 0)} color={(latest?.input.co2_ppm ?? 0) > 1500 ? 'text-orange-400' : 'text-green-300'} />
        <MetricCard icon={anomalyCount > 0 ? <AlertTriangle size={24} /> : <CheckCircle size={24} />} label="Anomalías" value={String(anomalyCount)} sub={`de ${readings.length} lecturas`} color={anomalyCount > 0 ? 'text-red-400' : 'text-emerald-400'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-800 rounded-xl p-5">
          <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wide mb-4">Historial (últimas {MAX_POINTS})</h2>
          {chartData.length === 0
            ? <div className="h-64 flex items-center justify-center text-slate-500 text-sm">Sin datos — envía una lectura</div>
            : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <ReferenceLine y={40} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'Límite', fill: '#ef4444', fontSize: 10 }} />
                  <Line type="monotone" dataKey="temperature" name="Temperatura (°C)" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="humidity" name="Humedad (%)" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="target" name="Target AC (°C)" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
        </div>
        <CognitivePanel reading={latest} />
      </div>

      {/* Recent table */}
      <div className="bg-slate-800 rounded-xl p-5 overflow-x-auto">
        <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wide mb-4">Lecturas Recientes</h2>
        {readings.length === 0
          ? <p className="text-slate-500 text-sm text-center py-6">Sin lecturas</p>
          : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase border-b border-slate-700">
                  {['Sensor', 'Temp', 'Humedad', 'CO₂', 'AC', 'Anomalía', 'Hora'].map(h => (
                    <th key={h} className="text-left pb-2 pr-4 last:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...readings].reverse().slice(0, 15).map((r, i) => (
                  <tr key={i} className={`border-b border-slate-700/50 ${r.output.anomaly_detected ? 'bg-red-900/10' : ''}`}>
                    <td className="py-2 pr-4 font-mono text-slate-300">{r.output.sensor_id}</td>
                    <td className={`py-2 pr-4 font-semibold ${r.input.temperature > 40 ? 'text-red-400' : 'text-blue-300'}`}>{fmt(r.input.temperature, '°C')}</td>
                    <td className="py-2 pr-4 text-cyan-300">{fmt(r.input.humidity, '%')}</td>
                    <td className="py-2 pr-4 text-green-300">{fmt(r.input.co2_ppm, '', 0)}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${r.output.cognitive_action?.ac_status === 'ON' ? 'bg-blue-900/50 text-blue-300' : 'bg-slate-700 text-slate-400'}`}>
                        {r.output.cognitive_action?.ac_status ?? '—'}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-center">
                      {r.output.anomaly_detected ? <AlertTriangle size={14} className="text-red-400 inline" /> : <CheckCircle size={14} className="text-emerald-400 inline" />}
                    </td>
                    <td className="py-2 text-right text-slate-400 text-xs">{timeLabel(r.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {/* Send form */}
      <div className="bg-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wide">Enviar Lectura Manual</h2>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-slate-400">Auto-simular (4s)</span>
            <div onClick={() => setAutoMode(v => !v)} className={`w-10 h-5 rounded-full transition-colors relative ${autoMode ? 'bg-blue-600' : 'bg-slate-600'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </label>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Sensor ID</label>
            <select value={form.sensor_id} onChange={e => setForm(f => ({ ...f, sensor_id: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500">
              {SENSOR_IDS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {(['temperature', 'humidity', 'co2_ppm'] as const).map(field => (
            <div key={field}>
              <label className="block text-xs text-slate-400 mb-1">
                {field === 'temperature' ? 'Temperatura (°C)' : field === 'humidity' ? 'Humedad (%)' : 'CO₂ (ppm)'}
              </label>
              <input type="number" step={field === 'co2_ppm' ? '1' : '0.1'} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: parseFloat(e.target.value) }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
            </div>
          ))}
        </div>
        <button onClick={() => sendReading(form)} disabled={sending || autoMode} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors">
          {sending ? <><RefreshCw size={14} className="animate-spin" /> Enviando…</> : <><Send size={14} /> Enviar lectura</>}
        </button>
      </div>
    </div>
  )
}
