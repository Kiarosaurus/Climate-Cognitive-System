import { type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './components/Login'
import GlobalDashboard from './views/GlobalDashboard'
import RoomSearch from './views/RoomSearch'
import RoomDetail from './views/RoomDetail'
import SensorSearch from './views/SensorSearch'
import Reservations from './views/Reservations'
import UserManagement from './views/UserManagement'
import AddDevices from './views/AddDevices'
import ROIReport from './views/ROIReport'
import Register from './views/Register'

/** Redirects unauthenticated users to /login. Wraps all dashboard routes. */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

/** RBAC gate: allows only users with role='admin'. Others land on the dashboard. */
function AdminRoute({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

/** RBAC gate: allows admin + collaborator. Guests are redirected to the dashboard. */
function CollaboratorRoute({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (user?.role === 'guest') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected — Layout wraps all */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<GlobalDashboard />} />
          <Route path="rooms"        element={<RoomSearch />} />
          <Route path="room/:id"     element={<RoomDetail />} />
          <Route
            path="sensors"
            element={
              <AdminRoute>
                <SensorSearch />
              </AdminRoute>
            }
          />
          <Route
            path="reservations"
            element={
              <CollaboratorRoute>
                <Reservations />
              </CollaboratorRoute>
            }
          />
          <Route
            path="admin/users"
            element={
              <AdminRoute>
                <UserManagement />
              </AdminRoute>
            }
          />
          <Route
            path="add-devices"
            element={
              <AdminRoute>
                <AddDevices />
              </AdminRoute>
            }
          />
          <Route
            path="roi"
            element={
              <AdminRoute>
                <ROIReport />
              </AdminRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
