
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload


from app.db.session import get_db
from app.models.entities import (
    Booking,
    BookingStatus,
    Charger,
    ChargingSession,
    ChargingSessionStatus,
    DemoPayment,
    PaymentStatus,
    UserRole,
)
from app.schemas.charging_session import (
    ChargingSessionResponse,
    ChargingSessionStart,
)
from app.api.dependencies import get_current_user, require_roles
from app.models.entities import MeterReading
from app.schemas.charging_session import MeterReadingCreate
from decimal import Decimal, ROUND_HALF_UP





router = APIRouter(
    prefix="/api/v1/charging-sessions",
    tags=["Charging Sessions"],
)

@router.get("/my")
def get_my_charging_sessions(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.driver)),
):
    """Return charging-session history for the logged-in driver."""

    sessions = db.scalars(
    select(ChargingSession)
    .join(Booking, ChargingSession.booking_id == Booking.id)
    .options(
        joinedload(ChargingSession.booking)
        .joinedload(Booking.charger),
        joinedload(ChargingSession.booking)
        .joinedload(Booking.payment),
    )
    .where(Booking.driver_id == current_user.id)
    .order_by(ChargingSession.started_at.desc())
).unique().all()
    results = []

    for session in sessions:
        booking = session.booking
        charger = booking.charger

        results.append({
            "session_id": session.id,
            "booking_id": booking.id,
            "status": session.status.value,
            "started_at": session.started_at,
            "ended_at": session.ended_at,
            "energy_kwh": session.energy_kwh,
            "price_per_kwh_inr": session.agreed_price_per_kwh,
            "final_amount_inr": session.final_amount,
            "payment_status": (
    booking.payment.status.value
    if booking.payment
    else "pending"
),
"payment_id": (
    booking.payment.id
    if booking.payment
    else None
),
"payment_amount": (
    str(booking.payment.amount)
    if booking.payment
    else None
),
            "measurement_notice": (
                "Meter readings are host-reported "
                "and not independently verified."
            ),
            "charger": {
                "id": charger.id,
                "title": charger.title,
                "location_name": charger.location_name,
                "connector_type": charger.connector_type,
                "power_kw": charger.power_kw,
            },
        })

    return results


@router.get("/host")
def get_host_charging_sessions(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.host)),
):
    """Return charging sessions for the logged-in host's bookings."""

    sessions = db.scalars(
        select(ChargingSession)
        .join(Booking, ChargingSession.booking_id == Booking.id)
        .join(Charger, Booking.charger_id == Charger.id)
        .options(
    joinedload(ChargingSession.booking)
    .joinedload(Booking.charger),
    joinedload(ChargingSession.booking)
    .joinedload(Booking.driver),
    joinedload(ChargingSession.booking)
    .joinedload(Booking.payment),
    joinedload(ChargingSession.meter_readings),
)
        .where(Charger.host_id == current_user.id)
        .order_by(ChargingSession.started_at.desc())
    ).unique().all()

    results = []

    for session in sessions:
        booking = session.booking
        charger = booking.charger
        readings_by_type = {
            reading.reading_type: reading
            for reading in session.meter_readings
        }

        def serialize_reading(reading_type: str):
            reading = readings_by_type.get(reading_type)
            if reading is None:
                return None

            return {
                "reading_type": reading.reading_type,
                "reading_kwh": reading.reading_kwh,
                "evidence_reference": reading.evidence_reference,
                "evidence_note": reading.evidence_note,
                "submitted_at": reading.submitted_at,
            }

        results.append({
            "id": session.id,
            "booking_id": session.booking_id,
            "status": session.status.value,
            "started_at": session.started_at,
            "ended_at": session.ended_at,
            "energy_kwh": session.energy_kwh,
            "agreed_price_per_kwh": session.agreed_price_per_kwh,
            "final_amount": session.final_amount,
"payment_status": (
    booking.payment.status.value
    if booking.payment
    else "pending"
),
"payment_id": (
    booking.payment.id
    if booking.payment
    else None
),
"payment_amount": (
    str(booking.payment.amount)
    if booking.payment
    else None
),
"charger_id": charger.id,
            "driver_id": booking.driver_id,
            "meter_readings": {
                "start": serialize_reading("start"),
                "end": serialize_reading("end"),
            },
        })

    return results




@router.post(
    "/start",
    response_model=ChargingSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_charging_session(
    payload: ChargingSessionStart,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.host)),
):
    # 1. Find the booking.
    booking = db.scalar(
        select(Booking).where(Booking.id == payload.booking_id)
    )

    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    # 2. Only approved bookings can start a charging session.
    if booking.status != BookingStatus.approved:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved bookings can start a charging session",
        )

    # 3. Find the charger associated with the booking.
    charger = db.scalar(
        select(Charger).where(Charger.id == booking.charger_id)
    )

    if charger is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Charger associated with booking was not found",
        )

    # 4. Verify that the logged-in host owns this charger.
    if charger.host_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only start sessions for your own chargers",
        )

    # 5. Prevent duplicate sessions for the same booking.
    existing_session = db.scalar(
        select(ChargingSession).where(
            ChargingSession.booking_id == booking.id
        )
    )

    if existing_session is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A charging session already exists for this booking",
        )

    # 6. Capture the agreed price from the database.
    session = ChargingSession(
        booking_id=booking.id,
        status=ChargingSessionStatus.active,
        agreed_price_per_kwh=charger.price_per_kwh,
    )

    db.add(session)

    try:
        db.commit()
        db.refresh(session)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A session may already exist for this booking",
        )

    return session


@router.post("/{session_id}/meter-readings", status_code=201)
def submit_meter_reading(
    session_id: str,
    payload: MeterReadingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.host)),
):
    # Find the charging session.
    session = db.scalar(
    select(ChargingSession)
    .where(ChargingSession.id == session_id)
    .with_for_update()
)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Charging session not found",
        )

    # Load the booking and charger to verify host ownership.
    booking = db.get(Booking, session.booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    charger = db.get(Charger, booking.charger_id)
    if charger is None:
        raise HTTPException(status_code=404, detail="Charger not found")

    if charger.host_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only submit readings for your own chargers",
        )

    if session.status != ChargingSessionStatus.active:
        raise HTTPException(
            status_code=409,
            detail="Readings can only be submitted for an active session",
        )

    # Load existing readings for this session.
    readings = db.scalars(
        select(MeterReading).where(
            MeterReading.session_id == session.id
        )
    ).all()

    existing_by_type = {r.reading_type: r for r in readings}

    if payload.reading_type in existing_by_type:
        raise HTTPException(
            status_code=409,
            detail=f"A {payload.reading_type} reading already exists",
        )

    # An end reading requires a start reading.
    if payload.reading_type == "end":
        start_reading = existing_by_type.get("start")

        if start_reading is None:
            raise HTTPException(
                status_code=409,
                detail="Submit the start reading before the end reading",
            )

        if payload.reading_kwh < start_reading.reading_kwh:
            raise HTTPException(
                status_code=422,
                detail="End meter reading cannot be lower than start reading",
            )

    reading = MeterReading(
        session_id=session.id,
        reading_type=payload.reading_type,
        reading_kwh=payload.reading_kwh,
        source="host_reported",
        evidence_reference=payload.evidence_reference,
        evidence_note=payload.evidence_note,
        submitted_by=current_user.id,
    )

    db.add(reading)

    if payload.reading_type == "end":
        session.status = ChargingSessionStatus.evidence_submitted

    try:
        db.commit()
        db.refresh(reading)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A reading of this type already exists for this session",
        )

    return {
        "id": reading.id,
        "session_id": reading.session_id,
        "reading_type": reading.reading_type,
        "reading_kwh": reading.reading_kwh,
        "source": reading.source,
        "evidence_reference": reading.evidence_reference,
        "evidence_note": reading.evidence_note,
        "submitted_by": reading.submitted_by,
        "submitted_at": reading.submitted_at,
        "session_status": session.status,
        "measurement_notice": (
            "Host-reported reading; not independently verified."
        ),
    }

@router.post("/{session_id}/complete")
def complete_charging_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(UserRole.host)),
):
    # 1. Find the session.
    session = db.scalar(
        select(ChargingSession)
        .where(ChargingSession.id == session_id)
        .with_for_update()
    )

    if session is None:
        raise HTTPException(
            status_code=404,
            detail="Charging session not found",
        )

    # 2. Verify booking and charger ownership.
    booking = db.get(Booking, session.booking_id)

    if booking is None:
        raise HTTPException(
            status_code=404,
            detail="Booking not found",
        )

    charger = db.get(Charger, booking.charger_id)

    if charger is None:
        raise HTTPException(
            status_code=404,
            detail="Charger not found",
        )

    if charger.host_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only complete sessions for your own chargers",
        )

    # 3. Prevent repeated completion or billing.
    if session.status == ChargingSessionStatus.completed:
        raise HTTPException(
            status_code=409,
            detail="This session has already been completed",
        )

    if session.status != ChargingSessionStatus.evidence_submitted:
        raise HTTPException(
            status_code=409,
            detail="Submit both meter readings before completing the session",
        )

    # 4. Retrieve meter readings.
    readings = db.scalars(
        select(MeterReading).where(
            MeterReading.session_id == session.id
        )
    ).all()

    readings_by_type = {
        reading.reading_type: reading for reading in readings
    }

    start_reading = readings_by_type.get("start")
    end_reading = readings_by_type.get("end")

    if start_reading is None or end_reading is None:
        raise HTTPException(
            status_code=409,
            detail="Both start and end meter readings are required",
        )

    # 5. Validate consumption.
    energy_consumed = (
        end_reading.reading_kwh - start_reading.reading_kwh
    )

    if energy_consumed < 0:
        raise HTTPException(
            status_code=422,
            detail="End reading cannot be lower than start reading",
        )

    # 6. Calculate the final amount on the server.
    rate = Decimal(str(session.agreed_price_per_kwh))

    final_amount = (energy_consumed * rate).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    # 7. Complete the session.
    session.energy_kwh = energy_consumed
    session.final_amount = final_amount
    session.ended_at = end_reading.submitted_at
    session.status = ChargingSessionStatus.completed

    # Keep the booking lifecycle consistent.
    booking.status = BookingStatus.completed

    try:
        db.commit()
        db.refresh(session)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The session could not be completed due to a database conflict",
        )

    return {
        "session_id": session.id,
        "booking_id": session.booking_id,
        "status": session.status.value,
        "measurement_source": "host_reported",
        "measurement_notice": (
            "Host-reported meter readings; not independently verified."
        ),
        "start_reading_kwh": str(start_reading.reading_kwh),
        "end_reading_kwh": str(end_reading.reading_kwh),
        "energy_consumed_kwh": str(energy_consumed),
        "price_per_kwh_inr": str(rate),
        "final_amount_inr": str(final_amount),
        "payment_status": "pending_simulated_payment",
    }