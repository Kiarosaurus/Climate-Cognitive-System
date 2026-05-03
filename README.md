# Climate Cognitive System

Sistema IoT de **Gestión Climática Predictiva** para entornos universitarios. Combina sensores físicos, un motor de inferencia cognitiva (ML + reglas), y automatización del aire acondicionado para optimizar confort energético en tiempo real. La plataforma incluye un panel web multi-rol, integración con IBM Watson Assistant, y cálculo de retorno de inversión (ROI).

---

## Arquitectura Tecnológica

| Capa | Tecnología | Propósito |
|---|---|---|
| **API REST** | FastAPI + Uvicorn | Ingesta de sensores, RBAC, auth JWT |
| **Base de datos NoSQL** | MongoDB 6.0 (Motor) | Lecturas de sensores + acciones cognitivas |
| **Base de datos SQL** | PostgreSQL 15 (SQLAlchemy) | Usuarios, aulas, reservas, dispositivos |
| **Motor cognitivo** | scikit-learn + NumPy | Predicción de carga térmica (ML / heurístico) |
| **IA Conversacional** | IBM Watson Assistant | Chatbot de consultas climáticas |
| **Frontend** | React 18 + Vite + TypeScript | Dashboard multi-rol con RBAC |
| **UI / Gráficos** | Tailwind CSS + Recharts | Visualización de métricas y ROI |
| **Auth** | JWT (python-jose) + pwdlib Argon2 | Tokens cortos (15 min) + sessionStorage |
| **Contenedores** | Docker + Docker Compose | Orquestación del stack completo |

---

## Estructura del Proyecto

```
Climate-Cognitive-System/
├── backend/
│   ├── app/
│   │   ├── main.py              # Startup, migrations, seed admin
│   │   ├── config.py            # Variables de entorno + SECRET_KEY aleatorio
│   │   ├── dependencies.py      # get_current_user (JWT decode + RBAC)
│   │   ├── core/
│   │   │   └── security.py      # Hash Argon2, JWT create/decode
│   │   ├── models/
│   │   │   ├── admin.py         # ORM: User, Room, SensorDevice, Reservation, Schedule
│   │   │   └── sensor.py        # Pydantic: SensorReading
│   │   ├── routes/
│   │   │   ├── auth.py          # POST /login, POST /register
│   │   │   ├── admin.py         # Gestión de aulas, sensores, usuarios, reservas
│   │   │   ├── sensors.py       # Ingesta + control físico de sensores
│   │   │   ├── reports.py       # GET /roi — Dashboard de rentabilidad
│   │   │   └── chat.py          # Proxy a IBM Watson Assistant
│   │   ├── services/
│   │   │   ├── data_service.py  # Pipeline de ingesta + persistencia cognitiva
│   │   │   ├── predictive_service.py  # Motor ML / heurístico de carga térmica
│   │   │   └── watson_service.py      # Cliente IBM Watson Assistant
│   │   └── ml/
│   │       └── model.joblib     # Modelo entrenado (generado por ml_pipeline/)
│   ├── ml_pipeline/
│   │   ├── extract_data.py      # Exporta lecturas de MongoDB a CSV
│   │   └── train_model.py       # Entrena y serializa el modelo scikit-learn
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/client.ts        # Axios + interceptor 401 → logout + redirect
│   │   ├── context/AuthContext.tsx  # JWT sessionStorage + Bearer injection
│   │   ├── components/
│   │   │   ├── Layout.tsx       # Sidebar RBAC, topbar, FloatingChat
│   │   │   ├── Login.tsx
│   │   │   └── FloatingChat.tsx # Chat flotante Watson (FAB)
│   │   └── views/
│   │       ├── GlobalDashboard.tsx   # Vista principal + herramientas dev
│   │       ├── RoomSearch.tsx        # Listado de aulas con estado AC
│   │       ├── RoomDetail.tsx        # Detalle + control de sensores
│   │       ├── SensorSearch.tsx      # Inventario de sensores (admin)
│   │       ├── AddDevices.tsx        # Aprovisionamiento hardware (admin)
│   │       ├── Reservations.tsx      # Gestión de reservas
│   │       ├── UserManagement.tsx    # Aprobación de usuarios (admin)
│   │       ├── ROIReport.tsx         # Dashboard de rentabilidad (admin)
│   │       └── Register.tsx          # Registro público
│   ├── package.json
│   └── vite.config.ts
├── simulator/                   # Generador de datos sintéticos IoT
├── docker-compose.yml
└── README.md
```

---

## Inicio Rápido

### Requisitos

- Docker ≥ 24.0 y Docker Compose ≥ 2.0
- Node.js ≥ 18 (solo para generar `package-lock.json` la primera vez)

### 1 — Generar package-lock.json (una sola vez)

El build de Docker necesita `package-lock.json` para instalar dependencias reproducibles:

```bash
cd frontend
npm install
cd ..
```

### 2 — Configurar variables de entorno (opcional)

Copia y edita el archivo de entorno:

```bash
cp .env.example .env   # si existe, o crea .env manualmente
```

En producción, establece al menos:

```env
SECRET_KEY=<cadena-aleatoria-256-bit>
WATSON_API_KEY=<tu-api-key>
WATSON_URL=<tu-url>
WATSON_ASSISTANT_ID=<tu-assistant-id>
WATSON_EXTENSION_KEY=<clave-compartida-con-watson>
```

> Si `SECRET_KEY` no se provee, la app genera uno aleatorio en memoria cada startup — todos los tokens expiran al reiniciar.

### 3 — Levantar el stack completo

```bash
docker compose up --build
```

Para levantar en background:

```bash
docker compose up --build -d
```

Para reconstruir solo un servicio (ej. tras cambios en el backend):

```bash
docker compose up --build -d backend
docker compose up --build -d frontend
```

### Servicios expuestos

| Servicio | URL |
|---|---|
| Frontend (React) | http://localhost:3000 |
| API REST | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| MongoDB | mongodb://localhost:27017 |
| PostgreSQL | postgresql://localhost:5432 |

### Credenciales por defecto

| Campo | Valor |
|---|---|
| Usuario admin | `admin` |
| Contraseña admin | `admin` |

---

## Roles y Permisos (RBAC)

| Rol | Acceso |
|---|---|
| `admin` | Todo: usuarios, sensores, reservas, ROI, aprovisionamiento |
| `collaborator` | Dashboard, aulas, reservas propias, control sensor (con reserva activa) |
| `guest` | Dashboard y aulas en modo solo lectura |

Cuentas nuevas con rol `guest` se aprueban automáticamente. Los roles `collaborator` y `admin` quedan en estado `pending` hasta aprobación manual desde Gestión de Usuarios.

---

## API Endpoints

### Auth
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Obtener JWT (form-encoded) |
| `POST` | `/api/v1/auth/register` | Registrar cuenta nueva |

### Sensores (requiere API Key)
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/v1/sensors/` | Ingestar lectura IoT + acción cognitiva |
| `GET` | `/api/v1/sensors/` | Listar lecturas (filtrables por `room_id`, `sensor_id`) |
| `PUT` | `/api/v1/sensors/{id}/control` | Activar/desactivar sensor (admin o collaborator con reserva) |

### Admin (requiere JWT)
| Método | Ruta | Descripción |
|---|---|---|
| `GET/POST` | `/api/v1/admin/rooms` | Listar / crear aulas con ID explícito |
| `GET` | `/api/v1/admin/rooms/{id}` | Detalle de aula |
| `POST` | `/api/v1/admin/setup-rooms` | Upsert de aula + horarios (uso legacy/script) |
| `GET/POST` | `/api/v1/admin/devices` | Listar / registrar sensores (POST: admin) |
| `POST` | `/api/v1/admin/sensors` | Aprovisionar sensor (inactivo por defecto) |
| `GET` | `/api/v1/admin/users` | Listar todos los usuarios (admin) |
| `PATCH` | `/api/v1/admin/users/{id}/status` | Cambiar estado de cuenta (admin, no auto-bloqueo) |
| `GET/POST` | `/api/v1/admin/reservations` | Listar / crear reservas |

### Reportes (requiere JWT admin)
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/v1/reports/roi` | Cálculo de ROI energético (últimos 7 días) |

### Chat (requiere API Key)
| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/v1/chat/` | Enviar mensaje a Watson Assistant |

---

## Variables de Entorno

| Variable | Default | Descripción |
|---|---|---|
| `MONGO_URI` | `mongodb://mongo:27017` | URI de conexión MongoDB |
| `POSTGRES_URI` | `postgresql://postgres:postgres@localhost:5432/climate_db` | URI PostgreSQL |
| `SECRET_KEY` | *(aleatorio en memoria)* | Clave de firma JWT — establecer en producción |
| `ALGORITHM` | `HS256` | Algoritmo JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Vida útil del token JWT |
| `WATSON_API_KEY` | `""` | API key de IBM Watson Assistant |
| `WATSON_URL` | `""` | Endpoint de la instancia Watson |
| `WATSON_ASSISTANT_ID` | `""` | ID del asistente Watson |
| `WATSON_EXTENSION_KEY` | `""` | Clave compartida para custom extension Watson |

---

## Motor Cognitivo — Flujo de Ingesta

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
  Buscar contexto de aula (horario, target_temp, ocupación esperada)
        │
        ▼
  Calcular carga térmica
    ├─ ML model (scikit-learn): predict([temp, hora, personas])
    └─ Heurístico: personas × 0.05 (fallback si no hay model.joblib)
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

## Hitos del Proyecto y Hoja de Ruta

### Infraestructura
- [x] Base de datos políglota (MongoDB + PostgreSQL)
- [x] Dockerización completa con healthchecks
- [x] Proxy reverso Nginx para frontend Vite
- [x] Migraciones de esquema idempotentes al startup
- [x] Seed automático de usuario administrador

### Backend & Seguridad
- [x] Autenticación JWT con hashing Argon2 (pwdlib)
- [x] RBAC de 3 niveles: admin > collaborator > guest
- [x] Tokens de corta duración (15 minutos)
- [x] `sessionStorage` — token destruido al cerrar pestaña
- [x] `SECRET_KEY` aleatorio en memoria si no se provee en `.env`
- [x] Interceptor 401 con guard anti-ciclo-infinito
- [x] Prevención de auto-bloqueo de administrador
- [x] Control físico de sensores con RBAC estricto (reserva activa)
- [x] Aprovisionamiento de sensores siempre inactivos por defecto
- [x] Validación de estado y rol en registro/aprobación

### Capa Cognitiva
- [x] ML Pipeline con scikit-learn (entrenamiento + serialización joblib)
- [x] Heurístico de bootstrap como fallback cuando no hay modelo entrenado
- [x] Persistencia de `cognitive_action` (ac_status, target, modelo) en MongoDB
- [x] Integración IBM Watson Assistant (proxy `/chat/`)
- [x] Motor de cálculo de ROI energético (7 días, kWh, CO₂, USD)
- [x] Simulación de ROI cuando la base de datos es reciente

### Frontend UI
- [x] Dashboard global con sidebar filtrado por rol (RBAC)
- [x] Vista de aulas con estado AC en tiempo real
- [x] Detalle de aula: historial de lecturas + toggles de sensor
- [x] Formularios de reserva con validación de horario
- [x] Panel de gestión de usuarios (aprobación / rechazo / reingresar)
- [x] Formulario de aprovisionamiento de hardware (aulas + sensores)
- [x] Dashboard de rentabilidad (KPIs + BarChart comparativo + resumen cognitivo)
- [x] Chat flotante Watson (FAB + ventana pop-up con historial de sesión)
- [x] Zona de herramientas de desarrollador visualmente aislada
- [x] Protección de auto-bloqueo en UI (badge "Tú" + acciones deshabilitadas)
- [x] Toast de éxito/error con auto-dismiss en formularios

### Pendientes (To-Do)
- [ ] Despliegue en Cloud (AWS ECS / GCP Cloud Run)
- [ ] Integración física del script Python de simulación en Raspberry Pi
- [ ] Calibración del emisor infrarrojo para control del aire acondicionado
- [ ] Configuración de túneles Ngrok persistentes para Watson Extension
- [ ] Notificaciones por correo al aprobar/rechazar usuarios pendientes
- [ ] Pipeline de reentrenamiento automático del modelo ML con datos reales
- [ ] Exportación de reportes ROI a PDF
- [ ] Tests de integración (pytest + httpx para backend, Playwright para frontend)
