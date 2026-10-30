
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.api.dependencies import require_roles
from app.models.entities import (
    Booking,
    ChargingSessionStatus,
    DemoPayment,
    PaymentStatus,
    UserRole,
)


router = APIRouter(
    prefix="/api/v1/payments",
    tags=["Payments"],
)


@router.post("/bookings/{booking_id}/simulate")
def simulate_payment(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.driver)),
):
    """Complete a simulated payment for a driver's completed session."""

    # 1. Retrieve the booking and related records.
    booking = db.scalar(
        select(Booking)
        .options(
            joinedload(Booking.charging_session),
            joinedload(Booking.payment),
        )
        .where(Booking.id == booking_id)
    )

    if booking is None:
        raise HTTPException(
            status_code=404,
            detail="Booking not found",
        )

    # 2. Verify booking ownership.
    if booking.driver_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You are not authorized to pay for this booking",
        )

    # 3. Verify charging session completion.
    session = booking.charging_session

    if (
        session is None
        or session.status != ChargingSessionStatus.completed
        or session.final_amount is None
    ):
        raise HTTPException(
            status_code=409,
            detail="Payment is available only for completed charging sessions",
        )

    # 4. Prevent duplicate payment records.
    if booking.payment is not None:
        if booking.payment.status == PaymentStatus.paid:
            return {
                "payment_id": booking.payment.id,
                "booking_id": booking.id,
                "amount": str(booking.payment.amount),
                "currency": booking.payment.currency,
                "payment_status": booking.payment.status.value,
                "message": "Payment has already been completed",
            }

        raise HTTPException(
            status_code=409,
            detail="A payment record already exists for this booking",
        )

    # 5. Use the amount calculated by the backend.
    payment = DemoPayment(
        booking_id=booking.id,
        amount=session.final_amount,
        currency="INR",
        status=PaymentStatus.paid,
    )

    db.add(payment)

    try:
        db.commit()
        db.refresh(payment)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A payment record already exists for this booking",
        )

    # 6. Return simulated transaction details.
    return {
        "payment_id": payment.id,
        "booking_id": booking.id,
        "amount": str(payment.amount),
        "currency": payment.currency,
        "payment_status": payment.status.value,
        "payment_mode": "simulated",
        "message": "Simulated payment completed successfully",
    }
