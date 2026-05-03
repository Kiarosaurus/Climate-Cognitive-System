import { useState, useEffect, useCallback } from 'react'
import { Users, RefreshCw, AlertCircle, CheckCircle, XCircle, ShieldCheck } from 'lucide-react'
import api from '../api/client'

interface UserRow {
  user_id: number
  username: string
  role: string
  status: string
}

type Tab = 'pending' | 'active' | 'inactive'

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending',  label: 'Pendientes' },
  { key: 'active',   label: 'Activos' },
  { key: 'inactive', label: 'Inactivos' },
]

const ROLE_COLORS: Record<string, string> = {
  admin:        'bg-purple-900/40 text-purple-300',
  collaborator: 'bg-blue-900/40 text-blue-300',
  guest:        'bg-slate-700 text-slate-300',
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [tab, setTab] = useState<Tab>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const fetchUsers = useCallback(() => {
    setLoading(true)
    api.get<UserRow[]>('/admin/users')
      .then(res => { setUsers(res.data); setError(null) })
      .catch(err => setError(err?.response?.data?.detail ?? 'Error cargando usuarios.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function setStatus(userId: number, status: string) {
    setActionLoading(userId)
    try {
      await api.patch(`/admin/users/${userId}/status`, { status })
      setUsers(prev => prev.map(u => u.user_id === userId ? { ...u, status } : u))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Error actualizando estado.')
    } finally {
      setActionLoading(null)
    }
  }

  const filtered = users.filter(u => u.status === tab)

  const counts = {
    pending:  users.filter(u => u.status === 'pending').length,
    active:   users.filter(u => u.status === 'active').length,
    inactive: users.filter(u => u.status === 'inactive').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Gestión de Usuarios</h1>
            <p className="text-sm text-slate-400">Aprobación y administración de cuentas</p>
          </div>
        </div>
        <button onClick={fetchUsers} disabled={loading} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/40 rounded-lg px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            {t.label}
            <span className={`text-xs rounded-full px-1.5 min-w-[20px] text-center ${tab === t.key ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
        {loading ? (
          <div className="flex items-center gap-2 justify-center text-slate-400 text-sm py-12">
            <RefreshCw size={14} className="animate-spin" /> Cargando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Users size={16} />
              No hay usuarios {tab === 'pending' ? 'pendientes' : tab === 'active' ? 'activos' : 'inactivos'}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-xs uppercase border-b border-slate-700 bg-slate-800/80">
                <th className="text-left px-4 py-3">Usuario</th>
                <th className="text-left px-4 py-3">Rol</th>
                <th className="text-left px-4 py-3">Estado</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.user_id} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-300">
                        {u.username[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-200">{u.username}</p>
                        <p className="text-xs text-slate-500">ID #{u.user_id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${ROLE_COLORS[u.role] ?? 'bg-slate-700 text-slate-300'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1 text-xs w-fit ${
                      u.status === 'active' ? 'text-emerald-400' :
                      u.status === 'pending' ? 'text-amber-400' : 'text-slate-500'
                    }`}>
                      {u.status === 'active' ? <CheckCircle size={12} /> : u.status === 'inactive' ? <XCircle size={12} /> : <RefreshCw size={12} />}
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {actionLoading === u.user_id ? (
                        <RefreshCw size={14} className="animate-spin text-slate-400" />
                      ) : (
                        <>
                          {u.status !== 'active' && (
                            <button
                              onClick={() => setStatus(u.user_id, 'active')}
                              className="flex items-center gap-1 text-xs bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              <CheckCircle size={12} /> Aprobar
                            </button>
                          )}
                          {u.status !== 'inactive' && (
                            <button
                              onClick={() => setStatus(u.user_id, 'inactive')}
                              className="flex items-center gap-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              <XCircle size={12} /> Rechazar
                            </button>
                          )}
                          {u.status === 'inactive' && (
                            <button
                              onClick={() => setStatus(u.user_id, 'pending')}
                              className="flex items-center gap-1 text-xs bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              <RefreshCw size={12} /> Reingresar
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
