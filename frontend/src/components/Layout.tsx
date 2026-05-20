import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Cpu, CalendarDays,
  Users, LogOut, Thermometer, ChevronRight, Building, TrendingUp,
  AlertTriangle, X, ShieldAlert,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useEmergency } from '../context/EmergencyContext'
import FloatingChat from './FloatingChat'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  roles?: string[]
}

const NAV: NavItem[] = [
  { to: '/',             label: 'Dashboard',    icon: <LayoutDashboard size={18} /> },
  { to: '/rooms',        label: 'Aulas',         icon: <Building2 size={18} /> },
  { to: '/sensors',      label: 'Sensores',      icon: <Cpu size={18} />,          roles: ['admin'] },
  { to: '/reservations', label: 'Reservas',      icon: <CalendarDays size={18} />, roles: ['admin', 'collaborator'] },
  { to: '/admin/users',  label: 'Usuarios',      icon: <Users size={18} />,        roles: ['admin'] },
  { to: '/infrastructure', label: 'Infraestructura', icon: <Building size={18} />,   roles: ['admin'] },
  { to: '/roi',          label: 'Rentabilidad',  icon: <TrendingUp size={18} />,   roles: ['admin'] },
]

export default function Layout() {
  const { user, logout, isSessionExpired, clearSessionExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { realEmergencies, simulatedEmergencies, isPopupDismissed, dismissPopup, reopenPopup } = useEmergency()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const visible = NAV.filter(n => !n.roles || n.roles.includes(user?.role ?? ''))

  // ── Emergency display rules ───────────────────────────────────────────────
  const isOnDashboard = location.pathname === '/'
  const hasReal = realEmergencies.length > 0
  const hasSim  = simulatedEmergencies.length > 0 && !hasReal

  // What to render:
  const showReal = hasReal                       // all routes
  const showSim  = hasSim && isOnDashboard       // only on /

  const isAnyVisible   = showReal || showSim
  const activeEntries  = showReal ? realEmergencies : showSim ? simulatedEmergencies : []
  const affectedRooms  = activeEntries.map(e => e.room_name).join(', ')

  // Theming tokens
  const overlayBg      = showReal ? 'bg-red-600/15'   : 'bg-orange-500/15'
  const badgeColor     = showReal ? 'text-red-400'    : 'text-amber-400'
  const badgeText      = showReal ? 'Alerta CO activa' : 'Simulación de CO activa'
  const iconBg         = showReal ? 'bg-red-600 hover:bg-red-500 shadow-red-900/50'
                                  : 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/50'
  const tooltipText    = showReal
    ? `⚠ Peligro CO — Evacuar: ${affectedRooms}`
    : `🛠️ Simulación de CO activa`

  const modalBg        = showReal ? 'bg-red-950 border-red-500'   : 'bg-amber-950 border-amber-500'
  const modalHeaderBdr = showReal ? 'border-red-800'              : 'border-amber-800'
  const modalIconColor = showReal ? 'text-red-400'                : 'text-amber-400'
  const modalTitleColor= showReal ? 'text-red-200'                : 'text-amber-200'
  const modalRowBg     = showReal ? 'bg-red-900/50 border-red-700 divide-red-800'
                                  : 'bg-amber-900/30 border-amber-700 divide-amber-800'
  const modalPpmColor  = showReal ? 'bg-red-700/60 text-red-200'  : 'bg-amber-700/60 text-amber-200'
  const modalBtnBg     = showReal ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'

  const modalTitle = showReal
    ? '¡Alerta Crítica!'
    : '🛠️ Simulación de Emergencia'

  const modalBody = showReal
    ? <>
        <span className="font-bold text-red-300">Peligro de intoxicación.</span>{' '}
        Niveles de Monóxido de Carbono (CO) mayores a{' '}
        <span className="font-bold text-red-300">50 ppm</span>{' '}
        detectados en las siguientes aulas:
      </>
    : <>
        Se ha detectado un pico <span className="font-bold text-amber-300">sintético</span> de CO
        en las siguientes aulas. Esta alerta es una{' '}
        <span className="font-bold text-amber-300">prueba del sistema cognitivo</span> y
        desaparecerá al cambiar de pestaña.
      </>

  const modalFooterText = showReal
    ? '🚨 Inicie el protocolo de evacuación inmediatamente.'
    : '✅ No se requiere ninguna acción. Esta es una simulación de laboratorio.'

  const modalFooterColor = showReal ? 'text-red-200 border-red-800' : 'text-amber-200 border-amber-800'

  function handleGoToLogin() {
    clearSessionExpired()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden">

      {/* ── Session expired modal — highest priority, blocks all interaction ── */}
      {isSessionExpired && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex flex-col items-center px-8 py-8 gap-5 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/15 border border-yellow-500/30">
                <ShieldAlert size={32} className="text-yellow-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-slate-100">Sesión caducada</h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Tu sesión ha caducado o el servidor ha sido reiniciado.
                  Por seguridad, debes volver a autenticarte.
                </p>
              </div>
              <button
                onClick={handleGoToLogin}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
              >
                Ir al Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay tint — only when an emergency is visible ── */}
      {isAnyVisible && (
        <div
          className={`fixed inset-0 pointer-events-none ${overlayBg} mix-blend-color-dodge z-40 transition-colors duration-1000`}
        />
      )}

      {/* ── Critical / simulation modal ── */}
      {isAnyVisible && !isPopupDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className={`border-2 rounded-2xl shadow-2xl w-full max-w-lg ${modalBg}`}>

            {/* Header */}
            <div className={`flex items-center justify-between px-6 pt-6 pb-4 border-b ${modalHeaderBdr}`}>
              <div className="flex items-center gap-3">
                <AlertTriangle size={28} className={`${modalIconColor} animate-pulse shrink-0`} />
                <h2 className={`text-lg font-bold uppercase tracking-wide ${modalTitleColor}`}>
                  {modalTitle}
                </h2>
              </div>
              <button
                onClick={dismissPopup}
                className={`${modalIconColor} hover:opacity-70 transition-opacity`}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-slate-200 text-sm leading-relaxed">{modalBody}</p>

              <div className={`border rounded-xl divide-y ${modalRowBg}`}>
                {activeEntries.map(e => (
                  <div key={e.sensor_id} className="flex items-center justify-between px-4 py-3">
                    <span className="font-semibold text-slate-100">{e.sensor_id}</span>
                    <span className={`text-xs font-mono px-2 py-1 rounded ${modalPpmColor}`}>
                      {e.co_ppm.toFixed(1)} ppm CO
                    </span>
                  </div>
                ))}
              </div>

              <p className={`text-sm font-semibold border-t pt-4 ${modalFooterColor}`}>
                {modalFooterText}
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 flex justify-end">
              <button
                onClick={dismissPopup}
                className={`flex items-center gap-2 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-colors ${modalBtnBg}`}
              >
                <AlertTriangle size={15} />
                {showReal ? 'Confirmar Alerta' : 'Entendido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col bg-slate-800 border-r border-slate-700">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-700">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30">
            <Thermometer size={16} className="text-blue-400" />
          </div>
          <span className="font-bold text-sm text-white leading-tight">
            Climate<br />
            <span className="text-blue-400">Cognitive</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visible.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/60'
                }`
              }
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              <ChevronRight size={13} className="opacity-40" />
            </NavLink>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="px-3 pb-4 border-t border-slate-700 pt-3">
          <div className="flex items-center gap-2 px-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-300">
              {user?.username?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{user?.username}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 shrink-0 flex items-center justify-between px-6 bg-slate-800/50 border-b border-slate-700 backdrop-blur-sm">
          <div />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {isAnyVisible && (
              <span className={`flex items-center gap-1.5 font-semibold animate-pulse mr-2 ${badgeColor}`}>
                <AlertTriangle size={13} /> {badgeText}
              </span>
            )}
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Sistema activo
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* ── Persistent emergency button (bottom-right, left of FloatingChat) ── */}
      {isAnyVisible && (
        <div className="fixed bottom-6 right-24 z-40 group">
          <button
            onClick={reopenPopup}
            className={`w-12 h-12 rounded-full text-white flex items-center justify-center animate-pulse shadow-lg transition-colors ${iconBg}`}
            aria-label="Ver alerta de CO"
          >
            <AlertTriangle size={22} />
          </button>
          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-xl pointer-events-none">
            {tooltipText}
          </div>
        </div>
      )}

      <FloatingChat />
    </div>
  )
}
