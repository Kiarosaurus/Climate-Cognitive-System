# Climate Cognitive System

> 📖 [Ver Documentación Extensa de Funcionalidades](./DOCUMENTACION.md)

Guía técnica para clonar, configurar y levantar el proyecto con Docker.

---

## Requisitos

- **Docker** ≥ 24.0
- **Docker Compose** ≥ 2.0
- **Node.js** ≥ 18 (solo la primera vez, para generar `frontend/package-lock.json`)
- **Git**

---

## 1. Clonar el repositorio

```bash
git clone https://github.com/<usuario>/Climate-Cognitive-System.git
cd Climate-Cognitive-System
```

---

## 2. Generar `package-lock.json` (una sola vez)

El build del contenedor de frontend requiere `package-lock.json` para una instalación reproducible.

```bash
cd frontend
npm install
cd ..
```

---

## 3. Configurar variables de entorno

Crear el archivo `.env` en la raíz del proyecto:

```bash
cp .env.example .env   # si existe la plantilla
# o crearlo manualmente con un editor
```

Contenido mínimo del archivo `.env`:

```env
# --- PostgreSQL ---
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=climate_db

# --- Seguridad / JWT ---
SECRET_KEY=cambia-esto-por-una-cadena-aleatoria-de-256-bits
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15

# --- IBM Watson Assistant (opcional) ---
WATSON_API_KEY=
WATSON_URL=
WATSON_ASSISTANT_ID=
WATSON_EXTENSION_KEY=
```

> ⚠️ Si `SECRET_KEY` queda vacío, el backend genera uno aleatorio en memoria al arrancar — todos los tokens caducan al reiniciar el contenedor.

---

## 4. Levantar el stack

Limpiar contenedores y volúmenes previos (estado fresco):

```bash
docker compose down -v
```

Construir y levantar todos los servicios en segundo plano:

```bash
docker compose up --build -d
```

Ver logs en vivo:

```bash
docker compose logs -f backend
```

Detener el stack (conservando volúmenes):

```bash
docker compose down
```

---

## 5. Puertos locales expuestos

| Servicio              | URL                              | Puerto |
| --------------------- | -------------------------------- | ------ |
| Frontend (React)      | http://localhost:3000            | 3000   |
| Backend API (FastAPI) | http://localhost:8000            | 8000   |
| Swagger / OpenAPI     | http://localhost:8000/docs       | 8000   |
| PostgreSQL            | postgresql://localhost:5432      | 5432   |
| MongoDB               | mongodb://localhost:27017        | 27017  |

---

## 6. Credenciales por defecto

| Campo      | Valor   |
| ---------- | ------- |
| Usuario    | `admin` |
| Contraseña | `admin` |

> 🔒 Cambiar la contraseña inmediatamente tras el primer login en producción.

---

## 7. Comandos útiles

Reconstruir un único servicio:

```bash
docker compose up --build -d backend
docker compose up --build -d frontend
```

Acceder al shell de un contenedor:

```bash
docker compose exec backend bash
docker compose exec postgres psql -U postgres -d climate_db
docker compose exec mongo mongosh
```

Eliminar todo (contenedores + volúmenes + redes):

```bash
docker compose down -v --remove-orphans
```

---

## 8. Estructura mínima esperada

```
Climate-Cognitive-System/
├── backend/              # FastAPI + SQLAlchemy + Motor
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
├── frontend/             # React + Vite + TypeScript
│   ├── Dockerfile
│   ├── package.json
│   └── src/
├── database/
│   ├── postgres/init.sql
│   └── mongo/init.js
├── docker-compose.yml
├── .env
└── README.md
```

---

Para detalles funcionales, arquitectura, roles, endpoints y motor cognitivo, consultar [DOCUMENTACION.md](./DOCUMENTACION.md).
