
from datetime import datetime, timedelta, timezone


BASE_AUTH = "/api/v1/auth"
BASE_CHARGERS = "/api/v1/chargers"
BASE_BOOKINGS = "/api/v1/bookings"


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
            "title": "Booking Test Charger",
            "description": "Test charger",
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


def booking_payload(charger_id, start_offset=1):
    start = datetime.now(timezone.utc) + timedelta(days=start_offset)

    return {
        "charger_id": charger_id,
        "starts_at": start.isoformat(),
        "ends_at": (start + timedelta(hours=2)).isoformat(),
    }


def create_booking(client, charger_id, driver_token):
    return client.post(
        BASE_BOOKINGS,
        json=booking_payload(charger_id),
        headers=auth_headers(driver_token),
    )


def test_driver_can_create_booking(client):
    register_user(client, "host@example.com", "host")
    register_user(client, "driver@example.com", "driver")

    host_token = get_token(client, "host@example.com")
    driver_token = get_token(client, "driver@example.com")

    charger_id = create_charger(client, host_token)

    response = create_booking(client, charger_id, driver_token)

    assert response.status_code == 201
    assert response.json()["status"] == "pending"
    assert response.json()["charger_id"] == charger_id


def test_host_cannot_create_booking(client):
    register_user(client, "host@example.com", "host")
    host_token = get_token(client, "host@example.com")

    response = client.post(
        BASE_BOOKINGS,
        json=booking_payload("nonexistent-charger"),
        headers=auth_headers(host_token),
    )

    assert response.status_code == 403


def test_unauthenticated_user_cannot_create_booking(client):
    response = client.post(
        BASE_BOOKINGS,
        json=booking_payload("nonexistent-charger"),
    )

    assert response.status_code == 401


def test_driver_cannot_book_own_charger(client):
    register_user(client, "host@example.com", "host")
    host_token = get_token(client, "host@example.com")

    charger_id = create_charger(client, host_token)

    response = create_booking(client, charger_id, host_token)

    assert response.status_code == 403


def test_overlapping_booking_is_rejected(client):
    register_user(client, "host@example.com", "host")
    register_user(client, "driver1@example.com", "driver")
    register_user(client, "driver2@example.com", "driver")

    host_token = get_token(client, "host@example.com")
    driver1_token = get_token(client, "driver1@example.com")
    driver2_token = get_token(client, "driver2@example.com")

    charger_id = create_charger(client, host_token)

    payload = booking_payload(charger_id)

    first = client.post(
        BASE_BOOKINGS,
        json=payload,
        headers=auth_headers(driver1_token),
    )

    assert first.status_code == 201

    second = client.post(
        BASE_BOOKINGS,
        json=payload,
        headers=auth_headers(driver2_token),
    )

    assert second.status_code == 409


def test_host_can_approve_booking(client):
    register_user(client, "host@example.com", "host")
    register_user(client, "driver@example.com", "driver")

    host_token = get_token(client, "host@example.com")
    driver_token = get_token(client, "driver@example.com")

    charger_id = create_charger(client, host_token)

    booking = create_booking(client, charger_id, driver_token)
    booking_id = booking.json()["id"]

    response = client.patch(
        f"{BASE_BOOKINGS}/{booking_id}/decision",
        params={"decision": "approve"},
        headers=auth_headers(host_token),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "approved"


def test_host_can_reject_booking(client):
    register_user(client, "host@example.com", "host")
    register_user(client, "driver@example.com", "driver")

    host_token = get_token(client, "host@example.com")
    driver_token = get_token(client, "driver@example.com")

    charger_id = create_charger(client, host_token)

    booking = create_booking(client, charger_id, driver_token)
    booking_id = booking.json()["id"]

    response = client.patch(
        f"{BASE_BOOKINGS}/{booking_id}/decision",
        params={"decision": "reject"},
        headers=auth_headers(host_token),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"


def test_driver_can_cancel_own_booking(client):
    register_user(client, "host@example.com", "host")
    register_user(client, "driver@example.com", "driver")

    host_token = get_token(client, "host@example.com")
    driver_token = get_token(client, "driver@example.com")

    charger_id = create_charger(client, host_token)

    booking = create_booking(client, charger_id, driver_token)
    booking_id = booking.json()["id"]

    response = client.patch(
        f"{BASE_BOOKINGS}/{booking_id}/cancel",
        headers=auth_headers(driver_token),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_another_driver_cannot_cancel_booking(client):
    register_user(client, "host@example.com", "host")
    register_user(client, "driver1@example.com", "driver")
    register_user(client, "driver2@example.com", "driver")

    host_token = get_token(client, "host@example.com")
    driver1_token = get_token(client, "driver1@example.com")
    driver2_token = get_token(client, "driver2@example.com")

    charger_id = create_charger(client, host_token)

    booking = create_booking(client, charger_id, driver1_token)
    booking_id = booking.json()["id"]

    response = client.patch(
        f"{BASE_BOOKINGS}/{booking_id}/cancel",
        headers=auth_headers(driver2_token),
    )

    assert response.status_code == 404


def test_host_can_view_own_charger_bookings(client):
    register_user(client, "host@example.com", "host")
    register_user(client, "driver@example.com", "driver")

    host_token = get_token(client, "host@example.com")
    driver_token = get_token(client, "driver@example.com")

    charger_id = create_charger(client, host_token)

    create_booking(client, charger_id, driver_token)

    response = client.get(
        f"{BASE_BOOKINGS}/host",
        headers=auth_headers(host_token),
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
