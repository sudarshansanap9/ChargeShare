
from decimal import Decimal

import pytest


BASE_AUTH = "/api/v1/auth"
BASE_CHARGERS = "/api/v1/chargers"
BASE_BOOKINGS = "/api/v1/bookings"
BASE_SESSIONS = "/api/v1/charging-sessions"


def register_user(client, email, role):
    response = client.post(
        f"{BASE_AUTH}/register",
        json={
            "full_name": "Test User",
            "email": email,
            "password": "TestPassword123",
            "role": role,
        },
    )
    assert response.status_code == 201
    return response.json()


def get_token(client, email):
    response = client.post(
        f"{BASE_AUTH}/login",
        data={
            "username": email,
            "password": "TestPassword123",
        },
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def create_charger(client, host_token):
    response = client.post(
        BASE_CHARGERS,
        json={
            "title": "Session Test Charger",
            "description": "Automated session testing",
            "location_name": "Nashik",
            "latitude": 19.9975,
            "longitude": 73.7898,
            "connector_type": "Type 2",
            "power_kw": 7.40,
            "price_per_kwh": 12.50,
            "charger_category": "home",
        },
        headers=auth_headers(host_token),
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_booking(client, charger_id, driver_token, host_token):
    from datetime import datetime, timedelta, timezone

    start = datetime.now(timezone.utc) + timedelta(days=1)

    booking_response = client.post(
        BASE_BOOKINGS,
        json={
            "charger_id": charger_id,
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=2)).isoformat(),
        },
        headers=auth_headers(driver_token),
    )
    assert booking_response.status_code == 201

    booking_id = booking_response.json()["id"]

    approval_response = client.patch(
        f"{BASE_BOOKINGS}/{booking_id}/decision",
        params={"decision": "approve"},
        headers=auth_headers(host_token),
    )
    assert approval_response.status_code == 200

    return booking_id


def prepare_session(client):
    register_user(client, "host@example.com", "host")
    register_user(client, "driver@example.com", "driver")

    host_token = get_token(client, "host@example.com")
    driver_token = get_token(client, "driver@example.com")

    charger_id = create_charger(client, host_token)
    booking_id = create_booking(
        client, charger_id, driver_token, host_token
    )

    return host_token, driver_token, charger_id, booking_id


def start_session(client, booking_id, host_token):
    return client.post(
        f"{BASE_SESSIONS}/start",
        json={"booking_id": booking_id},
        headers=auth_headers(host_token),
    )


def submit_reading(client, session_id, host_token, reading_type, value):
    return client.post(
        f"{BASE_SESSIONS}/{session_id}/meter-readings",
        json={
            "reading_type": reading_type,
            "reading_kwh": value,
            "evidence_reference": f"test-{reading_type}-meter-image",
            "evidence_note": f"Automated {reading_type} reading",
        },
        headers=auth_headers(host_token),
    )


def test_host_can_start_approved_charging_session(client):
    host_token, _, _, booking_id = prepare_session(client)

    response = start_session(client, booking_id, host_token)

    assert response.status_code == 201
    assert response.json()["booking_id"] == booking_id
    assert response.json()["status"] == "active"


def test_driver_cannot_start_charging_session(client):
    host_token, driver_token, _, booking_id = prepare_session(client)

    approval = start_session(client, booking_id, driver_token)

    assert approval.status_code == 403


def test_another_host_cannot_start_session(client):
    host_token, _, _, booking_id = prepare_session(client)

    register_user(client, "anotherhost@example.com", "host")
    another_host_token = get_token(client, "anotherhost@example.com")

    response = start_session(client, booking_id, another_host_token)

    assert response.status_code == 403


def test_unapproved_booking_cannot_start_session(client):
    register_user(client, "host@example.com", "host")
    register_user(client, "driver@example.com", "driver")

    host_token = get_token(client, "host@example.com")
    driver_token = get_token(client, "driver@example.com")
    charger_id = create_charger(client, host_token)

    from datetime import datetime, timedelta, timezone

    start = datetime.now(timezone.utc) + timedelta(days=1)

    booking = client.post(
        BASE_BOOKINGS,
        json={
            "charger_id": charger_id,
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=2)).isoformat(),
        },
        headers=auth_headers(driver_token),
    )
    assert booking.status_code == 201

    response = start_session(
        client, booking.json()["id"], host_token
    )

    assert response.status_code == 409


def test_duplicate_charging_session_is_rejected(client):
    host_token, _, _, booking_id = prepare_session(client)

    first = start_session(client, booking_id, host_token)
    assert first.status_code == 201

    second = start_session(client, booking_id, host_token)

    assert second.status_code == 409


def test_host_can_submit_start_and_end_meter_readings(client):
    host_token, _, _, booking_id = prepare_session(client)

    session = start_session(client, booking_id, host_token)
    session_id = session.json()["id"]

    start_response = submit_reading(
        client, session_id, host_token, "start", "100.0000"
    )
    assert start_response.status_code == 201
    assert start_response.json()["reading_type"] == "start"

    end_response = submit_reading(
        client, session_id, host_token, "end", "105.5000"
    )
    assert end_response.status_code == 201
    assert end_response.json()["reading_type"] == "end"
    assert end_response.json()["session_status"] == "evidence_submitted"


def test_end_reading_requires_start_reading(client):
    host_token, _, _, booking_id = prepare_session(client)

    session = start_session(client, booking_id, host_token)
    session_id = session.json()["id"]

    response = submit_reading(
        client, session_id, host_token, "end", "105.0000"
    )

    assert response.status_code == 409


def test_end_reading_cannot_be_lower_than_start_reading(client):
    host_token, _, _, booking_id = prepare_session(client)

    session = start_session(client, booking_id, host_token)
    session_id = session.json()["id"]

    start_response = submit_reading(
        client, session_id, host_token, "start", "100.0000"
    )
    assert start_response.status_code == 201

    end_response = submit_reading(
        client, session_id, host_token, "end", "95.0000"
    )

    assert end_response.status_code == 422


def test_session_completion_calculates_energy_and_amount(client):
    host_token, _, _, booking_id = prepare_session(client)

    session = start_session(client, booking_id, host_token)
    session_id = session.json()["id"]

    start_response = submit_reading(
        client, session_id, host_token, "start", "100.0000"
    )
    assert start_response.status_code == 201

    end_response = submit_reading(
        client, session_id, host_token, "end", "105.5000"
    )
    assert end_response.status_code == 201

    response = client.post(
        f"{BASE_SESSIONS}/{session_id}/complete",
        headers=auth_headers(host_token),
    )

    assert response.status_code == 200

    result = response.json()

    assert result["status"] == "completed"
    assert Decimal(result["energy_consumed_kwh"]) == Decimal("5.5")
    assert Decimal(result["price_per_kwh_inr"]) == Decimal("12.50")
    assert Decimal(result["final_amount_inr"]) == Decimal("68.75")
    assert result["payment_status"] == "pending_simulated_payment"


def test_session_cannot_be_completed_before_both_readings(client):
    host_token, _, _, booking_id = prepare_session(client)

    session = start_session(client, booking_id, host_token)
    session_id = session.json()["id"]

    response = client.post(
        f"{BASE_SESSIONS}/{session_id}/complete",
        headers=auth_headers(host_token),
    )

    assert response.status_code == 409
