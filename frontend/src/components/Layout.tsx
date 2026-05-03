import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Cpu, CalendarDays,
  Users, LogOut, Thermometer, ChevronRight, HardDrive, TrendingUp,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import FloatingChat from './FloatingChat'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  roles?: string[]
}

const NAV: NavItem[] = [
  { to: '/',            label: 'Dashboard',   icon: <LayoutDashboard size={18} /> },
  { to: '/rooms',       label: 'Aulas',        icon: <Building2 size={18} /> },
  { to: '/sensors',     label: 'Sensores',     icon: <Cpu size={18} />, roles: ['admin'] },
  { to: '/reservations',label: 'Reservas',     icon: <CalendarDays size={18} />, roles: ['admin', 'collaborator'] },
  { to: '/admin/users',  label: 'Usuarios',    icon: <Users size={18} />,    roles: ['admin'] },
  { to: '/add-devices',  label: 'Dispositivos',  icon: <HardDrive size={18} />,   roles: ['admin'] },
  { to: '/roi',          label: 'Rentabilidad',  icon: <TrendingUp size={18} />,  roles: ['admin'] },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const visible = NAV.filter(n => !n.roles || n.roles.includes(user?.role ?? ''))

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden">
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
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Sistema activo
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      <FloatingChat />
    </div>
  )
}
