# Documentación Extensa — Climate Cognitive System

> Documento técnico de arquitectura, decisiones de diseño y mecánicas avanzadas implementadas en el sistema. Para la guía de instalación y despliegue, ver [README.md](./README.md).

---

## Tabla de Contenidos

1. [Propósito del Proyecto](#1-propósito-del-proyecto)
2. [Estructura del Repositorio](#2-estructura-del-repositorio-mapeo-de-carpetas)
3. [Funcionalidades Críticas de Negocio](#3-funcionalidades-críticas-de-negocio)
   - 3.1 [Control de Intervalos Fantasma (Ghost Intervals)](#31-control-de-intervalos-fantasma-ghost-intervals)
   - 3.2 [Persistencia de Emergencias con Ventana TTL Estricta](#32-persistencia-de-emergencias-con-ventana-ttl-estricta)
   - 3.3 [Gestión de Infraestructura de Doble Panel](#33-gestión-de-infraestructura-de-doble-panel-dual-panel-layout)
   - 3.4 [Lógica de Orfandad Histórica y Herencia Segura](#34-lógica-de-orfandad-histórica-y-herencia-segura)
   - 3.5 [Inputs Numéricos Fluidos y UI Minimalista](#35-inputs-numéricos-fluidos-y-ui-minimalista)
   - 3.6 [Fijación de Destellos en Gráficos de Rentabilidad](#36-fijación-de-destellos-en-gráficos-de-rentabilidad)
   - 3.7 [Ocupación Esperada vs. Real (Feed-Forward + Feedback)](#37-ocupación-esperada-vs-real-feed-forward--feedback)
4. [Hitos del Proyecto y Hoja de Ruta](#4-hitos-del-proyecto-y-hoja-de-ruta)
5. [Arquitectura Tecnológica](#5-arquitectura-tecnológica)
6. [Endpoints API](#6-endpoints-api)
7. [Roles y Permisos (RBAC)](#7-roles-y-permisos-rbac)
8. [Motor Cognitivo — Flujo de Ingesta](#8-motor-cognitivo--flujo-de-ingesta)
9. [Variables de Entorno](#9-variables-de-entorno)

---

## 1. Propósito del Proyecto

**Climate Cognitive System (CCS)** es una plataforma IoT de **gestión climática predictiva** diseñada para entornos universitarios. Su objetivo es **optimizar el confort térmico de aulas y espacios físicos** mientras **minimiza el consumo energético** del aire acondicionado mediante un motor cognitivo que combina **Machine Learning supervisado** y **reglas heurísticas de fallback**.

### Problema que resuelve

En entornos educativos, los aires acondicionados (AC) operan tradicionalmente en modo **always-on** durante el horario laboral, sin considerar:

- **Ocupación real** del aula (vs. ocupación esperada según reserva).
- **Carga térmica** generada por los ocupantes (≈ 80–120 W de calor metabólico por persona).
- **Variaciones ambientales** medidas por sensores físicos (temperatura, humedad, CO₂, CO).
- **Horarios programados** y reservas activas.

CCS introduce una capa de inferencia que **ajusta dinámicamente el setpoint del AC** mediante un modelo predictivo, calcula el **ROI energético** comparándose contra el sistema tradicional, y expone una **interfaz multi-rol RBAC** para administración, monitoreo y consultas conversacionales vía **IBM Watson Assistant**.

### Componentes clave

| Componente | Responsabilidad |
|---|---|
| **Backend FastAPI** | Ingesta de telemetría IoT, RBAC, autenticación JWT, exposición REST |
| **Motor cognitivo** | Predicción de carga térmica vía `scikit-learn` (modelo `.joblib`) o heurístico |
| **MongoDB (Motor)** | Persistencia de lecturas de sensores + `cognitive_action` (decisión del AC) |
| **PostgreSQL (SQLAlchemy)** | Entidades de negocio: `User`, `Room`, `SensorDevice`, `Reservation`, `Schedule` |
| **Frontend React + Vite** | Dashboard multi-rol, control físico de sensores, reservas, ROI |
| **IBM Watson Assistant** | Chatbot integrado vía custom extension (proxy `/api/v1/chat/`) |

---

## 2. Estructura del Repositorio (Mapeo de Carpetas)

```
Climate-Cognitive-System/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── dependencies.py
│       ├── database.py
│       ├── database_sql.py
│       ├── core/
│       ├── models/
│       ├── routes/
│       ├── services/
│       └── ml/
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── vite.config.ts
│   ├── package.json
│   └── src/
│       ├── api/
│       ├── context/
│       ├── components/
│       ├── views/
│       ├── App.tsx
│       ├── main.tsx
│       └── types.ts
├── database/
│   ├── postgres/init.sql
│   └── mongo/init.js
├── ml_pipeline/
│   ├── extract_data.py
│   ├── train_model.py
│   └── data/
├── docker-compose.yml
├── generate_openapi.py
├── openapi_watson.json
├── .env
├── README.md
└── DOCUMENTACION.md
```

### 2.1 `backend/` — Capa de aplicación Python

| Subcarpeta / archivo | Capa del sistema | Propósito |
|---|---|---|
| `app/main.py` | **Bootstrap** | Crea la instancia `FastAPI`, registra routers, ejecuta los hooks de startup (`load_model`, migraciones idempotentes, seed de admin, init Watson) |
| `app/config.py` | **Configuración** | Carga variables de entorno (`MONGO_URI`, `POSTGRES_URI`, `SECRET_KEY`, credenciales Watson). Genera `SECRET_KEY` aleatorio si no existe |
| `app/dependencies.py` | **Inyección DI** | Provee `get_current_user` (JWT decode + RBAC) y `require_api_key` (validación de Watson Extension Key) |
| `app/database.py` | **DB NoSQL** | Cliente `motor.motor_asyncio.AsyncIOMotorClient` para MongoDB (async I/O) |
| `app/database_sql.py` | **DB Relacional** | `engine` SQLAlchemy + `SessionLocal` + `Base` declarativa para PostgreSQL |
| `app/core/security.py` | **Seguridad** | `hash_password` / `verify_password` con **Argon2** vía `pwdlib`, `create_access_token` / `decode_token` JWT (`python-jose`) |
| `app/models/` | **Modelos** | `admin.py` (ORM SQLAlchemy: `User`, `Room`, `SensorDevice`, `Reservation`, `Schedule`); `sensor.py` (esquema Pydantic `SensorReading`) |
| `app/routes/` | **Endpoints REST** | `auth.py` (login/register), `admin.py` (CRUD de aulas/sensores/usuarios/reservas), `sensors.py` (ingesta + control físico + emergencias), `reports.py` (ROI), `chat.py` (proxy Watson) |
| `app/services/` | **Lógica de dominio** | `data_service.py` (pipeline de ingesta), `predictive_service.py` (ML + heurístico + blend feed-forward/feedback), `occupancy_service.py` (estimación de ocupación real vía CO₂ + gap plan-vs-real), `watson_service.py` (cliente Watson) |
| `app/ml/` | **Artefactos ML** | `model.joblib` (modelo serializado, generado por `ml_pipeline/`) |

### 2.2 `frontend/` — Capa de presentación React

| Subcarpeta / archivo | Capa del sistema | Propósito |
|---|---|---|
| `src/api/client.ts` | **Cliente HTTP** | Instancia `axios` con `baseURL = /api/v1`, **interceptor 401 → logout + redirect** con guard anti-loop |
| `src/context/AuthContext.tsx` | **Estado global auth** | Persiste JWT en `sessionStorage` (destruido al cerrar pestaña), expone `user`, `token`, `login`, `logout`, inyecta header `Authorization: Bearer` |
| `src/context/EmergencyContext.tsx` | **Estado global emergencias** | Polling cada 5s a `/sensors/emergencies`, mantiene `realEmergencies` / `simulatedEmergencies`, controla popup global |
| `src/components/Layout.tsx` | **Shell UI** | Sidebar con navegación filtrada por rol RBAC, topbar, integración del `FloatingChat` Watson |
| `src/components/Login.tsx` | **Auth UI** | Formulario de inicio de sesión + redirección post-login |
| `src/components/FloatingChat.tsx` | **Chatbot UI** | Floating Action Button (FAB) + ventana flotante con historial de sesión Watson |
| `src/components/SearchableSelect.tsx` | **Widget UI** | Dropdown con búsqueda fuzzy reutilizable (selección de aulas y sensores) |
| `src/views/GlobalDashboard.tsx` | **Dashboard principal** | Monitor en vivo + simulador manual de telemetría (zona de desarrollador) |
| `src/views/RoomSearch.tsx` | **Listado de aulas** | Tabla / grid con estado AC en tiempo real |
| `src/views/RoomDetail.tsx` | **Detalle de aula** | Historial de lecturas + toggle físico de sensor (RBAC con reserva activa) |
| `src/views/SensorSearch.tsx` | **Inventario sensores** | Catálogo de `SensorDevice` (sólo admin) |
| `src/views/Devices.tsx` / `AddDevices.tsx` | **Aprovisionamiento** | Registro de hardware (aulas + sensores) en estado inicial inactivo |
| `src/views/Infrastructure.tsx` | **Gestión Dual-Panel** | Panel doble Aulas ↔ Sensores con CRUD + lógica de orfandad |
| `src/views/Reservations.tsx` | **Reservas** | CRUD de `Reservation` con validación de horario |
| `src/views/UserManagement.tsx` | **Gestión de usuarios** | Aprobación / rechazo de cuentas pendientes (sólo admin) |
| `src/views/ROIReport.tsx` | **Dashboard ROI** | KPIs energéticos, `BarChart` Tradicional vs. Cognitivo, resumen del modelo |
| `src/views/Register.tsx` | **Registro público** | Auto-aprobación de rol `guest`; `collaborator` / `admin` quedan en `pending` |

### 2.3 `database/` — Inicialización de bases de datos

| Archivo | Propósito |
|---|---|
| `postgres/init.sql` | Script ejecutado por la imagen `postgres:15` en el primer arranque (montado en `/docker-entrypoint-initdb.d/init.sql`). Crea esquema inicial si está vacío |
| `mongo/init.js` | Script de bootstrap de MongoDB (índices, colecciones) ejecutado por `mongo:6.0` |

### 2.4 `ml_pipeline/` — Entrenamiento del modelo

| Archivo | Propósito |
|---|---|
| `extract_data.py` | Exporta lecturas históricas de MongoDB a CSV (`data/`). Deriva `actual_occupancy` desde `co2_ppm` (mass-balance) y conserva `expected_occupancy` (plan) como columnas **distintas** |
| `train_model.py` | Entrena un regresor `scikit-learn` sobre las features `[temperature, hour_of_day, expected_occupancy, actual_occupancy]` y serializa el resultado vía `joblib` en `backend/app/ml/model.joblib`. El **orden** de features debe coincidir con el vector construido en `predictive_service.py` |
| `data/` | Datasets de entrenamiento / validación |

> ⚠️ **Contrato de features:** el orden y nombres de `FEATURES` en `train_model.py` deben ser idénticos al vector `np.array([[current_temp, hour, expected_occupancy, actual_occupancy]])` de `predictive_service.calculate_cooling_demand`. Un desajuste produce inferencias silenciosamente incorrectas.

### 2.5 Archivos raíz adicionales

| Archivo | Propósito |
|---|---|
| `docker-compose.yml` | Orquestación de los 4 servicios (backend, frontend, postgres, mongo) con healthchecks y volúmenes persistentes |
| `generate_openapi.py` | Script de utilidad: serializa el `app.openapi()` de FastAPI a JSON estático |
| `openapi_watson.json` | Especificación OpenAPI publicada como **custom extension** en IBM Watson Assistant |
| `.env` | Variables de entorno (NO versionado) |

---

## 3. Funcionalidades Críticas de Negocio

### 3.1 Control de Intervalos Fantasma (Ghost Intervals)

**Problema:** El componente `GlobalDashboard.tsx` incluye un **simulador manual de telemetría** (zona de desarrollador) controlado por un toggle `autoMode`. Sin gestión disciplinada del ciclo de vida del `setInterval`, al desactivar el toggle el intervalo previo seguía vivo en memoria, **inyectando lecturas basura** en MongoDB incluso con el simulador "apagado" desde la perspectiva del usuario. Este patrón se conoce como **Ghost Interval**.

**Solución implementada** (`frontend/src/views/GlobalDashboard.tsx:108-125`):

```tsx
useEffect(() => {
  if (!autoMode) return   // guard: toggle is off — do not start any interval

  const interval = setInterval(() => {
    if (!autoMode) return  // inner guard: stale-closure safety — skip if somehow off
    sendReading({
      sensor_id: SENSOR_IDS[Math.floor(Math.random() * SENSOR_IDS.length)],
      temperature: parseFloat((15 + Math.random() * 30).toFixed(1)),
      humidity:    parseFloat((30 + Math.random() * 65).toFixed(1)),
      co2_ppm:     parseFloat((350 + Math.random() * 1500).toFixed(0)),
      co_ppm:      parseFloat(
        (Math.random() < 0.1 ? 55 + Math.random() * 95 : Math.random() * 10).toFixed(1)
      ),
    })
  }, 4_000)

  return () => clearInterval(interval)  // fires on toggle-off AND on unmount
}, [autoMode, sendReading])
```

**Mecánica:**

1. **Guard externo** — Si `autoMode` está en `false`, el `useEffect` retorna inmediatamente sin programar nada.
2. **Cleanup function** — La función retornada (`() => clearInterval(interval)`) se ejecuta automáticamente por React cuando:
   - Cambia cualquier dependencia del array `[autoMode, sendReading]` (toggle a `off` → el efecto se re-ejecuta y limpia el intervalo anterior).
   - El componente se **desmonta** (navegación a otra ruta o cierre de sesión).
3. **Guard interno (stale-closure safety)** — El `if (!autoMode) return` dentro del callback del `setInterval` protege contra el caso patológico en que, por **closure** capturada, el callback se ejecute con un valor obsoleto justo en la ventana entre el toggle-off y el `clearInterval`.

**Resultado:** Cero lecturas fantasma. Al alternar el toggle, MongoDB deja de recibir inserts en el siguiente tick (≤ 4 s).

El mismo patrón se aplica al **health-check polling** (`checkHealth` cada 30 s) y al polling de emergencias en `EmergencyContext.tsx:95-104`, donde la cleanup function garantiza la cancelación al cerrar sesión o cambiar de ruta protegida.

---

### 3.2 Persistencia de Emergencias con Ventana TTL Estricta

**Problema:** Las lecturas simuladas con `co_ppm > 50` (alerta de monóxido de carbono) se almacenan en MongoDB junto con las reales. Sin una política de expiración, una sesión de simulación pasada dejaría **alertas zombi** que el frontend seguiría considerando activas, provocando popups perpetuos y ruido en el dashboard de emergencias.

**Solución implementada** (`backend/app/routes/sensors.py:75-176`):

El endpoint `GET /api/v1/sensors/emergencies` aplica una **Time-To-Live (TTL) lógica** de **15 segundos** sobre las lecturas simuladas:

```python
now = datetime.now(timezone.utc)

# Purge simulated readings older than 15 seconds — if the simulator stops sending,
# the DB is clean within one polling cycle and the frontend receives nothing.
fiveteen_sec_ago = (now - timedelta(seconds=15)).strftime("%Y-%m-%dT%H:%M:%S.%f")
purge = await db["sensor_readings"].delete_many(
    {"is_simulated": True, "timestamp": {"$lt": fiveteen_sec_ago}}
)

cursor = db["sensor_readings"].find(
    {"co_ppm": {"$gt": 50}, "timestamp": {"$gte": fiveteen_sec_ago}}
).sort("co_ppm", -1)
```

**Mecánica:**

| Capa | Cadencia | Acción |
|---|---|---|
| **Frontend polling** (`EmergencyContext`) | cada **5 s** | `GET /sensors/emergencies` con Bearer token |
| **Backend purge** (lazy) | en **cada request** | `delete_many({is_simulated: true, timestamp < now − 15s})` |
| **Backend query** | en **cada request** | Sólo retorna documentos con `timestamp ≥ now − 15s` |

**Estrategia "hard-fallback"** — Una alerta se cataloga como `simulated` si **cualquiera** de estas condiciones se cumple:

1. El flag `is_simulated: true` está presente en el documento.
2. `sensor_id` o `room_id` contiene los keywords `SIM` o `TEST` (`_looks_synthetic`).
3. El sensor **no está registrado** en PostgreSQL (`device_to_room.get(sid) is None`).
4. El `room_id` no existe en la tabla `rooms`.

Sólo se considera **real** si `is_simulated` es estrictamente `False` **AND** el sensor y el aula se resuelven en SQL.

**Resultado:**

- Al detener el simulador, **dentro de un ciclo de polling (~5 s)** la UI deja de mostrar alertas.
- La base de datos **nunca acumula** alertas simuladas: cada nuevo poll las purga.
- Las alertas reales (sensores físicos registrados) **no se ven afectadas** por el purge, ya que el filtro es `{"is_simulated": True, ...}`.

> ⚠️ **Nota:** Esta es una TTL **lógica** del lado de la aplicación, no la TTL nativa de MongoDB (`expireAfterSeconds`). Se prefirió el enfoque lazy para tener control transaccional sobre el momento exacto del purge y para no depender del scheduler de MongoDB (que opera con resolución de ~60 s).

---

### 3.3 Gestión de Infraestructura de Doble Panel (Dual-Panel Layout)

**Problema:** Las vistas legacy `Devices.tsx` y `AddDevices.tsx` separaban en pestañas independientes la gestión de aulas y la gestión de sensores. Esto forzaba al admin a **alternar contexto mental** entre dos rutas para una operación intrínsecamente acoplada (un sensor pertenece a un aula).

**Solución implementada** (`frontend/src/views/Infrastructure.tsx`):

Un único componente `Infrastructure` con un **grid CSS de 2 columnas** simétricas, altura fija de viewport:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch
                h-[calc(100vh-7rem)]
                min-h-[calc(100vh-7rem)]
                max-h-[calc(100vh-7rem)]">
  {/* ── Columna izquierda: Aulas ───────────── */}
  <section> ...formularios Registrar / Editar de Room... </section>

  {/* ── Columna derecha: Sensores ──────────── */}
  <section> ...formularios Registrar / Editar de SensorDevice... </section>
</div>
```

**Características de diseño:**

| Aspecto | Implementación |
|---|---|
| **Layout** | `grid grid-cols-1 lg:grid-cols-2` — single-column en móvil, dual-column en desktop |
| **Altura** | `h-[calc(100vh-7rem)]` fija al viewport — sin scroll de página, sólo scroll interno de paneles |
| **Simetría** | `items-stretch` + `gap-8` — ambos paneles ocupan exactamente la misma altura |
| **Sub-navegación** | Cada panel tiene su propio `TabBar` interno (`register` / `edit`) — el estado de uno no afecta al otro |
| **Submitting flags** | `roomSubmitting` y `sensorSubmitting` independientes — un panel puede estar enviando mientras el otro permanece interactivo |
| **Toast compartido** | Un único `Toast` global con auto-dismiss reporta el resultado de cualquiera de los dos paneles |

**Componentes auxiliares reutilizados:**

- `<TabBar>` — Sub-componente local que renderiza pestañas `register` / `edit` con icono.
- `<DataRow>` — Renderiza pares `label / value` con badge "modificado" si el campo cambió respecto al original.
- `<SearchableSelect>` — Dropdown reutilizable de aulas con búsqueda fuzzy, también usado en la asignación de sensores.

**Resultado:** El admin tiene **contexto visual completo** de toda la infraestructura física en una sola vista. Crear un aula y asignarle inmediatamente un sensor recién registrado es un flujo continuo sin cambio de ruta.

---

### 3.4 Lógica de Orfandad Histórica y Herencia Segura

**Problema:** Eliminar un aula de la tabla `rooms` en PostgreSQL **rompería la integridad referencial** de las reservas históricas y de los sensores ya aprovisionados si existieran FKs estrictas. Para auditoría analítica (cálculo de ROI sobre rangos pasados, reportes de uso por aula extinta), **es valioso preservar los registros hijos** con el `room_id` original como referencia textual aunque el aula ya no exista físicamente.

**Solución implementada** — Estrategia de **Soft Delete del padre con orfandad intencional del hijo**.

#### 3.4.1 Esquema sin FK estrictas

Las migraciones idempotentes (`backend/app/main.py:74-123`) **eliminan deliberadamente** las constraints FK sobre `room_id` en las tablas hijas:

```python
"ALTER TABLE sensor_devices DROP CONSTRAINT IF EXISTS sensor_devices_room_id_fkey",
"ALTER TABLE reservations   DROP CONSTRAINT IF EXISTS reservations_room_id_fkey",
```

La FK **sí se mantiene** sobre `schedules.room_id` porque los horarios son **configuración tightly-coupled** que debe morir con el aula. En cambio, `reservations` y `sensor_devices` quedan **sin FK** intencionalmente.

#### 3.4.2 Endpoint `DELETE /admin/rooms/{room_id}`

(`backend/app/routes/admin.py:259-287`)

```python
@router.delete("/rooms/{room_id}", status_code=200)
def delete_room(room_id, db, current_user):
    """Delete a room. Schedules are cascade-deleted (tightly coupled config data).

    Reservation and SensorDevice rows are intentionally left intact: their room_id
    string is preserved as a historical audit reference (orphan records). No FK
    constraint exists on those columns, so the DELETE succeeds without nullifying
    or removing any child records.
    """
    _require_admin(current_user)
    db.query(Schedule).filter(Schedule.room_id == room_id).delete(...)
    db.delete(room)
    db.commit()
```

Resultado: el aula desaparece de `rooms`, los `schedules` asociados se eliminan en cascada, pero las **reservas y sensores históricos persisten** apuntando a un `room_id` "fantasma".

#### 3.4.3 Detección de huérfanos al re-crear un aula

Si un admin intenta **registrar un aula con un ID que ya tuvo historial previo**, el frontend dispara una verificación previa antes de permitir la creación:

```ts
// frontend/src/views/Infrastructure.tsx (handleRegisterRoom)
const { data } = await api.get<{ has_orphans: boolean; reservations_count: number; sensors_count: number }>(
  `/admin/rooms/check-orphans/${encodeURIComponent(id)}`
)
if (data.has_orphans) {
  setOrphanData({ reservations_count, sensors_count })
  setOrphanConfirm('')
  setOrphanWarningOpen(true)
  return  // pause — user must confirm inheritance in the warning modal
}
```

El endpoint `GET /admin/rooms/check-orphans/{room_id}` (`backend/app/routes/admin.py:122-140`) responde:

```json
{
  "has_orphans": true,
  "reservations_count": 14,
  "sensors_count": 3
}
```

#### 3.4.4 Popup de confirmación por texto

Si hay huérfanos, se abre un **modal de doble validación**:

1. Muestra el conteo exacto de reservas y sensores huérfanos que serán **re-asociados** al nuevo aula.
2. Exige al admin **escribir literalmente el ID del aula** para habilitar el botón de confirmación:

```tsx
async function confirmOrphanInheritance() {
  if (orphanConfirm !== regRoomForm.id.trim()) return  // bloqueo si no coincide
  setOrphanWarningOpen(false)
  await doRegisterRoom()
}
```

Sin coincidencia exacta carácter por carácter, el botón **permanece deshabilitado** (`disabled={orphanConfirm !== regRoomForm.id.trim()}`).

**Mecánica completa de Cascading Updates:**

| Operación | Comportamiento |
|---|---|
| `DELETE /rooms/{id}` | Schedules: cascade delete. Reservations + sensors: orphan preservation |
| `PUT /rooms/{id}` con `new_id` (rename PK) | Insert nuevo + bulk UPDATE de schedules + UPDATE condicional de sensors/reservations según flags `cascade_sensors` y `cascade_reservations` |
| `POST /rooms` con ID ya con huérfanos | Frontend exige confirmación textual del ID; al confirmar, los huérfanos quedan re-asociados automáticamente (mismo `room_id` string) |

**Resultado:**

- **Auditoría preservada** — ROI histórico de aulas extintas sigue computable.
- **Re-asociación deliberada** — recrear un aula con un ID previo es un acto consciente y confirmado, no un side-effect accidental.
- **Sin pérdida de datos** — ningún `DELETE CASCADE` destruye registros de negocio.

---

### 3.5 Inputs Numéricos Fluidos y UI Minimalista

**Problema:** Los inputs HTML nativos `<input type="number">` presentan dos fricciones de UX:

1. **Spinners visibles** (las flechitas ↑↓ del lado derecho) rompen el diseño minimalista del dashboard oscuro.
2. **Comportamiento de campo vacío** — al borrar el contenido, el `value` queda como cadena vacía `""`, y el estado de React se desincroniza del DOM. Al hacer submit con campo vacío el backend recibe `null` o `NaN` y rechaza la operación.

**Solución implementada:**

#### 3.5.1 Desactivación de spinners nativos

Clase Tailwind compuesta aplicada a todo input numérico (`frontend/src/views/Infrastructure.tsx:396`, `Reservations.tsx:269`):

```ts
const numInputCls = `${inputCls} [appearance:textfield]
  [&::-webkit-outer-spin-button]:appearance-none
  [&::-webkit-inner-spin-button]:appearance-none`
```

Cubre los tres motores principales:

- **Firefox** → `appearance: textfield` (vía `[appearance:textfield]`).
- **Chrome / Edge / Safari** → `::-webkit-outer-spin-button` y `::-webkit-inner-spin-button` con `appearance: none`.

#### 3.5.2 Recuperación de valor al perder foco

Patrón `onBlur` de "empty-to-default":

```tsx
<input
  type="number"
  required min={1}
  value={regRoomForm.max_capacity}
  onChange={e => setRegRoomForm(f => ({ ...f, max_capacity: e.target.value }))}
  onBlur={e => setRegRoomForm(f => ({
    ...f,
    max_capacity: e.target.value === '' ? '0' : e.target.value,
  }))}
  className={numInputCls}
/>
```

**Mecánica:**

1. `onChange` permite **cadena vacía transitoria** mientras el usuario borra y reescribe (UX fluida — no fuerza `0` mientras el cursor está activo).
2. `onBlur` se dispara cuando el input pierde el foco. Si el valor quedó vacío, se sustituye por `'0'` (o `'1'` para `expected_occupancy`).
3. El estado `useState` mantiene el valor como **string** (`'30'`, `'22'`) y se convierte a `Number()` sólo al enviar al backend — evita corrupciones intermedias de tipo.

**Resultado:**

- Cero spinners visuales en todo el dashboard.
- Cero envíos con campos vacíos.
- Cursor libre durante la edición — no se inyectan ceros automáticos mientras el usuario teclea.

---

### 3.6 Fijación de Destellos en Gráficos de Rentabilidad

**Problema:** El `Tooltip` de **Recharts** en el `BarChart` del dashboard de ROI (`frontend/src/views/ROIReport.tsx`) renderiza por defecto un **cursor de fondo claro semi-transparente** que se superpone a la barra hover. Sobre el tema oscuro de la plataforma (`bg-slate-800` con barras `#f97316` / `#22d3ee`), este cursor genera un **destello blanco** que parece un flash o artefacto visual.

**Solución implementada** (`frontend/src/views/ROIReport.tsx:215`):

```tsx
<Tooltip
  contentStyle={TOOLTIP_STYLE}
  cursor={{ fill: 'transparent' }}
/>
```

La prop `cursor={{ fill: 'transparent' }}` hace que el `<rect>` que Recharts dibuja detrás de la barra en hover sea **completamente transparente**, eliminando el destello sin sacrificar:

- La aparición del tooltip flotante (`contentStyle` con el tema dark personalizado).
- La detección de hover (sigue funcionando para mostrar el valor).
- El highlight implícito de la barra (los colores `#f97316` y `#22d3ee` no se alteran).

**Resultado:** Tooltip funcional, sin parpadeos ni manchas claras sobre el fondo oscuro. La identidad visual del dashboard permanece coherente.

---

### 3.7 Ocupación Esperada vs. Real (Feed-Forward + Feedback)

**Problema:** El motor cognitivo original ajustaba el setpoint del AC usando **una sola** señal de ocupación: `expected_people`, tomada del `Schedule`/`Reservation`. Es la ocupación **planificada**. Pero un aula reservada para 40 personas a la que asisten 5 recibía enfriamiento para 40 → **desperdicio energético**, justo lo que el sistema busca evitar. La ocupación **real** nunca se medía, pese a que el sensor de CO₂ ya la contiene implícitamente.

**Distinción conceptual — dos variables, nunca fusionadas:**

| Variable | Origen | Disponible | Rol de control |
|---|---|---|---|
| `expected_occupancy` | Reserva / horario (plan) | **antes** de la clase | **Feed-forward** → pre-cooling anticipado |
| `actual_occupancy` | Inferida del `co2_ppm` (medición) | **durante** la clase | **Feedback** → corrección en lazo cerrado |

**Solución implementada** — Patrón estándar de control **feed-forward + feedback**.

#### 3.7.1 Estimación de ocupación real desde CO₂

`backend/app/services/occupancy_service.py` — balance de masa en estado estacionario:

```python
CO2_BASELINE_PPM   = 420.0   # aula vacía / aire exterior
CO2_PPM_PER_PERSON = 25.0    # incremento de CO₂ por ocupante (calibrable)

def estimate_actual_occupancy(co2_ppm, max_capacity=None):
    if co2_ppm is None:
        return None                                  # sin señal → feed-forward puro
    est = max(0.0, (co2_ppm - CO2_BASELINE_PPM) / CO2_PPM_PER_PERSON)
    return round(min(est, max_capacity) if max_capacity else est)
```

Ambas constantes son **calibrables**; los defaults asumen un aula con ventilación ligera. Se recomienda recalibrar contra un par de conteos manuales.

#### 3.7.2 Mezcla ponderada en el motor predictivo

`backend/app/services/predictive_service.py` combina ambas señales vía `FEEDBACK_WEIGHT` (0.6 por defecto):

```python
if actual_people is None:
    effective_people = expected_people                       # feed-forward puro
else:
    effective_people = (1 - FEEDBACK_WEIGHT) * expected_people \
                       + FEEDBACK_WEIGHT * actual_people      # feed-forward + feedback
```

- `FEEDBACK_WEIGHT = 0` → confía sólo en el plan.
- `FEEDBACK_WEIGHT = 1` → confía sólo en el sensor.
- `0.6` → se apoya en la realidad medida conservando anticipación durante el ramp-up inicial de la ventana de ocupación.

En **modo ML**, ambas señales entran como features distintas: `[current_temp, hour, expected_occupancy, actual_occupancy]` — el modelo aprende a ponderarlas. En **modo heurístico**, se usa `effective_occupancy × 0.05`.

#### 3.7.3 Gap tracking (plan vs. realidad)

Cada `cognitive_action` persistida en MongoDB ahora incluye telemetría de ocupación:

```json
{
  "expected_occupancy": 40,
  "actual_occupancy": 6,
  "effective_occupancy": 19.6,
  "occupancy_gap": 34
}
```

- `occupancy_gap = expected − actual`. Positivo → sobre-reserva / no-shows; negativo → sobrecupo.
- Sirve como dataset para **demand forecasting**, detección de no-shows y métrica de eficiencia energética.

#### 3.7.4 Coherencia física en la data sintética

`ml_pipeline/extract_data.py` genera el gap de forma **físicamente coherente**: primero sortea `expected_occupancy` (plan), aplica una `attendance_rate` (0.55–0.95) + walk-ins para obtener `actual_occupancy`, y **deriva el `co2_ppm` a partir del actual** (no del expected). Así el dataset refleja la relación real CO₂ ↔ ocupación y demuestra el aporte del feedback loop.

> ⚠️ **Limitación conocida:** al inicio de una ventana de ocupación el CO₂ aún no ha subido, por lo que `actual_occupancy` subestima transitoriamente. El `FEEDBACK_WEIGHT < 1` mitiga esto conservando peso en el plan. Un modelo dinámico (respuesta de primer orden del CO₂) es trabajo futuro.

**Resultado:** El AC se ajusta a quién **está** en el aula, no sólo a quién fue reservado. Aula medio vacía → CO₂ bajo → menor carga térmica estimada → STANDBY antes → ahorro energético real.

---

## 4. Hitos del Proyecto y Hoja de Ruta

### Infraestructura

- [x] Base de datos políglota (MongoDB + PostgreSQL) — separación clara entre telemetría de alto volumen y entidades de negocio
- [x] Dockerización completa con healthchecks para PostgreSQL (`pg_isready`) y MongoDB (`mongosh ping`)
- [x] `depends_on: service_healthy` — el backend espera a que ambas bases estén listas antes de arrancar
- [x] Volúmenes persistentes (`postgres_data`, `mongo_data`) — los datos sobreviven a `docker compose down`
- [x] Scripts de bootstrap montados read-only en `/docker-entrypoint-initdb.d/`
- [x] Proxy reverso Nginx para el frontend Vite (build estático servido en puerto 80)
- [x] Migraciones de esquema **idempotentes** al startup (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, bloques `DO $$ ... $$` con guard)
- [x] Seed automático del usuario administrador con **hash Argon2 re-aplicado en cada arranque** (self-healing ante migraciones de hashing)
- [x] Reintentos al arrancar (5 intentos × 3 s) para tolerar arranque lento de PostgreSQL

### Backend & Seguridad

- [x] Autenticación JWT con hashing **Argon2** (`pwdlib`) — algoritmo memory-hard recomendado por OWASP
- [x] RBAC de 3 niveles: `admin` > `collaborator` > `guest` (jerarquía estricta)
- [x] Tokens de **corta duración (15 minutos)** — superficie de ataque acotada en caso de exfiltración
- [x] `sessionStorage` (no `localStorage`) — token destruido automáticamente al cerrar la pestaña
- [x] `SECRET_KEY` **aleatorio en memoria** si no se provee en `.env` — todos los tokens caducan al reiniciar el contenedor (defensa en profundidad para entornos sin secret manager)
- [x] Interceptor 401 con **guard anti-ciclo-infinito** — un 401 durante el flujo de logout no dispara redirecciones recursivas
- [x] **Prevención de auto-bloqueo de admin** — el endpoint `PATCH /users/{id}/status` rechaza cambios sobre `current_user.id`
- [x] Control físico de sensores con RBAC estricto — `collaborator` sólo puede togglear si tiene una `Reservation` activa sobre el aula del sensor
- [x] Aprovisionamiento de sensores **siempre inactivos por defecto** (`is_active=False`, `control_enabled=False`)
- [x] Validación de estado y rol en registro/aprobación — `guest` auto-aprobado, `collaborator` y `admin` quedan en `pending`
- [x] API Key separada para endpoints expuestos a Watson (`/sensors/`, `/chat/`) — header `X-API-Key` con valor `WATSON_EXTENSION_KEY`
- [x] Política de orfandad histórica intencional sobre reservas y sensores tras `DELETE` de aula

### Capa Cognitiva

- [x] ML Pipeline con `scikit-learn` — entrenamiento, validación y serialización `joblib`
- [x] Heurístico de bootstrap como **fallback** cuando `model.joblib` no existe (`personas × 0.05` °C de carga térmica)
- [x] **Ocupación real vs. esperada** — estimación de `actual_occupancy` desde CO₂ (`occupancy_service.py`) + mezcla feed-forward/feedback (`FEEDBACK_WEIGHT`) + `occupancy_gap` persistido (sección 3.7)
- [x] Persistencia de `cognitive_action` en MongoDB junto a cada lectura — campos: `ac_status` (`ON` / `STANDBY` / `DISABLED`), `target`, `model_used` (`ml` / `heuristic`)
- [x] Integración **IBM Watson Assistant** vía proxy `/api/v1/chat/` (custom extension con OpenAPI publicado en `openapi_watson.json`)
- [x] Motor de cálculo de **ROI energético** (`/reports/roi`): 7 días, kWh ahorrado, CO₂ evitado (kg), valor monetario (USD)
- [x] **Simulación de ROI** cuando la base de datos es reciente y aún no hay suficiente historial — proyecta valores plausibles para que el dashboard no quede vacío en demos

### Frontend UI

- [x] Dashboard global con sidebar filtrado por rol (RBAC en cliente reflejando RBAC en servidor)
- [x] Vista de aulas con estado AC en **tiempo real** vía polling
- [x] Detalle de aula: historial de lecturas + toggles de sensor con feedback inmediato
- [x] Formularios de reserva con validación de horario (no se permiten reservas solapadas)
- [x] Panel de gestión de usuarios — aprobación, rechazo, reactivación de cuentas
- [x] **Doble panel simétrico** Aulas ↔ Sensores en `Infrastructure.tsx` (sección 3.3)
- [x] Dashboard de rentabilidad — KPIs + `BarChart` Tradicional vs. Cognitivo + resumen cognitivo (modelo activo, sensores reportando, último ajuste)
- [x] Chat flotante Watson — FAB + ventana pop-up con historial **persistido en sesión**
- [x] Zona de herramientas de desarrollador visualmente aislada (badge dev-only en el `GlobalDashboard`)
- [x] Protección de auto-bloqueo en UI — badge "Tú" sobre el propio usuario, acciones de bloqueo deshabilitadas
- [x] Toast de éxito/error con auto-dismiss en todos los formularios
- [x] **Ghost Intervals controlados** con cleanup functions en `useEffect` (sección 3.1)
- [x] **TTL lógica de 15s** sobre alertas simuladas con polling de 5s (sección 3.2)
- [x] **Orfandad histórica + popup de confirmación textual** al recrear aulas con ID previo (sección 3.4)
- [x] **Inputs numéricos fluidos** sin spinners nativos + recovery `onBlur` (sección 3.5)
- [x] **Tooltip Recharts con cursor transparente** en gráfico de ROI dark-theme (sección 3.6)
- [x] Popup global de emergencias CO con dismiss + reopen automático ante nuevas alertas

### Pendientes (To-Do)

- [ ] Despliegue en Cloud (AWS ECS / GCP Cloud Run)
- [ ] Integración física del script Python de simulación en **Raspberry Pi**
- [ ] Calibración del **emisor infrarrojo** para control real del aire acondicionado
- [ ] Configuración de **túneles Ngrok persistentes** para Watson Extension (custom extension en producción)
- [ ] Notificaciones por correo al aprobar/rechazar usuarios pendientes
- [ ] Pipeline de **reentrenamiento automático** del modelo ML con datos reales (job programado leyendo de MongoDB)
- [ ] Exportación de reportes ROI a **PDF**
- [ ] Tests de integración — `pytest + httpx` para backend, **Playwright** para frontend
- [ ] TTL nativa de MongoDB (`expireAfterSeconds`) como segunda línea de defensa además del purge lazy actual
- [ ] Métricas Prometheus + dashboard Grafana sobre latencia de ingesta y tasa de inferencia ML vs. heurístico
- [ ] Internacionalización (i18n) — actualmente español hardcoded en el frontend

---

## 5. Arquitectura Tecnológica

| Capa | Tecnología | Propósito |
|---|---|---|
| **API REST** | FastAPI + Uvicorn | Ingesta de sensores, RBAC, auth JWT, OpenAPI auto-generado |
| **Base NoSQL** | MongoDB 6.0 (Motor async) | Lecturas de sensores + `cognitive_action` |
| **Base SQL** | PostgreSQL 15 (SQLAlchemy 2.0) | Usuarios, aulas, reservas, dispositivos, schedules |
| **Motor cognitivo** | scikit-learn + NumPy | Predicción de carga térmica (ML + heurístico) |
| **IA conversacional** | IBM Watson Assistant | Chatbot vía custom extension |
| **Frontend** | React 18 + Vite + TypeScript | Dashboard multi-rol con RBAC |
| **UI / Gráficos** | Tailwind CSS + Recharts | Visualización métricas y ROI |
| **Auth** | JWT (`python-jose`) + `pwdlib` Argon2 | Tokens 15 min + `sessionStorage` |
| **Contenedores** | Docker + Docker Compose | Orquestación del stack completo |
| **Proxy** | Nginx (frontend container) | Servido estático del build Vite |

---

## 6. Endpoints API

### Auth (público)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Obtener JWT (form-encoded) |
| `POST` | `/api/v1/auth/register` | Registrar cuenta nueva |

### Sensores (requiere API Key `X-API-Key`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/v1/sensors/` | Ingestar lectura IoT + ejecutar acción cognitiva |
| `GET` | `/api/v1/sensors/` | Listar lecturas filtrables por `room_id`, `sensor_id` |
| `GET` | `/api/v1/sensors/emergencies` | Alertas CO > 50 ppm (ventana 15 s) |
| `PUT` | `/api/v1/sensors/{id}/control` | Activar/desactivar sensor (admin o collaborator con reserva activa) |

### Admin (requiere JWT)

| Método | Ruta | Descripción |
|---|---|---|
| `GET / POST` | `/api/v1/admin/rooms` | Listar / crear aulas con ID explícito |
| `GET` | `/api/v1/admin/rooms/{id}` | Detalle de aula |
| `GET` | `/api/v1/admin/rooms/check-orphans/{id}` | Verificar registros huérfanos asociados a un ID |
| `PUT` | `/api/v1/admin/rooms/{id}` | Editar / renombrar PK con flags de cascade |
| `DELETE` | `/api/v1/admin/rooms/{id}` | Eliminar aula (orfandad histórica de hijos) |
| `POST` | `/api/v1/admin/setup-rooms` | Upsert legacy de aula + horarios |
| `GET / POST` | `/api/v1/admin/devices` | Listar / registrar sensores |
| `POST` | `/api/v1/admin/sensors` | Aprovisionar sensor (inactivo por defecto) |
| `PUT` | `/api/v1/admin/sensors/{id}` | Reasignar / renombrar sensor |
| `GET` | `/api/v1/admin/users` | Listar usuarios (admin) |
| `PATCH` | `/api/v1/admin/users/{id}/status` | Cambiar estado de cuenta (no auto-bloqueo) |
| `GET / POST` | `/api/v1/admin/reservations` | Listar / crear reservas |

### Reportes (requiere JWT admin)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/v1/reports/roi` | Cálculo de ROI energético (7 días) |

### Chat (requiere API Key)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/v1/chat/` | Enviar mensaje a Watson Assistant |

---

## 7. Roles y Permisos (RBAC)

| Rol | Acceso |
|---|---|
| `admin` | Todo: usuarios, sensores, reservas, ROI, aprovisionamiento |
| `collaborator` | Dashboard, aulas, reservas propias, control de sensor (con reserva activa) |
| `guest` | Dashboard y aulas en modo solo lectura |

**Flujo de aprobación:**

- Cuentas nuevas con rol `guest` se aprueban automáticamente (`status = active`).
- Roles `collaborator` y `admin` quedan en estado `pending` hasta aprobación manual desde **Gestión de Usuarios**.

---

## 8. Motor Cognitivo — Flujo de Ingesta

```
Lectura IoT (POST /sensors/)
        │
        ▼
  ¿Sensor activo?  ──No──▶  Descartar (no guardar)
        │ Sí
        ▼
  ¿Control habilitado?  ──No──▶  ac_status = DISABLED
        │ Sí
        ▼
  Buscar contexto de aula (horario, target_temp, ocupación esperada, max_capacity)
        │
        ▼
  Ocupación efectiva = feed-forward (expected/reserva) ⊕ feedback (actual desde CO₂)
    effective = (1−w)·expected + w·actual      (w = FEEDBACK_WEIGHT; actual=None → expected)
        │
        ▼
  Calcular carga térmica
    ├─ ML model (scikit-learn): predict([temp, hora, expected, actual])
    └─ Heurístico: effective × 0.05 (fallback si no hay model.joblib)
        │
        ▼
  adjusted_target = target_temp − thermal_load
  temp > adjusted_target  ──▶  ac_status = ON  (PRE-COOLING)
                          ──▶  ac_status = STANDBY
        │
        ▼
  Guardar en MongoDB (lectura + cognitive_action)
```

---

## 9. Variables de Entorno

| Variable | Default | Descripción |
|---|---|---|
| `MONGO_URI` | `mongodb://mongo:27017` | URI de conexión MongoDB |
| `POSTGRES_URI` | `postgresql://postgres:postgres@postgres:5432/climate_db` | URI PostgreSQL (compuesto vía compose) |
| `POSTGRES_USER` | `postgres` | Usuario PostgreSQL |
| `POSTGRES_PASSWORD` | `postgres` | Contraseña PostgreSQL |
| `POSTGRES_DB` | `climate_db` | Nombre de la base de datos PostgreSQL |
| `SECRET_KEY` | *(aleatorio en memoria)* | Clave de firma JWT — establecer en producción |
| `ALGORITHM` | `HS256` | Algoritmo JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Vida útil del token JWT |
| `WATSON_API_KEY` | `""` | API key de IBM Watson Assistant |
| `WATSON_URL` | `""` | Endpoint de la instancia Watson |
| `WATSON_ASSISTANT_ID` | `""` | ID del asistente Watson |
| `WATSON_EXTENSION_KEY` | `""` | Clave compartida para custom extension Watson (header `X-API-Key`) |

---

> Para guía de instalación y comandos de despliegue, ver [README.md](./README.md).
