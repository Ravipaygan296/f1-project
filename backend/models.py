"""
F1 Analytics — SQLAlchemy Models
Mirror of db/schema.sql — used by FastAPI and the analytics engine.
"""

import os
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, ForeignKey,
    Date, Interval, Boolean, Text, UniqueConstraint, TIMESTAMP
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from dotenv import load_dotenv

load_dotenv()

raw_url = os.environ.get("DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost/f1_analytics")
if raw_url.startswith("postgres://"):
    raw_url = raw_url.replace("postgres://", "postgresql://", 1)
if raw_url.startswith("postgresql://"):
    raw_url = raw_url.replace("postgresql://", "postgresql+psycopg://", 1)

DATABASE_URL = raw_url
DATABASE_URL_READONLY = os.environ.get("DATABASE_URL_READONLY", DATABASE_URL)
if DATABASE_URL_READONLY.startswith("postgres://"):
    DATABASE_URL_READONLY = DATABASE_URL_READONLY.replace("postgres://", "postgresql://", 1)
if DATABASE_URL_READONLY.startswith("postgresql://"):
    DATABASE_URL_READONLY = DATABASE_URL_READONLY.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
engine_readonly = create_engine(DATABASE_URL_READONLY, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine)
SessionReadonly = sessionmaker(bind=engine_readonly)

Base = declarative_base()


def get_db():
    """Dependency for FastAPI — read-write session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_readonly_db():
    """Dependency for AI analyst — read-only session."""
    db = SessionReadonly()
    try:
        yield db
    finally:
        db.close()


class Season(Base):
    __tablename__ = "seasons"
    year = Column(Integer, primary_key=True)


class Circuit(Base):
    __tablename__ = "circuits"
    circuit_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    country = Column(String)
    locality = Column(String)
    lat = Column(Float)
    lng = Column(Float)


class Race(Base):
    __tablename__ = "races"
    race_id = Column(Integer, primary_key=True, autoincrement=True)
    season = Column(Integer, ForeignKey("seasons.year"))
    round = Column(Integer)
    circuit_id = Column(String, ForeignKey("circuits.circuit_id"))
    name = Column(String)
    race_date = Column(Date)

    circuit = relationship("Circuit")
    __table_args__ = (UniqueConstraint("season", "round"),)


class Constructor(Base):
    __tablename__ = "constructors"
    constructor_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    color_hex = Column(String)


class Driver(Base):
    __tablename__ = "drivers"
    driver_id = Column(String, primary_key=True)
    code = Column(String)
    number = Column(Integer)
    forename = Column(String)
    surname = Column(String)
    nationality = Column(String)


class Result(Base):
    __tablename__ = "results"
    result_id = Column(Integer, primary_key=True, autoincrement=True)
    race_id = Column(Integer, ForeignKey("races.race_id"))
    driver_id = Column(String, ForeignKey("drivers.driver_id"))
    constructor_id = Column(String, ForeignKey("constructors.constructor_id"))
    grid = Column(Integer)
    position = Column(Integer)
    points = Column(Float)
    status = Column(String)
    fastest_lap_time = Column(Interval)

    race = relationship("Race")
    driver = relationship("Driver")
    constructor = relationship("Constructor")


class Lap(Base):
    __tablename__ = "laps"
    lap_id = Column(Integer, primary_key=True, autoincrement=True)
    race_id = Column(Integer, ForeignKey("races.race_id"))
    driver_id = Column(String, ForeignKey("drivers.driver_id"))
    lap_number = Column(Integer)
    lap_time = Column(Interval)
    position = Column(Integer)
    is_pit_lap = Column(Boolean, default=False)


class Stint(Base):
    __tablename__ = "stints"
    stint_id = Column(Integer, primary_key=True, autoincrement=True)
    race_id = Column(Integer, ForeignKey("races.race_id"))
    driver_id = Column(String, ForeignKey("drivers.driver_id"))
    stint_number = Column(Integer)
    compound = Column(String)
    lap_start = Column(Integer)
    lap_end = Column(Integer)


class PitStop(Base):
    __tablename__ = "pit_stops"
    pit_stop_id = Column(Integer, primary_key=True, autoincrement=True)
    race_id = Column(Integer, ForeignKey("races.race_id"))
    driver_id = Column(String, ForeignKey("drivers.driver_id"))
    stop_number = Column(Integer)
    lap = Column(Integer)
    duration = Column(Interval)


class Weather(Base):
    __tablename__ = "weather"
    weather_id = Column(Integer, primary_key=True, autoincrement=True)
    race_id = Column(Integer, ForeignKey("races.race_id"))
    recorded_at = Column(TIMESTAMP)
    air_temp = Column(Float)
    track_temp = Column(Float)
    humidity = Column(Float)
    rainfall = Column(Boolean)
