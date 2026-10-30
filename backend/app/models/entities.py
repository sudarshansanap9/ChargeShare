
import enum
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def new_uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# ENUMS
# ============================================================

class UserRole(str, enum.Enum):
    driver = "driver"
    host = "host"
    admin = "admin"


class ChargerCategory(str, enum.Enum):
    home = "home"
    business = "business"


class BookingStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"
    completed = "completed"


class PaymentStatus(str, enum.Enum):
    simulated = "simulated"
    paid = "paid"
    refunded = "refunded"

class ChargingSessionStatus(str, enum.Enum):
    active = "active"
    evidence_submitted = "evidence_submitted"
    completed = "completed"
    disputed = "disputed"


# ============================================================
# USER MODEL
# ============================================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_uuid
    )
    full_name: Mapped[str] = mapped_column(
        String(120), nullable=False
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.driver, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    chargers: Mapped[list["Charger"]] = relationship(
        back_populates="host"
    )
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="driver",
        foreign_keys="Booking.driver_id",
    )


# ============================================================
# CHARGER MODEL
# ============================================================

class Charger(Base):
    __tablename__ = "chargers"

    __table_args__ = (
        CheckConstraint(
            "power_kw > 0",
            name="ck_charger_power_positive",
        ),
        CheckConstraint(
            "price_per_kwh >= 0",
            name="ck_charger_price_nonnegative",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_uuid
    )
    host_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(
        String(160), nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text)
    location_name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    latitude: Mapped[float | None]
    longitude: Mapped[float | None]
    connector_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    power_kw: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), nullable=False
    )
    price_per_kwh: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    charger_category: Mapped[ChargerCategory] = mapped_column(
        Enum(ChargerCategory), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    host: Mapped["User"] = relationship(
        back_populates="chargers"
    )
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="charger"
    )


# ============================================================
# BOOKING MODEL
# ============================================================

class Booking(Base):
    __tablename__ = "bookings"

    __table_args__ = (
        CheckConstraint(
            "ends_at > starts_at",
            name="ck_booking_positive_duration",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_uuid
    )
    charger_id: Mapped[str] = mapped_column(
        ForeignKey("chargers.id"), index=True, nullable=False
    )
    driver_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus),
        default=BookingStatus.pending,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    charger: Mapped["Charger"] = relationship(
        back_populates="bookings"
    )
    driver: Mapped["User"] = relationship(
        back_populates="bookings",
        foreign_keys=[driver_id],
    )
    payment: Mapped["DemoPayment | None"] = relationship(
        back_populates="booking",
        uselist=False,
    )
    charging_session: Mapped["ChargingSession | None"] = relationship(
        back_populates="booking",
        uselist=False,
    )


# ============================================================
# PAYMENT MODEL
# Existing simulated-payment model retained for compatibility.
# ============================================================

class DemoPayment(Base):
    __tablename__ = "demo_payments"

    __table_args__ = (
        CheckConstraint(
            "amount >= 0",
            name="ck_demo_payment_nonnegative",
        ),
        UniqueConstraint(
            "booking_id",
            name="uq_demo_payment_booking",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_uuid
    )
    booking_id: Mapped[str] = mapped_column(
        ForeignKey("bookings.id"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    currency: Mapped[str] = mapped_column(
        String(3), default="INR", nullable=False
    )
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus),
        default=PaymentStatus.simulated,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    booking: Mapped["Booking"] = relationship(
        back_populates="payment"
    )


# ============================================================
# REVIEW MODEL
# ============================================================

class Review(Base):
    __tablename__ = "reviews"

    __table_args__ = (
        CheckConstraint(
            "rating >= 1 AND rating <= 5",
            name="ck_review_rating_range",
        ),
        UniqueConstraint(
            "booking_id",
            name="uq_review_booking",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_uuid
    )
    booking_id: Mapped[str] = mapped_column(
        ForeignKey("bookings.id"), nullable=False
    )
    reviewer_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    rating: Mapped[int] = mapped_column(nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


# ============================================================
# CHARGING SESSION MODEL
# One charging session per booking.
# ============================================================

class ChargingSession(Base):
    __tablename__ = "charging_sessions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_uuid
    )
    booking_id: Mapped[str] = mapped_column(
        ForeignKey("bookings.id"),
        unique=True,
        index=True,
        nullable=False,
    )
    status: Mapped[ChargingSessionStatus] = mapped_column(
        Enum(ChargingSessionStatus),
        default=ChargingSessionStatus.active,
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    energy_kwh: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 4)
    )
    agreed_price_per_kwh: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    final_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2)
    )

    booking: Mapped["Booking"] = relationship(
        back_populates="charging_session"
    )
    meter_readings: Mapped[list["MeterReading"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="MeterReading.submitted_at",
    )


# ============================================================
# METER READING MODEL
# Host-reported readings with evidence references.
# These are not independently verified telemetry.
# ============================================================

class MeterReading(Base):
    __tablename__ = "meter_readings"

    __table_args__ = (
        CheckConstraint(
            "reading_kwh >= 0",
            name="ck_meter_reading_nonnegative",
        ),
        CheckConstraint(
            "reading_type IN ('start', 'end')",
            name="ck_meter_reading_type",
        ),
        UniqueConstraint(
            "session_id",
            "reading_type",
            name="uq_meter_reading_session_type",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_uuid
    )
    session_id: Mapped[str] = mapped_column(
        ForeignKey("charging_sessions.id"),
        index=True,
        nullable=False,
    )
    reading_type: Mapped[str] = mapped_column(
        String(10), nullable=False
    )
    reading_kwh: Mapped[Decimal] = mapped_column(
        Numeric(12, 4), nullable=False
    )
    source: Mapped[str] = mapped_column(
        String(30),
        default="host_reported",
        nullable=False,
    )
    evidence_reference: Mapped[str] = mapped_column(
        String(500), nullable=False
    )
    evidence_note: Mapped[str | None] = mapped_column(Text)
    submitted_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    session: Mapped["ChargingSession"] = relationship(
        back_populates="meter_readings"
    )
