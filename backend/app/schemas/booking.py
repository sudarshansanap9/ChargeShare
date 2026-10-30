
from datetime import datetime, timezone
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.entities import BookingStatus, ChargerCategory


class BookingCreate(BaseModel):
    charger_id: str
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def validate_booking_time(self):
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("Booking times must include a timezone")

        if self.starts_at >= self.ends_at:
            raise ValueError("ends_at must be after starts_at")

        if self.starts_at <= datetime.now(timezone.utc):
            raise ValueError("Booking must start in the future")

        return self


class BookingStatusUpdate(BaseModel):
    status: BookingStatus


class BookingChargerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    location_name: str
    connector_type: str
    power_kw: Decimal
    price_per_kwh: Decimal
    charger_category: ChargerCategory
    is_active: bool


class BookingDriverSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: str


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    charger_id: str
    driver_id: str
    starts_at: datetime
    ends_at: datetime
    status: BookingStatus
    created_at: datetime

    charger: BookingChargerSummary
    driver: BookingDriverSummary
