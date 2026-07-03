# seed_data — Dataset UTEC (Climate Cognitive System)

Generador de historial realista del campus **UTEC Barranco, Lima** para poblar las
bases de datos del sistema. No es telemetría de hardware real: reproduce el
comportamiento observado (asistencia, CO₂, clima de Lima) de forma coherente con el
motor cognitivo.

## Contenido

| Archivo | Propósito |
|---|---|
| `generate_dataset.py` | Genera lecturas + cataloga rooms/horarios/reservas e inserta en Mongo + Postgres |
| `output/` | (dry-run) `sensor_readings.json` + `catalog.json` — artefacto reproducible, no versionado |

## Qué genera

- **Ventana:** Lun 2026-05-18 → Dom 2026-07-05 (~2 meses).
- **6 rooms** (A403, M601, M604, M1001, M802, M602) con A/C target 20 °C y sensor `s-<room>`.
- **Horarios semanales** (`Schedule`) con la reserva como `expected_people`.
- **Lecturas** (`sensor_readings`) cada 10 min por sesión + 30 min de warm-up (aula vacía).
- **`actual_occupancy`** decae linealmente del piso "inicio" al "actual" por (room, weekday),
  con un **bump reproducible de hasta +2** (0, +1 o +2; `random.Random` keyed por room+fecha+`ATTENDANCE_SEED`)
  que hace la curva **no monótona**. Fechas especiales lo sobreescriben. El `co2_ppm` se
  **deriva** del actual (mass-balance), así el gap plan-vs-realidad queda físicamente coherente.
- **Clima Lima invierno:** frío, húmedo (garúa); indoor cerca de 20 °C. Cada lectura
  guarda `outdoor_temp` (de `climate_service.py`), driver exógeno del target ML (ver
  TECHNICAL_DOCUMENTATION.md §3.9); el indoor se acopla parcialmente al exterior por la envolvente.
- **Reservas futuras** (post 5-jul) en la tabla `Reservation`.

## Uso

Desde la raíz del proyecto, con los puertos de las DB expuestos en `localhost`:

```bash
python seed_data/generate_dataset.py --dry-run   # solo JSON en output/, sin tocar DB
python seed_data/generate_dataset.py             # inserta en Mongo + Postgres
python seed_data/generate_dataset.py --wipe      # limpia sensor_readings antes de insertar
```

Overrides: `MONGO_URI`, `POSTGRES_URI`.

> Reset previo recomendado: `docker compose down -v && docker compose up -d` (re-ejecuta
> los init scripts), luego correr el generador. El usuario `profesor_utec` se crea para
> asociar las reservas.

## Fuente única de constantes

Las constantes de ocupación/CO₂ se importan de `backend/app/services/occupancy_service.py`
y `predictive_service.py` — no duplicar aquí para evitar drift.
