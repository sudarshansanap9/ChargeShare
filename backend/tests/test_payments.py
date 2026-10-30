
from decimal import Decimal

import pytest

from app.models.entities import DemoPayment, PaymentStatus

from tests.test_charging_sessions import (
    auth_headers,
    get_token,
    prepare_session,
    start_session,
    submit_reading,
)


BASE_SESSIONS = "/api/v1/charging-sessions"
BASE_PAYMENTS = "/api/v1/payments"


def complete_session(client, booking_id, host_token):
    """Create a completed charging session for payment tests."""

    session_response = start_session(client, booking_id, host_token)
    assert session_response.status_code == 201

    session_id = session_response.json()["id"]

    start_response = submit_reading(
        client, session_id, host_token, "start", "100.0000"
    )
    assert start_response.status_code == 201

    end_response = submit_reading(
        client, session_id, host_token, "end", "105.5000"
    )
    assert end_response.status_code == 201

    completion_response = client.post(
        f"{BASE_SESSIONS}/{session_id}/complete",
        headers=auth_headers(host_token),
    )
    assert completion_response.status_code == 200

    return session_id


def payment_url(booking_id):
    return f"{BASE_PAYMENTS}/bookings/{booking_id}/simulate"


def test_driver_can_complete_simulated_payment(client):
    host_token, driver_token, _, booking_id = prepare_session(client)

    complete_session(client, booking_id, host_token)

    response = client.post(
        payment_url(booking_id),
        headers=auth_headers(driver_token),
    )

    assert response.status_code == 200

    result = response.json()

    assert result["booking_id"] == booking_id
    assert Decimal(result["amount"]) == Decimal("68.75")
    assert result["currency"] == "INR"
    assert result["payment_status"] == "paid"
    assert result["payment_mode"] == "simulated"
    assert result["payment_id"]


def test_payment_is_rejected_for_nonexistent_booking(client):
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Test Driver",
            "email": "driver@example.com",
            "password": "TestPassword123",
            "role": "driver",
        },
    )
    assert register_response.status_code == 201

    driver_token = get_token(client, "driver@example.com")

    response = client.post(
        payment_url("nonexistent-booking-id"),
        headers=auth_headers(driver_token),
    )

    assert response.status_code == 404


def test_another_driver_cannot_pay_for_booking(client):
    host_token, _, _, booking_id = prepare_session(client)

    complete_session(client, booking_id, host_token)

    from app.models.entities import UserRole

    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Another Driver",
            "email": "anotherdriver@example.com",
            "password": "TestPassword123",
            "role": UserRole.driver.value,
        },
    )
    assert register_response.status_code == 201

    another_driver_token = get_token(
        client, "anotherdriver@example.com"
    )

    response = client.post(
        payment_url(booking_id),
        headers=auth_headers(another_driver_token),
    )

    assert response.status_code == 403


def test_payment_is_rejected_before_session_completion(client):
    host_token, driver_token, _, booking_id = prepare_session(client)

    start_session(client, booking_id, host_token)

    response = client.post(
        payment_url(booking_id),
        headers=auth_headers(driver_token),
    )

    assert response.status_code == 409


def test_duplicate_payment_does_not_create_another_transaction(client):
    host_token, driver_token, _, booking_id = prepare_session(client)

    complete_session(client, booking_id, host_token)

    first_response = client.post(
        payment_url(booking_id),
        headers=auth_headers(driver_token),
    )
    assert first_response.status_code == 200

    first_result = first_response.json()

    second_response = client.post(
        payment_url(booking_id),
        headers=auth_headers(driver_token),
    )
    assert second_response.status_code == 200

    second_result = second_response.json()

    assert second_result["payment_id"] == first_result["payment_id"]
    assert second_result["payment_status"] == "paid"
    assert second_result["message"] == "Payment has already been completed"

    payments = client.get(
        "/api/v1/charging-sessions/my",
        headers=auth_headers(driver_token),
    )

    assert payments.status_code == 200

    matching_sessions = [
        item for item in payments.json()
        if item["booking_id"] == booking_id
    ]

    assert len(matching_sessions) == 1
    assert matching_sessions[0]["payment_status"] == "paid"
    assert matching_sessions[0]["payment_id"] == first_result["payment_id"]


def test_payment_requires_driver_authentication(client):
    response = client.post(
        payment_url("some-booking-id")
    )

    assert response.status_code == 401
