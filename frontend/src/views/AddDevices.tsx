import { useState, useEffect } from 'react'
import {
  HardDrive, Building2, Radio, PlusCircle,
  RefreshCw, AlertCircle, CheckCircle2, X, Info,
} from 'lucide-react'
import api from '../api/client'

interface Room { id: string; name: string; max_capacity: number }
interface Toast { type: 'success' | 'error'; message: string }

export default function AddDevices() {
  const [rooms, setRooms]               = useState<Room[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [toast, setToast]               = useState<Toast | null>(null)

  const [roomForm, setRoomForm] = useState({
    id: '', name: '', max_capacity: 30, target_temp: 22,
  })
  const [roomSubmitting, setRoomSubmitting] = useState(false)

  const [sensorForm, setSensorForm] = useState({ id: '', room_id: '' })
  const [sensorSubmitting, setSensorSubmitting] = useState(false)

  const showToast = (type: Toast['type'], message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  function refreshRooms() {
    return api.get<Room[]>('/admin/rooms').then(res => {
      setRooms(res.data)
      return res.data
    })
  }

  useEffect(() => {
    refreshRooms()
      .then(data => {
        if (data.length > 0) setSensorForm(f => ({ ...f, room_id: data[0].id }))
      })
      .catch(() => {})
      .finally(() => setRoomsLoading(false))
  }, [])

  async function handleRoomSubmit(e: React.FormEvent) {
    e.preventDefault()
    setRoomSubmitting(true)
    try {
      await api.post('/admin/rooms', {
        id: roomForm.id.trim(),
        name: roomForm.name.trim(),
        max_capacity: roomForm.max_capacity,
        target_temp: roomForm.target_temp,
      })
      showToast('success', `Aula '${roomForm.id}' registrada correctamente.`)
      setRoomForm({ id: '', name: '', max_capacity: 30, target_temp: 22 })
      const updated = await refreshRooms()
      setSensorForm(f => ({
        ...f,
        room_id: f.room_id || (updated[0]?.id ?? ''),
      }))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast('error', detail ?? 'No se pudo registrar el aula.')
    } finally {
      setRoomSubmitting(false)
    }
  }

  async function handleSensorSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sensorForm.room_id) return
    setSensorSubmitting(true)
    try {
      await api.post('/admin/sensors', {
        id: sensorForm.id.trim(),
        room_id: sensorForm.room_id,
      })
      showToast('success', `Sensor '${sensorForm.id}' aprovisionado en aula '${sensorForm.room_id}'.`)
      setSensorForm(f => ({ ...f, id: '' }))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast('error', detail ?? 'No se pudo registrar el sensor.')
    } finally {
      setSensorSubmitting(false)
    }
  }

  const inputCls = "w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition placeholder-slate-500"
  const labelCls = "block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HardDrive size={22} className="text-blue-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Añadir Dispositivos</h1>
          <p className="text-sm text-slate-400">Aprovisionamiento de aulas y sensores físicos</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
          toast.type === 'success'
            ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-300'
            : 'bg-red-900/40 border border-red-500/40 text-red-300'
        }`}>
          <span className="flex items-center gap-2">
            {toast.type === 'success'
              ? <CheckCircle2 size={16} className="shrink-0" />
              : <AlertCircle size={16} className="shrink-0" />}
            {toast.message}
          </span>
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 transition-opacity">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Card: Registrar Aula ─────────────────────────────────────────── */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="flex items-center gap-2 text-slate-200 text-sm font-semibold uppercase tracking-wide mb-5">
            <Building2 size={16} className="text-blue-400" /> Registrar Nueva Aula
          </h2>

          <form onSubmit={handleRoomSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>ID del Aula</label>
              <input
                type="text"
                required
                placeholder="ej. AULA-101"
                value={roomForm.id}
                onChange={e => setRoomForm(f => ({ ...f, id: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Nombre</label>
              <input
                type="text"
                required
                placeholder="ej. Laboratorio de Física"
                value={roomForm.name}
                onChange={e => setRoomForm(f => ({ ...f, name: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Capacidad Máxima</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={roomForm.max_capacity}
                  onChange={e => setRoomForm(f => ({ ...f, max_capacity: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Temperatura Objetivo (°C)</label>
                <input
                  type="number"
                  required
                  min={10}
                  max={35}
                  step={0.5}
                  value={roomForm.target_temp}
                  onChange={e => setRoomForm(f => ({ ...f, target_temp: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={roomSubmitting}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
              >
                {roomSubmitting
                  ? <><RefreshCw size={14} className="animate-spin" /> Guardando…</>
                  : <><PlusCircle size={14} /> Registrar Aula</>}
              </button>
            </div>
          </form>
        </div>

        {/* ── Card: Registrar Sensor ───────────────────────────────────────── */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="flex items-center gap-2 text-slate-200 text-sm font-semibold uppercase tracking-wide mb-5">
            <Radio size={16} className="text-blue-400" /> Registrar Nuevo Sensor
          </h2>

          <form onSubmit={handleSensorSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>ID del Sensor</label>
              <input
                type="text"
                required
                placeholder="ej. sensor-lab-101-a"
                value={sensorForm.id}
                onChange={e => setSensorForm(f => ({ ...f, id: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Aula Asignada</label>
              {roomsLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-2.5">
                  <RefreshCw size={13} className="animate-spin" /> Cargando aulas…
                </div>
              ) : rooms.length === 0 ? (
                <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-900/20 border border-amber-500/30 rounded-lg px-3 py-2.5">
                  <AlertCircle size={14} className="shrink-0" />
                  No hay aulas registradas. Registra una antes de añadir sensores.
                </div>
              ) : (
                <select
                  required
                  value={sensorForm.room_id}
                  onChange={e => setSensorForm(f => ({ ...f, room_id: e.target.value }))}
                  className={inputCls}
                >
                  <option value="" disabled>Selecciona un aula…</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.id} — {r.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Security note */}
            <div className="flex items-start gap-2 bg-slate-700/50 border border-slate-600/60 rounded-lg px-3 py-2.5">
              <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-400">
                Nota: Por seguridad, los sensores nuevos se inicializan apagados y sin control de AC.
                Deberá activarlos desde el Dashboard del aula tras su instalación física.
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={sensorSubmitting || rooms.length === 0 || roomsLoading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
              >
                {sensorSubmitting
                  ? <><RefreshCw size={14} className="animate-spin" /> Guardando…</>
                  : <><PlusCircle size={14} /> Registrar Sensor</>}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}
