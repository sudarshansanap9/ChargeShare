
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import ChargingSessionStatus


class ChargingSessionStart(BaseModel):
    booking_id: str = Field(min_length=1)


class ChargingSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    booking_id: str
    status: ChargingSessionStatus
    started_at: datetime
    ended_at: datetime | None
    energy_kwh: Decimal | None
    agreed_price_per_kwh: Decimal
    final_amount: Decimal | None

from decimal import Decimal
from pydantic import BaseModel, Field



from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class MeterReadingCreate(BaseModel):
    reading_type: str = Field(pattern="^(start|end)$")
    reading_kwh: Decimal = Field(
        ge=0,
        max_digits=12,
        decimal_places=4,
    )
    evidence_reference: str = Field(min_length=1, max_length=500)
    evidence_note: str | None = Field(
        default=None,
        max_length=2000,
    )

    @field_validator("evidence_reference")
    @classmethod
    def validate_evidence_reference(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Evidence reference cannot be empty")

        return value

    @field_validator("evidence_note")
    @classmethod
    def clean_evidence_note(cls, value: str | None) -> str | None:
        if value is None:
            return None

        value = value.strip()
        return value or None
