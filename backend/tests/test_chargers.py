
BASE_AUTH = "/api/v1/auth"
BASE_CHARGERS = "/api/v1/chargers"


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


def create_charger_payload():
    return {
        "title": "Test Home Charger",
        "description": "Automated testing charger",
        "location_name": "Nashik",
        "latitude": 19.9975,
        "longitude": 73.7898,
        "connector_type": "Type 2",
        "power_kw": 7.40,
        "price_per_kwh": 12.50,
        "charger_category": "home",
    }


def test_host_can_create_charger(client):
    register_user(client, "host@example.com", "host")
    token = get_token(client, "host@example.com")

    response = client.post(
        BASE_CHARGERS,
        json=create_charger_payload(),
        headers=auth_headers(token),
    )

    assert response.status_code == 201
    assert response.json()["title"] == "Test Home Charger"
    assert response.json()["is_active"] is True


def test_driver_cannot_create_charger(client):
    register_user(client, "driver@example.com", "driver")
    token = get_token(client, "driver@example.com")

    response = client.post(
        BASE_CHARGERS,
        json=create_charger_payload(),
        headers=auth_headers(token),
    )

    assert response.status_code == 403


def test_unauthenticated_user_cannot_create_charger(client):
    response = client.post(
        BASE_CHARGERS,
        json=create_charger_payload(),
    )

    assert response.status_code == 401


def test_driver_can_view_available_chargers(client):
    register_user(client, "host@example.com", "host")
    token = get_token(client, "host@example.com")

    client.post(
        BASE_CHARGERS,
        json=create_charger_payload(),
        headers=auth_headers(token),
    )

    response = client.get(BASE_CHARGERS)

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["title"] == "Test Home Charger"


def test_charger_filter_by_location(client):
    register_user(client, "host@example.com", "host")
    token = get_token(client, "host@example.com")

    client.post(
        BASE_CHARGERS,
        json=create_charger_payload(),
        headers=auth_headers(token),
    )

    response = client.get(
        BASE_CHARGERS,
        params={"location": "Nashik"},
    )

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_invalid_charger_power_is_rejected(client):
    register_user(client, "host@example.com", "host")
    token = get_token(client, "host@example.com")

    payload = create_charger_payload()
    payload["power_kw"] = -5

    response = client.post(
        BASE_CHARGERS,
        json=payload,
        headers=auth_headers(token),
    )

    assert response.status_code == 422


def test_host_cannot_update_another_hosts_charger(client):
    register_user(client, "host1@example.com", "host")
    register_user(client, "host2@example.com", "host")

    token1 = get_token(client, "host1@example.com")
    token2 = get_token(client, "host2@example.com")

    charger_response = client.post(
        BASE_CHARGERS,
        json=create_charger_payload(),
        headers=auth_headers(token1),
    )

    charger_id = charger_response.json()["id"]

    response = client.patch(
        f"{BASE_CHARGERS}/{charger_id}",
        json={"title": "Unauthorized Update"},
        headers=auth_headers(token2),
    )

    assert response.status_code == 403


def test_host_can_deactivate_own_charger(client):
    register_user(client, "host@example.com", "host")
    token = get_token(client, "host@example.com")

    charger_response = client.post(
        BASE_CHARGERS,
        json=create_charger_payload(),
        headers=auth_headers(token),
    )

    charger_id = charger_response.json()["id"]

    response = client.delete(
        f"{BASE_CHARGERS}/{charger_id}",
        headers=auth_headers(token),
    )

    assert response.status_code == 204

    list_response = client.get(BASE_CHARGERS)

    assert list_response.status_code == 200
    assert len(list_response.json()) == 0
