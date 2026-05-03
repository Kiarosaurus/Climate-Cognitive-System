import logging
from datetime import time as dt_time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.database_sql import get_db_sql
from app.models.admin import Room, Schedule

logger = logging.getLogger(__name__)
router = APIRouter()


class ScheduleIn(BaseModel):
    day_of_week: int          # 0=Monday … 6=Sunday
    start_time: str           # "HH:MM" or "HH:MM:SS"
    end_time: str             # "HH:MM" or "HH:MM:SS"
    expected_people: int


class RoomIn(BaseModel):
    name: str
    max_capacity: int
    target_temp: float
    sensor_id: Optional[str] = None
    schedules: List[ScheduleIn] = []


def _parse_time(t: str) -> dt_time:
    parts = t.split(":")
    h, m = int(parts[0]), int(parts[1])
    s = int(parts[2]) if len(parts) > 2 else 0
    return dt_time(h, m, s)


@router.post("/setup-rooms", status_code=201)
def setup_room(payload: RoomIn, db: Session = Depends(get_db_sql)):
    try:
        room = db.query(Room).filter(Room.name == payload.name).first()
        if room:
            room.max_capacity = payload.max_capacity
            room.target_temp = payload.target_temp
            room.sensor_id = payload.sensor_id
        else:
            room = Room(
                name=payload.name,
                max_capacity=payload.max_capacity,
                target_temp=payload.target_temp,
                sensor_id=payload.sensor_id,
            )
            db.add(room)
            db.flush()

        # Replace all schedules for this room
        db.query(Schedule).filter(Schedule.room_id == room.id).delete()
        for s in payload.schedules:
            db.add(Schedule(
                room_id=room.id,
                day_of_week=s.day_of_week,
                start_time=_parse_time(s.start_time),
                end_time=_parse_time(s.end_time),
                expected_people=s.expected_people,
            ))

        db.commit()
        db.refresh(room)
        logger.info("Room '%s' upserted with %d schedules.", room.name, len(payload.schedules))
        return {
            "room_id": room.id,
            "name": room.name,
            "sensor_id": room.sensor_id,
            "schedules_created": len(payload.schedules),
        }
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("DB error on setup-rooms: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
