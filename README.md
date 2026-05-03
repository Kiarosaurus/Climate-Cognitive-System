# Climate Cognitive System

Cognitive IoT platform for real-time climate sensor data ingestion, storage, and anomaly detection.

## Architecture

```
Climate-Cognitive-System/
├── backend/            # FastAPI REST API
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── models/     # Pydantic schemas
│       ├── routes/     # API endpoints
│       └── services/   # Business logic
├── simulator/          # IoT sensor data generator
├── database/
│   ├── mongo/          # MongoDB init scripts
│   └── postgres/       # PostgreSQL init scripts
├── docker-compose.yml
└── requirements.txt
```

## Stack

| Layer      | Technology               |
|------------|--------------------------|
| API        | FastAPI + Uvicorn        |
| NoSQL DB   | MongoDB 6.0              |
| SQL DB     | PostgreSQL 15            |
| Simulator  | Python (requests)        |
| Container  | Docker + Docker Compose  |

## Quick Start

### Prerequisites

- Docker >= 24.0
- Docker Compose >= 2.0

### Run

```bash
docker compose up --build
```

Services:

| Service   | URL                          |
|-----------|------------------------------|
| API       | http://localhost:8000        |
| API Docs  | http://localhost:8000/docs   |
| MongoDB   | mongodb://localhost:27017    |
| PostgreSQL| postgresql://localhost:5432  |

### Local Development (without Docker)

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.app.main:app --reload # Ejecutar desde /backend
```

## API Endpoints

| Method | Path                  | Description              |
|--------|-----------------------|--------------------------|
| GET    | `/health`             | Health check             |
| POST   | `/api/v1/sensors/`    | Ingest sensor reading    |
| GET    | `/api/v1/sensors/`    | List sensor readings     |

## Sensor Reading Schema

```json
{
  "sensor_id": "sensor-001",
  "temperature": 23.5,
  "humidity": 60.2,
  "co2_ppm": 412.0,
  "timestamp": "2026-05-02T12:00:00Z"
}
```

## Environment Variables

| Variable        | Default                                          |
|-----------------|--------------------------------------------------|
| `MONGO_URI`     | `mongodb://localhost:27017`                      |
| `POSTGRES_URI`  | `postgresql://postgres:postgres@localhost:5432/climate_db` |
| `API_URL`       | `http://localhost:8000`                          |

## License

MIT
