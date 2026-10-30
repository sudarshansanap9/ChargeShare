
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.entities import (
    Booking,
    BookingStatus,
    Charger,
    User,
    UserRole,
)
from app.schemas.booking import BookingCreate, BookingResponse
from app.api.dependencies import get_current_user, require_roles


router = APIRouter(prefix="/api/v1/bookings", tags=["bookings"])


@router.post(
    "",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_booking(
    data: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.driver)),
):
    charger = db.scalar(
        select(Charger).where(
            Charger.id == data.charger_id,
            Charger.is_active.is_(True),
        )
    )

    if charger is None:
        raise HTTPException(
            status_code=404,
            detail="Active charger not found",
        )

    if charger.host_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot book your own charger",
        )

    # Pending and approved bookings block the same time slot.
    overlap = db.scalar(
        select(Booking.id)
        .where(
            Booking.charger_id == data.charger_id,
            Booking.status.in_(
                [
                    BookingStatus.pending,
                    BookingStatus.approved,
                ]
            ),
            Booking.starts_at < data.ends_at,
            Booking.ends_at > data.starts_at,
        )
        .limit(1)
    )

    if overlap is not None:
        raise HTTPException(
            status_code=409,
            detail="This charger already has a booking during that time",
        )

    booking = Booking(
        charger_id=data.charger_id,
        driver_id=current_user.id,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        status=BookingStatus.pending,
    )

    db.add(booking)
    db.commit()

    # Reload the booking with its related charger and driver.
    booking = db.scalar(
        select(Booking)
        .options(
            joinedload(Booking.charger),
            joinedload(Booking.driver),
        )
        .where(Booking.id == booking.id)
    )

    return booking


@router.get("/my", response_model=list[BookingResponse])
def get_my_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bookings = db.scalars(
        select(Booking)
        .options(
            joinedload(Booking.charger),
            joinedload(Booking.driver),
        )
        .where(Booking.driver_id == current_user.id)
        .order_by(Booking.created_at.desc())
    ).all()

    return list(bookings)


@router.get("/host", response_model=list[BookingResponse])
def get_host_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.host)),
):
    bookings = db.scalars(
        select(Booking)
        .options(
            joinedload(Booking.charger),
            joinedload(Booking.driver),
        )
        .join(Charger, Booking.charger_id == Charger.id)
        .where(Charger.host_id == current_user.id)
        .order_by(Booking.created_at.desc())
    ).all()

    return list(bookings)


@router.patch(
    "/{booking_id}/decision",
    response_model=BookingResponse,
)
def decide_booking(
    booking_id: str,
    decision: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.host)),
):
    if decision not in {"approve", "reject"}:
        raise HTTPException(
            status_code=422,
            detail="Decision must be 'approve' or 'reject'",
        )

    booking = db.scalar(
        select(Booking)
        .join(Charger, Booking.charger_id == Charger.id)
        .where(
            Booking.id == booking_id,
            Charger.host_id == current_user.id,
        )
    )

    if booking is None:
        raise HTTPException(
            status_code=404,
            detail="Booking not found for your chargers",
        )

    if booking.status != BookingStatus.pending:
        raise HTTPException(
            status_code=409,
            detail="Only pending bookings can be approved or rejected",
        )

    if decision == "approve":
        # Recheck availability before approving.
        overlap = db.scalar(
            select(Booking.id)
            .where(
                Booking.charger_id == booking.charger_id,
                Booking.id != booking.id,
                Booking.status == BookingStatus.approved,
                Booking.starts_at < booking.ends_at,
                Booking.ends_at > booking.starts_at,
            )
            .limit(1)
        )

        if overlap is not None:
            raise HTTPException(
                status_code=409,
                detail="Another booking has already been approved for this time",
            )

        booking.status = BookingStatus.approved
    else:
        booking.status = BookingStatus.rejected

    db.commit()

    # Reload with related data for BookingResponse.
    booking = db.scalar(
        select(Booking)
        .options(
            joinedload(Booking.charger),
            joinedload(Booking.driver),
        )
        .where(Booking.id == booking_id)
    )

    return booking


@router.patch(
    "/{booking_id}/cancel",
    response_model=BookingResponse,
)
def cancel_booking(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.driver)),
):
    booking = db.scalar(
        select(Booking).where(
            Booking.id == booking_id,
            Booking.driver_id == current_user.id,
        )
    )

    if booking is None:
        raise HTTPException(
            status_code=404,
            detail="Booking not found",
        )

    if booking.status not in {
        BookingStatus.pending,
        BookingStatus.approved,
    }:
        raise HTTPException(
            status_code=409,
            detail="Only pending or approved bookings can be cancelled",
        )

    booking.status = BookingStatus.cancelled
    db.commit()

    # Reload with related data for BookingResponse.
    booking = db.scalar(
        select(Booking)
        .options(
            joinedload(Booking.charger),
            joinedload(Booking.driver),
        )
        .where(Booking.id == booking_id)
    )

    return booking
