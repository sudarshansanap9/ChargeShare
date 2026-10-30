
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import require_roles
from app.db.session import get_db
from app.models.entities import (
    Booking,
    Charger,
        ChargingSession,
    ChargingSessionStatus,
    DemoPayment,
    PaymentStatus,
    UserRole,
)

router = APIRouter(
    prefix="/api/v1/earnings",
    tags=["Host Earnings"],
)


def host_payment_query(current_user):
    """Return payments belonging to the logged-in host."""

    return (
        select(DemoPayment)
        .join(Booking, DemoPayment.booking_id == Booking.id)
        .join(Charger, Booking.charger_id == Charger.id)
        .where(Charger.host_id == current_user.id)
    )


@router.get("/summary")
@router.get("/summary")
def get_earnings_summary(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.host)),
):
    """Return earnings and charging activity for the host."""

    host_chargers = (
        select(Charger.id)
        .where(Charger.host_id == current_user.id)
    )

    # 1. Total earnings from successful payments only.
    paid_total = db.scalar(
        select(func.coalesce(func.sum(DemoPayment.amount), 0))
        .join(Booking, DemoPayment.booking_id == Booking.id)
        .join(Charger, Booking.charger_id == Charger.id)
        .where(
            Charger.host_id == current_user.id,
            DemoPayment.status == PaymentStatus.paid,
        )
    )

    # 2. Pending amounts from completed sessions without a payment,
    #    or sessions with a simulated payment.
    pending_total = db.scalar(
        select(
            func.coalesce(func.sum(ChargingSession.final_amount), 0)
        )
        .join(Booking, ChargingSession.booking_id == Booking.id)
        .where(
            Booking.charger_id.in_(host_chargers),
            ChargingSession.status == ChargingSessionStatus.completed,
            ChargingSession.final_amount.is_not(None),
            or_(
                ~select(DemoPayment.id)
                .where(DemoPayment.booking_id == Booking.id)
                .exists(),
                select(DemoPayment.id)
                .where(
                    DemoPayment.booking_id == Booking.id,
                    DemoPayment.status == PaymentStatus.simulated,
                )
                .exists(),
            ),
        )
    )

    # 3. Count successful transactions.
    paid_count = db.scalar(
        select(func.count(DemoPayment.id))
        .join(Booking, DemoPayment.booking_id == Booking.id)
        .join(Charger, Booking.charger_id == Charger.id)
        .where(
            Charger.host_id == current_user.id,
            DemoPayment.status == PaymentStatus.paid,
        )
    )

    # 4. Count pending completed charging sessions.
    pending_count = db.scalar(
        select(func.count(ChargingSession.id))
        .join(Booking, ChargingSession.booking_id == Booking.id)
        .where(
            Booking.charger_id.in_(host_chargers),
            ChargingSession.status == ChargingSessionStatus.completed,
            ChargingSession.final_amount.is_not(None),
            or_(
                ~select(DemoPayment.id)
                .where(DemoPayment.booking_id == Booking.id)
                .exists(),
                select(DemoPayment.id)
                .where(
                    DemoPayment.booking_id == Booking.id,
                    DemoPayment.status == PaymentStatus.simulated,
                )
                .exists(),
            ),
        )
    )

    # 5. Count completed sessions belonging to this host.
    completed_sessions = db.scalar(
        select(func.count(ChargingSession.id))
        .join(Booking, ChargingSession.booking_id == Booking.id)
        .where(
            Booking.charger_id.in_(host_chargers),
            ChargingSession.status == ChargingSessionStatus.completed,
        )
    )

    return {
        "currency": "INR",
        "total_earnings": str(paid_total or 0),
        "pending_payments": str(pending_total or 0),
        "paid_transactions": paid_count or 0,
        "pending_transactions": pending_count or 0,
        "completed_sessions": completed_sessions or 0,
    }

@router.get("/monthly")
def get_monthly_earnings(
    months: int = Query(default=12, ge=1, le=24),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.host)),
):
    """Return monthly paid earnings for the host."""

    now = datetime.now(timezone.utc)
    start_month = now.month - months + 1
    year = now.year + (start_month - 1) // 12
    month = (start_month - 1) % 12 + 1

    start_date = datetime(year, month, 1, tzinfo=timezone.utc)

    rows = db.execute(
        select(
            func.strftime("%Y-%m", DemoPayment.created_at).label("month"),
            func.sum(DemoPayment.amount).label("earnings"),
        )
        .join(Booking, DemoPayment.booking_id == Booking.id)
        .join(Charger, Booking.charger_id == Charger.id)
        .where(
            Charger.host_id == current_user.id,
            DemoPayment.status == PaymentStatus.paid,
            DemoPayment.created_at >= start_date,
        )
        .group_by("month")
        .order_by("month")
    ).all()

    return [
        {
            "month": row.month,
            "earnings": str(row.earnings or 0),
            "currency": "INR",
        }
        for row in rows
    ]


@router.get("/transactions")
def get_earnings_transactions(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.host)),
):
    """Return the host's payment transaction history."""

    rows = db.execute(
        select(DemoPayment, Booking, Charger)
        .join(Booking, DemoPayment.booking_id == Booking.id)
        .join(Charger, Booking.charger_id == Charger.id)
        .where(Charger.host_id == current_user.id)
        .order_by(DemoPayment.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return [
        {
            "transaction_id": payment.id,
            "booking_id": booking.id,
            "charger_id": charger.id,
            "charger_name": charger.title,
            "location": charger.location_name,
            "amount": str(payment.amount),
            "currency": payment.currency,
            "payment_status": payment.status.value,
            "created_at": payment.created_at,
        }
        for payment, booking, charger in rows
    ]
