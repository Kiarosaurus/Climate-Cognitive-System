import { useState, useEffect } from 'react'
import { CalendarDays, RefreshCw, AlertCircle, Users, Clock } from 'lucide-react'
import api from '../api/client'

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

function formatDt(iso: string) {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function Reservations() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<Reservation[]>('/admin/reservations')
      .then(res => setReservations(res.data))
      .catch(err => setError(err?.response?.data?.detail ?? 'Error cargando reservas.'))
      .finally(() => setLoading(false))
  }, [])

  const now = Date.now()
  const upcoming = reservations.filter(r => new Date(r.end_time).getTime() > now)
  const past = reservations.filter(r => new Date(r.end_time).getTime() <= now)

  function Section({ title, items }: { title: string; items: Reservation[] }) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">{title} ({items.length})</h2>
        {items.length === 0
          ? <p className="text-slate-500 text-sm py-4 text-center bg-slate-800 rounded-xl">Sin reservas</p>
          : (
            <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase border-b border-slate-700">
                    {['Aula', 'Usuario', 'Inicio', 'Fin', 'Ocupantes'].map(h => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(r => {
                    const active = new Date(r.start_time).getTime() <= now && new Date(r.end_time).getTime() > now
                    return (
                      <tr key={r.id} className={`border-b border-slate-700/50 ${active ? 'bg-blue-900/10' : ''}`}>
                        <td className="px-4 py-3 font-medium text-slate-200">
                          {r.room_name ?? `Aula ${r.room_id}`}
                          {active && <span className="ml-2 text-xs bg-blue-600/30 text-blue-300 px-1.5 py-0.5 rounded">En curso</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{r.username ?? `#${r.user_id}`}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          <span className="flex items-center gap-1"><Clock size={11} />{formatDt(r.start_time)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{formatDt(r.end_time)}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1 text-slate-300">
                            <Users size={13} />{r.expected_occupancy}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays size={22} className="text-blue-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Reservas</h1>
          <p className="text-sm text-slate-400">Historial y reservas activas por aula</p>
        </div>
      </div>

      {loading && <div className="flex items-center gap-2 text-slate-400 text-sm"><RefreshCw size={14} className="animate-spin" /> Cargando…</div>}
      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/40 rounded-lg px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <Section title="Próximas / Activas" items={upcoming} />
          <Section title="Pasadas" items={past} />
        </>
      )}
    </div>
  )
}
