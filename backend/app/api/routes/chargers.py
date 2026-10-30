
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.entities import Charger, ChargerCategory, User, UserRole
from app.schemas.charger import (
    ChargerCreate,
    ChargerResponse,
    ChargerUpdate,
)

router = APIRouter(prefix="/api/v1/chargers", tags=["chargers"])


@router.post(
    "",
    response_model=ChargerResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_charger(
    data: ChargerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.host)),
):
    charger = Charger(
        **data.model_dump(),
        host_id=current_user.id,
    )

    db.add(charger)
    db.commit()
    db.refresh(charger)

    return charger


@router.get("", response_model=list[ChargerResponse])
def list_chargers(
    category: ChargerCategory | None = None,
    connector_type: str | None = Query(default=None, min_length=2),
    location: str | None = Query(default=None, min_length=2),
    max_price: Decimal | None = Query(default=None, ge=0),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    statement = select(Charger).where(Charger.is_active.is_(True))

    if category is not None:
        statement = statement.where(
            Charger.charger_category == category
        )

    if connector_type:
        statement = statement.where(
            Charger.connector_type.ilike(
                f"%{connector_type.strip()}%"
            )
        )

    if location:
        statement = statement.where(
            Charger.location_name.ilike(f"%{location.strip()}%")
        )

    if max_price is not None:
        statement = statement.where(
            Charger.price_per_kwh <= max_price
        )

    statement = (
        statement
        .order_by(Charger.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    return db.scalars(statement).all()

@router.get("/mine", response_model=list[ChargerResponse])
def list_my_chargers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.host)),
):
    statement = (
        select(Charger)
        .where(Charger.host_id == current_user.id)
        .order_by(Charger.created_at.desc())
    )

    return db.scalars(statement).all()


@router.get("/{charger_id}", response_model=ChargerResponse)
def get_charger(
    charger_id: str,
    db: Session = Depends(get_db),
):
    charger = db.scalar(
        select(Charger).where(
            Charger.id == charger_id,
            Charger.is_active.is_(True),
        )
    )

    if charger is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Charger not found",
        )

    return charger


@router.patch("/{charger_id}", response_model=ChargerResponse)
def update_charger(
    charger_id: str,
    data: ChargerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.host)),
):
    charger = db.get(Charger, charger_id)

    if charger is None or not charger.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Charger not found",
        )

    if charger.host_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own chargers",
        )

    changes = data.model_dump(exclude_unset=True)

    # A field explicitly set to null must not erase required values.
    nullable_fields = {"description", "latitude", "longitude"}
    for field, value in changes.items():
        if value is None and field not in nullable_fields:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be null",
            )

    for field, value in changes.items():
        setattr(charger, field, value)

    db.commit()
    db.refresh(charger)

    return charger


@router.delete(
    "/{charger_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def deactivate_charger(
    charger_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.host)),
):
    charger = db.get(Charger, charger_id)

    if charger is None or not charger.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Charger not found",
        )

    if charger.host_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only deactivate your own chargers",
        )

    charger.is_active = False
    db.commit()

    return None
