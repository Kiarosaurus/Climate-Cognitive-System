import { useState, useEffect, useCallback } from 'react'
import {
  CalendarDays, RefreshCw, AlertCircle, Users,
  Clock, CheckCircle2, PlusCircle, X,
} from 'lucide-react'
import api from '../api/client'

interface Room { id: number; name: string; max_capacity: number }

interface Reservation {
  id: number
  room_id: number
  room_name?: string
  user_id: number
  username?: string
  start_time: string
  end_time: string
  expected_occupancy: number
}

interface Toast { type: 'success' | 'error'; message: string }

function formatDt(iso: string) {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function nowPlus(minutes: number) {
  const d = new Date()
  d.setMinutes(d.getMinutes() + minutes)
  return d
}

export default function Reservations() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({
    room_id: '',
    start_time: toLocalInputValue(nowPlus(5)),
    end_time: toLocalInputValue(nowPlus(65)),
    expected_occupancy: 1,
  })

  const showToast = (type: Toast['type'], message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchReservations = useCallback(() => {
    api.get<Reservation[]>('/admin/reservations')
      .then(res => setReservations(res.data))
      .catch(err => setError(err?.response?.data?.detail ?? 'Error cargando reservas.'))
  }, [])

  useEffect(() => {
    Promise.all([
      api.get<Room[]>('/admin/rooms'),
      api.get<Reservation[]>('/admin/reservations'),
    ])
      .then(([roomsRes, resRes]) => {
        setRooms(roomsRes.data)
        setReservations(resRes.data)
        if (roomsRes.data.length > 0) {
          setForm(f => ({ ...f, room_id: String(roomsRes.data[0].id) }))
        }
      })
      .catch(err => setError(err?.response?.data?.detail ?? 'Error cargando datos.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.room_id) return

    // Convert datetime-local string → ISO for the backend
    const toISO = (local: string) => new Date(local).toISOString()

    setSubmitting(true)
    try {
      await api.post('/admin/reservations', {
        room_id: Number(form.room_id),
        start_time: toISO(form.start_time),
        end_time: toISO(form.end_time),
        expected_occupancy: form.expected_occupancy,
      })
      showToast('success', 'Reserva creada correctamente.')
      fetchReservations()
      // Reset times
      setForm(f => ({
        ...f,
        start_time: toLocalInputValue(nowPlus(5)),
        end_time: toLocalInputValue(nowPlus(65)),
        expected_occupancy: 1,
      }))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast('error', detail ?? 'No se pudo crear la reserva.')
    } finally {
      setSubmitting(false)
    }
  }

  const now = Date.now()
  const upcoming = reservations.filter(r => new Date(r.end_time).getTime() > now)
  const past = reservations.filter(r => new Date(r.end_time).getTime() <= now)

  function Section({ title, items }: { title: string; items: Reservation[] }) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
          {title} <span className="text-slate-600">({items.length})</span>
        </h2>
        {items.length === 0 ? (
          <p className="text-slate-500 text-sm py-4 text-center bg-slate-800 rounded-xl border border-slate-700">Sin reservas</p>
        ) : (
          <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs uppercase border-b border-slate-700 bg-slate-800/80">
                  {['Aula', 'Usuario', 'Inicio', 'Fin', 'Ocupantes'].map(h => (
                    <th key={h} className="text-left px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(r => {
                  const active = new Date(r.start_time).getTime() <= now && new Date(r.end_time).getTime() > now
                  return (
                    <tr key={r.id} className={`border-b border-slate-700/50 last:border-0 ${active ? 'bg-blue-900/10' : ''}`}>
                      <td className="px-4 py-3 font-medium text-slate-200">
                        {r.room_name ?? `Aula ${r.room_id}`}
                        {active && (
                          <span className="ml-2 text-xs bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded-full">
                            En curso
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{r.username ?? `#${r.user_id}`}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        <span className="flex items-center gap-1"><Clock size={11} />{formatDt(r.start_time)}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{formatDt(r.end_time)}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-slate-300 text-xs">
                          <Users size={11} />{r.expected_occupancy}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  const inputCls = "w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition placeholder-slate-500"
  const labelCls = "block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CalendarDays size={22} className="text-blue-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Reservas</h1>
          <p className="text-sm text-slate-400">Gestión de reservas de aulas</p>
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

      {/* Global error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/40 rounded-lg px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {/* Create reservation form */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="flex items-center gap-2 text-slate-200 text-sm font-semibold uppercase tracking-wide mb-5">
          <PlusCircle size={16} className="text-blue-400" /> Nueva Reserva
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <RefreshCw size={14} className="animate-spin" /> Cargando aulas…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Room */}
            <div className="md:col-span-2">
              <label className={labelCls}>Aula</label>
              <select
                required
                value={form.room_id}
                onChange={e => setForm(f => ({ ...f, room_id: e.target.value }))}
                className={inputCls}
              >
                <option value="" disabled>Selecciona un aula…</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} — capacidad {r.max_capacity}
                  </option>
                ))}
              </select>
            </div>

            {/* Start */}
            <div>
              <label className={labelCls}>Inicio</label>
              <input
                type="datetime-local"
                required
                value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className={inputCls}
              />
            </div>

            {/* End */}
            <div>
              <label className={labelCls}>Fin</label>
              <input
                type="datetime-local"
                required
                value={form.end_time}
                min={form.start_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className={inputCls}
              />
            </div>

            {/* Occupancy */}
            <div>
              <label className={labelCls}>Ocupantes esperados</label>
              <input
                type="number"
                required
                min={1}
                max={rooms.find(r => String(r.id) === form.room_id)?.max_capacity ?? 999}
                value={form.expected_occupancy}
                onChange={e => setForm(f => ({ ...f, expected_occupancy: Number(e.target.value) }))}
                className={inputCls}
              />
            </div>

            {/* Submit */}
            <div className="md:col-span-2 flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting || !form.room_id}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
              >
                {submitting
                  ? <><RefreshCw size={14} className="animate-spin" /> Guardando…</>
                  : <><PlusCircle size={14} /> Crear reserva</>}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Reservation lists */}
      {!loading && (
        <>
          <Section title="Próximas / Activas" items={upcoming} />
          <Section title="Pasadas" items={past} />
        </>
      )}
    </div>
  )
}
