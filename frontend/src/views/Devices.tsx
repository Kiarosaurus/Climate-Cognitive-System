import { useState, useEffect, useCallback } from 'react'
import {
  HardDrive, Building2, Radio, PlusCircle, Pencil,
  RefreshCw, AlertCircle, CheckCircle2, X, Info, DoorOpen,
} from 'lucide-react'
import api from '../api/client'
import SearchableSelect from '../components/SearchableSelect'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Room {
  id: string
  name: string
  max_capacity: number
  target_temp: number
}

interface SensorDevice {
  sensor_id: string
  room_id: string
  room_name: string | null
  is_active: boolean
  control_enabled: boolean
}

interface Toast { type: 'success' | 'error'; message: string }

type Tab = 'register-room' | 'edit-room' | 'register-sensor' | 'edit-sensor'

interface EditRoomForm { name: string; max_capacity: number; target_temp: number }

// ── Sub-components ────────────────────────────────────────────────────────────

function DataRow({ label, value, changed }: { label: string; value: string; changed?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${changed ? 'text-amber-300' : 'text-slate-200'}`}>
        {value}
        {changed && (
          <span className="ml-1.5 text-xs bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded">
            modificado
          </span>
        )}
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Devices() {
  // ── Data ─────────────────────────────────────────────────────────────────
  const [rooms, setRooms]     = useState<Room[]>([])
  const [devices, setDevices] = useState<SensorDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast]     = useState<Toast | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('register-room')

  // ── Tab: Register room ────────────────────────────────────────────────────
  const [regRoomForm, setRegRoomForm] = useState({
    id: '', name: '', max_capacity: 30, target_temp: 22,
  })

  // ── Tab: Edit room ────────────────────────────────────────────────────────
  const [editRoomId, setEditRoomId] = useState('')
  const [editRoomForm, setEditRoomForm] = useState<EditRoomForm>({
    name: '', max_capacity: 30, target_temp: 22,
  })
  const [editRoomModalOpen, setEditRoomModalOpen] = useState(false)
  const [pendingRoom, setPendingRoom] = useState<{
    original: Room; form: EditRoomForm
  } | null>(null)

  // ── Tab: Register sensor ──────────────────────────────────────────────────
  const [regSensorForm, setRegSensorForm] = useState({ id: '', room_id: '' })

  // ── Tab: Edit sensor ──────────────────────────────────────────────────────
  const [editSensorId, setEditSensorId]           = useState('')
  const [editSensorRoomId, setEditSensorRoomId]   = useState('')
  const [editSensorModalOpen, setEditSensorModalOpen] = useState(false)
  const [pendingSensor, setPendingSensor] = useState<{
    original: SensorDevice; newRoomId: string; newRoomName: string
  } | null>(null)

  // ── Helpers ───────────────────────────────────────────────────────────────

  const showToast = (type: Toast['type'], message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4500)
  }

  const refreshRooms = useCallback(() =>
    api.get<Room[]>('/admin/rooms').then(res => {
      const data = Array.isArray(res.data) ? res.data : []
      setRooms(data)
      return data
    }), [])

  const refreshDevices = useCallback(() =>
    api.get<SensorDevice[]>('/admin/devices').then(res => {
      setDevices(Array.isArray(res.data) ? res.data : [])
    }), [])

  useEffect(() => {
    Promise.all([refreshRooms(), refreshDevices()])
      .then(([roomList]) => {
        if (roomList.length > 0) setRegSensorForm(f => ({ ...f, room_id: roomList[0].id }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [refreshRooms, refreshDevices])

  // ── Tab switch ────────────────────────────────────────────────────────────

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    setEditRoomModalOpen(false)
    setEditSensorModalOpen(false)
  }

  // ── Edit room: select → auto-populate ────────────────────────────────────

  function selectEditRoom(id: string) {
    setEditRoomId(id)
    const room = rooms.find(r => r.id === id)
    if (room) setEditRoomForm({ name: room.name, max_capacity: room.max_capacity, target_temp: room.target_temp })
  }

  // ── Edit sensor: select → show current assignment ────────────────────────

  function selectEditSensor(id: string) {
    setEditSensorId(id)
    const dev = devices.find(d => d.sensor_id === id)
    setEditSensorRoomId(dev?.room_id ?? '')
  }

  // ── Submit handlers ───────────────────────────────────────────────────────

  async function handleRegisterRoom(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/admin/rooms', {
        id: regRoomForm.id.trim(),
        name: regRoomForm.name.trim(),
        max_capacity: regRoomForm.max_capacity,
        target_temp: regRoomForm.target_temp,
      })
      showToast('success', `Aula '${regRoomForm.id}' registrada correctamente.`)
      setRegRoomForm({ id: '', name: '', max_capacity: 30, target_temp: 22 })
      await refreshRooms()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast('error', detail ?? 'No se pudo registrar el aula.')
    } finally { setSubmitting(false) }
  }

  function openEditRoomModal(e: React.FormEvent) {
    e.preventDefault()
    if (!editRoomId) return
    const original = rooms.find(r => r.id === editRoomId)
    if (!original) return
    setPendingRoom({ original, form: { ...editRoomForm } })
    setEditRoomModalOpen(true)
  }

  async function confirmEditRoom() {
    if (!pendingRoom) return
    setSubmitting(true)
    setEditRoomModalOpen(false)
    try {
      await api.put(`/admin/rooms/${pendingRoom.original.id}`, pendingRoom.form)
      showToast('success', `Aula '${pendingRoom.original.id}' actualizada correctamente.`)
      setPendingRoom(null)
      await refreshRooms()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast('error', detail ?? 'No se pudo actualizar el aula.')
    } finally { setSubmitting(false) }
  }

  async function handleRegisterSensor(e: React.FormEvent) {
    e.preventDefault()
    if (!regSensorForm.room_id) return
    setSubmitting(true)
    try {
      await api.post('/admin/sensors', {
        id: regSensorForm.id.trim(),
        room_id: regSensorForm.room_id,
      })
      showToast('success', `Sensor '${regSensorForm.id}' aprovisionado. Estado inicial: inactivo.`)
      setRegSensorForm(f => ({ ...f, id: '' }))
      await refreshDevices()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast('error', detail ?? 'No se pudo registrar el sensor.')
    } finally { setSubmitting(false) }
  }

  function openEditSensorModal(e: React.FormEvent) {
    e.preventDefault()
    if (!editSensorId || !editSensorRoomId) return
    const original = devices.find(d => d.sensor_id === editSensorId)
    if (!original) return
    const newRoom = rooms.find(r => r.id === editSensorRoomId)
    setPendingSensor({
      original,
      newRoomId: editSensorRoomId,
      newRoomName: newRoom?.name ?? editSensorRoomId,
    })
    setEditSensorModalOpen(true)
  }

  async function confirmEditSensor() {
    if (!pendingSensor) return
    setSubmitting(true)
    setEditSensorModalOpen(false)
    try {
      await api.put(`/admin/sensors/${pendingSensor.original.sensor_id}`, {
        room_id: pendingSensor.newRoomId,
      })
      showToast('success', `Sensor '${pendingSensor.original.sensor_id}' reasignado correctamente.`)
      setPendingSensor(null)
      setEditSensorId('')
      setEditSensorRoomId('')
      await refreshDevices()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast('error', detail ?? 'No se pudo reasignar el sensor.')
    } finally { setSubmitting(false) }
  }

  // ── Derived options ───────────────────────────────────────────────────────

  const roomOptions   = rooms.map(r => ({ value: r.id, label: `${r.id} — ${r.name}` }))
  const sensorOptions = devices.map(d => ({
    value: d.sensor_id,
    label: `${d.sensor_id}${d.room_name ? ` (${d.room_name})` : ''}`,
  }))

  const currentDevice = devices.find(d => d.sensor_id === editSensorId) ?? null

  // ── Style tokens ──────────────────────────────────────────────────────────

  const inputCls = "w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition placeholder-slate-500"
  const labelCls = "block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide"

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'register-room',   label: 'Registrar Aula',   icon: <Building2 size={14} /> },
    { key: 'edit-room',       label: 'Editar Aula',       icon: <Pencil size={14} /> },
    { key: 'register-sensor', label: 'Registrar Sensor',  icon: <Radio size={14} /> },
    { key: 'edit-sensor',     label: 'Editar Sensor',     icon: <Pencil size={14} /> },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <HardDrive size={22} className="text-blue-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Gestión de Dispositivos</h1>
          <p className="text-sm text-slate-400">Aprovisionamiento y edición de aulas y sensores físicos</p>
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

      {/* Form card */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 bg-slate-900/50 border border-slate-700/60 rounded-xl p-1 w-fit mb-6">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
            <RefreshCw size={14} className="animate-spin" /> Cargando datos…
          </div>
        ) : (

          <div className="max-w-lg">

            {/* ── Registrar Aula ─────────────────────────────────────────── */}
            {activeTab === 'register-room' && (
              <form onSubmit={handleRegisterRoom} className="space-y-4">
                <div>
                  <label className={labelCls}>ID del Aula</label>
                  <input type="text" required placeholder="ej. AULA-101"
                    value={regRoomForm.id}
                    onChange={e => setRegRoomForm(f => ({ ...f, id: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Nombre</label>
                  <input type="text" required placeholder="ej. Laboratorio de Física"
                    value={regRoomForm.name}
                    onChange={e => setRegRoomForm(f => ({ ...f, name: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Capacidad Máxima</label>
                    <input type="number" required min={1}
                      value={regRoomForm.max_capacity}
                      onChange={e => setRegRoomForm(f => ({ ...f, max_capacity: Number(e.target.value) }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Temperatura Objetivo (°C)</label>
                    <input type="number" required min={10} max={35} step={0.5}
                      value={regRoomForm.target_temp}
                      onChange={e => setRegRoomForm(f => ({ ...f, target_temp: Number(e.target.value) }))}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button type="submit" disabled={submitting}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {submitting
                      ? <><RefreshCw size={14} className="animate-spin" /> Guardando…</>
                      : <><PlusCircle size={14} /> Registrar Aula</>}
                  </button>
                </div>
              </form>
            )}

            {/* ── Editar Aula ────────────────────────────────────────────── */}
            {activeTab === 'edit-room' && (
              <form onSubmit={openEditRoomModal} className="space-y-4">
                <div>
                  <SearchableSelect
                    options={roomOptions}
                    value={editRoomId}
                    onChange={selectEditRoom}
                    placeholder="Busca el aula a editar…"
                    label="Seleccionar Aula"
                    icon={<DoorOpen size={16} />}
                  />
                  {!editRoomId && (
                    <p className="text-xs text-slate-500 mt-1.5">
                      Selecciona un aula para cargar sus datos actuales.
                    </p>
                  )}
                  {editRoomId && (
                    <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Aula {editRoomId} cargada — modifica los campos y revisa antes de guardar.
                    </p>
                  )}
                </div>

                {editRoomId && (
                  <>
                    <div>
                      <label className={labelCls}>Nombre</label>
                      <input type="text" required
                        value={editRoomForm.name}
                        onChange={e => setEditRoomForm(f => ({ ...f, name: e.target.value }))}
                        className={inputCls}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Capacidad Máxima</label>
                        <input type="number" required min={1}
                          value={editRoomForm.max_capacity}
                          onChange={e => setEditRoomForm(f => ({ ...f, max_capacity: Number(e.target.value) }))}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Temperatura Objetivo (°C)</label>
                        <input type="number" required min={10} max={35} step={0.5}
                          value={editRoomForm.target_temp}
                          onChange={e => setEditRoomForm(f => ({ ...f, target_temp: Number(e.target.value) }))}
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <button type="submit" disabled={submitting}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
                      >
                        {submitting
                          ? <><RefreshCw size={14} className="animate-spin" /> Procesando…</>
                          : <><Pencil size={14} /> Revisar y guardar</>}
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}

            {/* ── Registrar Sensor ───────────────────────────────────────── */}
            {activeTab === 'register-sensor' && (
              <form onSubmit={handleRegisterSensor} className="space-y-4">
                <div>
                  <label className={labelCls}>ID del Sensor</label>
                  <input type="text" required placeholder="ej. sensor-lab-101-a"
                    value={regSensorForm.id}
                    onChange={e => setRegSensorForm(f => ({ ...f, id: e.target.value }))}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className={labelCls}>Aula Asignada</label>
                  {rooms.length === 0 ? (
                    <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-900/20 border border-amber-500/30 rounded-lg px-3 py-2.5">
                      <AlertCircle size={14} className="shrink-0" />
                      No hay aulas registradas. Registra una antes de añadir sensores.
                    </div>
                  ) : (
                    <SearchableSelect
                      options={roomOptions}
                      value={regSensorForm.room_id}
                      onChange={v => setRegSensorForm(f => ({ ...f, room_id: v }))}
                      placeholder="Selecciona un aula…"
                      icon={<DoorOpen size={16} />}
                    />
                  )}
                </div>

                <div className="flex items-start gap-2 bg-slate-700/50 border border-slate-600/60 rounded-lg px-3 py-2.5">
                  <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-400">
                    Por seguridad, los sensores nuevos se inicializan{' '}
                    <strong className="text-slate-300">apagados y sin control de AC</strong>.
                    Actívalos desde el Dashboard del aula tras la instalación física.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit"
                    disabled={submitting || !regSensorForm.room_id || rooms.length === 0}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
                  >
                    {submitting
                      ? <><RefreshCw size={14} className="animate-spin" /> Guardando…</>
                      : <><PlusCircle size={14} /> Registrar Sensor</>}
                  </button>
                </div>
              </form>
            )}

            {/* ── Editar Sensor ──────────────────────────────────────────── */}
            {activeTab === 'edit-sensor' && (
              <form onSubmit={openEditSensorModal} className="space-y-4">
                <div>
                  <SearchableSelect
                    options={sensorOptions}
                    value={editSensorId}
                    onChange={selectEditSensor}
                    placeholder="Busca el sensor a reasignar…"
                    label="Seleccionar Sensor"
                    icon={<Radio size={16} />}
                  />
                  {!editSensorId && (
                    <p className="text-xs text-slate-500 mt-1.5">
                      Selecciona un sensor para ver su aula actual y reasignarlo.
                    </p>
                  )}
                  {editSensorId && (
                    <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Sensor {editSensorId} seleccionado.
                    </p>
                  )}
                </div>

                {editSensorId && (
                  <>
                    {/* Current assignment */}
                    <div className="bg-slate-700/40 border border-slate-600/50 rounded-lg px-4 py-3">
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Aula actual</p>
                      <p className="text-slate-200 font-medium text-sm">
                        {currentDevice?.room_name ?? currentDevice?.room_id ?? '—'}
                        {currentDevice?.room_name && (
                          <span className="ml-2 text-xs text-slate-500">({currentDevice.room_id})</span>
                        )}
                      </p>
                      <p className={`text-xs mt-1 ${currentDevice?.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {currentDevice?.is_active ? 'Activo' : 'Inactivo'}
                        {' · '}
                        {currentDevice?.control_enabled ? 'Control AC habilitado' : 'Control AC deshabilitado'}
                      </p>
                    </div>

                    {/* New room picker */}
                    <div>
                      <SearchableSelect
                        options={roomOptions}
                        value={editSensorRoomId}
                        onChange={v => setEditSensorRoomId(v)}
                        placeholder="Nueva aula destino…"
                        label="Nueva Aula"
                        icon={<DoorOpen size={16} />}
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <button type="submit"
                        disabled={submitting || !editSensorRoomId || editSensorRoomId === currentDevice?.room_id}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors"
                      >
                        {submitting
                          ? <><RefreshCw size={14} className="animate-spin" /> Procesando…</>
                          : <><Pencil size={14} /> Revisar y reasignar</>}
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}

          </div>
        )}
      </div>

      {/* ── Modal: Confirmar edición de aula ──────────────────────────────── */}
      {editRoomModalOpen && pendingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Pencil size={16} className="text-blue-400" /> Confirmar Actualización de Aula
              </h3>
              <button onClick={() => setEditRoomModalOpen(false)}
                className="text-slate-400 hover:text-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-4">
              {/* Datos actuales */}
              <div className="bg-slate-700/40 border border-slate-600/50 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> Datos Actuales
                </p>
                <DataRow label="ID"                  value={pendingRoom.original.id} />
                <DataRow label="Nombre"              value={pendingRoom.original.name} />
                <DataRow label="Capacidad"           value={`${pendingRoom.original.max_capacity} personas`} />
                <DataRow label="Temperatura Objetivo" value={`${pendingRoom.original.target_temp} °C`} />
              </div>

              {/* Nuevos datos */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Nuevos Datos
                </p>
                <DataRow label="ID" value={pendingRoom.original.id} />
                <DataRow
                  label="Nombre" value={pendingRoom.form.name}
                  changed={pendingRoom.form.name !== pendingRoom.original.name}
                />
                <DataRow
                  label="Capacidad" value={`${pendingRoom.form.max_capacity} personas`}
                  changed={pendingRoom.form.max_capacity !== pendingRoom.original.max_capacity}
                />
                <DataRow
                  label="Temperatura Objetivo" value={`${pendingRoom.form.target_temp} °C`}
                  changed={pendingRoom.form.target_temp !== pendingRoom.original.target_temp}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 pb-5">
              <button type="button" onClick={() => setEditRoomModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button type="button" onClick={confirmEditRoom} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {submitting
                  ? <><RefreshCw size={13} className="animate-spin" /> Actualizando…</>
                  : <><CheckCircle2 size={14} /> Sí, Guardar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar reasignación de sensor ───────────────────────── */}
      {editSensorModalOpen && pendingSensor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Radio size={16} className="text-blue-400" /> Confirmar Reasignación de Sensor
              </h3>
              <button onClick={() => setEditSensorModalOpen(false)}
                className="text-slate-400 hover:text-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-4">
              {/* Asignación actual */}
              <div className="bg-slate-700/40 border border-slate-600/50 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> Asignación Actual
                </p>
                <DataRow label="Sensor ID"    value={pendingSensor.original.sensor_id} />
                <DataRow label="Aula Asignada" value={pendingSensor.original.room_name ?? pendingSensor.original.room_id} />
                <DataRow label="Estado"        value={pendingSensor.original.is_active ? 'Activo' : 'Inactivo'} />
              </div>

              {/* Nueva asignación */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Nueva Asignación
                </p>
                <DataRow label="Sensor ID" value={pendingSensor.original.sensor_id} />
                <DataRow
                  label="Aula Asignada" value={pendingSensor.newRoomName}
                  changed={pendingSensor.newRoomId !== pendingSensor.original.room_id}
                />
                <DataRow label="Estado" value={pendingSensor.original.is_active ? 'Activo' : 'Inactivo'} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 pb-5">
              <button type="button" onClick={() => setEditSensorModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button type="button" onClick={confirmEditSensor} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {submitting
                  ? <><RefreshCw size={13} className="animate-spin" /> Actualizando…</>
                  : <><CheckCircle2 size={14} /> Sí, Reasignar</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
