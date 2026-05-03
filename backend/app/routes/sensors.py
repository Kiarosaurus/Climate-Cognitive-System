from fastapi import APIRouter
from app.models.sensor import SensorReading

router = APIRouter()


@router.post("/", status_code=201)
def ingest_reading(reading: SensorReading):
    return {"message": "Reading received", "data": reading}


@router.get("/")
def list_readings():
    return {"readings": []}
