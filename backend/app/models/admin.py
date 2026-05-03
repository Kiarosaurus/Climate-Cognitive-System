from sqlalchemy import Column, Integer, String, Float, Time, ForeignKey
from sqlalchemy.orm import relationship
from app.database_sql import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="viewer")  # 'admin' | 'viewer'


class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    max_capacity = Column(Integer, nullable=False)
    target_temp = Column(Float, nullable=False)
    sensor_id = Column(String, unique=True, nullable=True, index=True)

    schedules = relationship("Schedule", back_populates="room", cascade="all, delete-orphan")


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Monday … 6=Sunday
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    expected_people = Column(Integer, nullable=False)

    room = relationship("Room", back_populates="schedules")
