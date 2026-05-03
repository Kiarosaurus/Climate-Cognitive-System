import logging
from datetime import datetime, time as dt_time, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.database_sql import get_db_sql
from app.models.admin import Room, Schedule, SensorDevice, Reservation, User, STATUSES
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class ScheduleIn(BaseModel):
    day_of_week: int          # 0=Monday … 6=Sunday
    start_time: str           # "HH:MM" or "HH:MM:SS"
    end_time: str             # "HH:MM" or "HH:MM:SS"
    expected_people: int


class RoomIn(BaseModel):
    id: str
    name: str
    max_capacity: int
    target_temp: float
    schedules: List[ScheduleIn] = []


class RoomCreateIn(BaseModel):
    id: str
    name: str
    max_capacity: int
    target_temp: float


class SensorDeviceIn(BaseModel):
    sensor_id: str
    room_id: str
    is_active: bool = True
    control_enabled: bool = True


class SensorCreateIn(BaseModel):
    id: str
    room_id: str


class StatusPatch(BaseModel):
    status: str


class ReservationIn(BaseModel):
    room_id: str
    start_time: datetime
    end_time: datetime
    expected_occupancy: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_time(t: str) -> dt_time:
    parts = t.split(":")
    h, m = int(parts[0]), int(parts[1])
    s = int(parts[2]) if len(parts) > 2 else 0
    return dt_time(h, m, s)


def _require_admin(current_user: User):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required.")


def _require_admin_or_collaborator(current_user: User):
    if current_user.role not in ("admin", "collaborator"):
        raise HTTPException(status_code=403, detail="Admin or collaborator role required.")


# ── Room endpoints ────────────────────────────────────────────────────────────

@router.get("/rooms")
def list_rooms(
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    rooms = db.query(Room).order_by(Room.id).all()
    return [{"id": r.id, "name": r.name, "max_capacity": r.max_capacity, "target_temp": r.target_temp} for r in rooms]


@router.get("/rooms/{room_id}")
def get_room(
    room_id: str,
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail=f"Room id='{room_id}' not found.")
    return {"id": room.id, "name": room.name, "max_capacity": room.max_capacity, "target_temp": room.target_temp}


@router.post("/rooms", status_code=201)
def create_room(
    payload: RoomCreateIn,
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    if db.query(Room).filter(Room.id == payload.id).first():
        raise HTTPException(status_code=409, detail=f"Room id='{payload.id}' already exists.")
    if db.query(Room).filter(Room.name == payload.name).first():
        raise HTTPException(status_code=409, detail=f"Room name='{payload.name}' already exists.")
    room = Room(
        id=payload.id,
        name=payload.name,
        max_capacity=payload.max_capacity,
        target_temp=payload.target_temp,
    )
    db.add(room)
    try:
        db.commit()
        db.refresh(room)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("DB error creating room: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    logger.info("Admin '%s' created room '%s' (%s).", current_user.username, room.id, room.name)
    return {"id": room.id, "name": room.name, "max_capacity": room.max_capacity, "target_temp": room.target_temp}


@router.post("/setup-rooms", status_code=201)
def setup_room(
    payload: RoomIn,
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    try:
        room = db.query(Room).filter(Room.name == payload.name).first()
        if room:
            room.max_capacity = payload.max_capacity
            room.target_temp = payload.target_temp
        else:
            room = Room(
                id=payload.id,
                name=payload.name,
                max_capacity=payload.max_capacity,
                target_temp=payload.target_temp,
            )
            db.add(room)
            db.flush()

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
            "schedules_created": len(payload.schedules),
        }
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("DB error on setup-rooms: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


# ── SensorDevice endpoints ────────────────────────────────────────────────────

@router.get("/devices")
def list_devices(
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    devices = db.query(SensorDevice).order_by(SensorDevice.id).all()
    return [
        {
            "sensor_id": d.id,
            "room_id": d.room_id,
            "room_name": d.room.name if d.room else None,
            "is_active": d.is_active,
            "control_enabled": d.control_enabled,
        }
        for d in devices
    ]


@router.post("/devices", status_code=201)
def register_device(
    payload: SensorDeviceIn,
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    if not db.query(Room).filter(Room.id == payload.room_id).first():
        raise HTTPException(status_code=404, detail=f"Room id={payload.room_id} not found.")
    device = db.query(SensorDevice).filter(SensorDevice.id == payload.sensor_id).first()
    if device:
        device.room_id = payload.room_id
        device.is_active = payload.is_active
        device.control_enabled = payload.control_enabled
    else:
        device = SensorDevice(
            id=payload.sensor_id,
            room_id=payload.room_id,
            is_active=payload.is_active,
            control_enabled=payload.control_enabled,
        )
        db.add(device)
    try:
        db.commit()
        db.refresh(device)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"sensor_id": device.id, "room_id": device.room_id, "is_active": device.is_active, "control_enabled": device.control_enabled}


@router.post("/sensors", status_code=201)
def provision_sensor(
    payload: SensorCreateIn,
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    if not db.query(Room).filter(Room.id == payload.room_id).first():
        raise HTTPException(status_code=404, detail=f"Room id='{payload.room_id}' not found.")
    if db.query(SensorDevice).filter(SensorDevice.id == payload.id).first():
        raise HTTPException(status_code=409, detail=f"Sensor id='{payload.id}' already exists.")
    device = SensorDevice(
        id=payload.id,
        room_id=payload.room_id,
        is_active=False,
        control_enabled=False,
    )
    db.add(device)
    try:
        db.commit()
        db.refresh(device)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    logger.info(
        "Admin '%s' provisioned sensor '%s' → room '%s' (inactive/disabled).",
        current_user.username, device.id, device.room_id,
    )
    return {"sensor_id": device.id, "room_id": device.room_id, "is_active": device.is_active, "control_enabled": device.control_enabled}


# ── User management endpoints (admin-only) ────────────────────────────────────

@router.get("/users")
def list_users(
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    users = db.query(User).order_by(User.id).all()
    return [
        {"user_id": u.id, "username": u.username, "role": u.role, "status": u.status}
        for u in users
    ]


@router.patch("/users/{user_id}/status")
def update_user_status(
    user_id: int,
    payload: StatusPatch,
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    if current_user.id == user_id:
        raise HTTPException(
            status_code=400,
            detail="Un administrador no puede modificar su propio estado de cuenta o auto-rechazarse.",
        )
    if payload.status not in STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {sorted(STATUSES)}")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User id={user_id} not found.")
    user.status = payload.status
    db.commit()
    db.refresh(user)
    logger.info("Admin '%s' set user_id=%d status='%s'.", current_user.username, user_id, payload.status)
    return {"user_id": user.id, "username": user.username, "role": user.role, "status": user.status}


# ── Reservation endpoints ─────────────────────────────────────────────────────

@router.get("/reservations")
def list_reservations(
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    reservations = db.query(Reservation).order_by(Reservation.start_time.desc()).all()
    return [
        {
            "id": r.id,
            "room_id": r.room_id,
            "room_name": r.room.name if r.room else None,
            "user_id": r.user_id,
            "username": r.user.username if r.user else None,
            "start_time": r.start_time.isoformat(),
            "end_time": r.end_time.isoformat(),
            "expected_occupancy": r.expected_occupancy,
        }
        for r in reservations
    ]


@router.post("/reservations", status_code=201)
def create_reservation(
    payload: ReservationIn,
    db: Session = Depends(get_db_sql),
    current_user: User = Depends(get_current_user),
):
    _require_admin_or_collaborator(current_user)

    if not db.query(Room).filter(Room.id == payload.room_id).first():
        raise HTTPException(status_code=404, detail=f"Room id={payload.room_id} not found.")

    # Strip tz so it matches the naive DateTime column in PostgreSQL
    start = payload.start_time.replace(tzinfo=None) if payload.start_time.tzinfo else payload.start_time
    end = payload.end_time.replace(tzinfo=None) if payload.end_time.tzinfo else payload.end_time

    if end <= start:
        raise HTTPException(status_code=400, detail="end_time must be after start_time.")

    reservation = Reservation(
        room_id=payload.room_id,
        user_id=current_user.id,
        start_time=start,
        end_time=end,
        expected_occupancy=payload.expected_occupancy,
    )
    db.add(reservation)
    try:
        db.commit()
        db.refresh(reservation)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("DB error creating reservation: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    logger.info(
        "Reservation id=%d created by '%s' for room_id=%d.",
        reservation.id, current_user.username, reservation.room_id,
    )
    return {
        "id": reservation.id,
        "room_id": reservation.room_id,
        "user_id": reservation.user_id,
        "start_time": reservation.start_time.isoformat(),
        "end_time": reservation.end_time.isoformat(),
        "expected_occupancy": reservation.expected_occupancy,
    }
