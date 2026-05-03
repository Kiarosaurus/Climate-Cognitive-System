from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class SensorReading(BaseModel):
    sensor_id: str
    temperature: float = Field(..., description="Temperature in Celsius")
    humidity: float = Field(..., description="Relative humidity percentage")
    co2_ppm: Optional[float] = Field(None, description="CO2 concentration in ppm")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
