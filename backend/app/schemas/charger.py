
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.entities import ChargerCategory


class ChargerCreate(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    location_name: str = Field(min_length=3, max_length=255)

    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    connector_type: str = Field(min_length=2, max_length=50)
    power_kw: Decimal = Field(gt=0, max_digits=6, decimal_places=2)
    price_per_kwh: Decimal = Field(
        ge=0, max_digits=10, decimal_places=2
    )
    charger_category: ChargerCategory

    @model_validator(mode="after")
    def validate_coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError(
                "Latitude and longitude must be supplied together"
            )
        return self


class ChargerUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    location_name: str | None = Field(
        default=None, min_length=3, max_length=255
    )
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    connector_type: str | None = Field(
        default=None, min_length=2, max_length=50
    )
    power_kw: Decimal | None = Field(
        default=None, gt=0, max_digits=6, decimal_places=2
    )
    price_per_kwh: Decimal | None = Field(
        default=None, ge=0, max_digits=10, decimal_places=2
    )
    charger_category: ChargerCategory | None = None

    @model_validator(mode="after")
    def validate_coordinates(self):
        fields = self.model_fields_set

        # If either coordinate is explicitly changed, both must be
        # supplied in the same request.
        if ("latitude" in fields) != ("longitude" in fields):
            raise ValueError(
                "Update latitude and longitude together"
            )

        return self


class ChargerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    host_id: str
    title: str
    description: str | None
    location_name: str
    latitude: float | None
    longitude: float | None
    connector_type: str
    power_kw: Decimal
    price_per_kwh: Decimal
    charger_category: ChargerCategory
    is_active: bool
