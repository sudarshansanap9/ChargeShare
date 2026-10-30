
import pytest


BASE_URL = "/api/v1/auth"


def register_user(client, email="driver@example.com", role="driver"):
    return client.post(
        f"{BASE_URL}/register",
        json={
            "full_name": "Test User",
            "email": email,
            "password": "TestPassword123",
            "role": role,
        },
    )


def login_user(client, email="driver@example.com"):
    return client.post(
        f"{BASE_URL}/login",
        data={
            "username": email,
            "password": "TestPassword123",
        },
    )


@pytest.mark.parametrize("role", ["driver", "host"])
def test_register_user_successfully(client, role):
    response = register_user(
        client,
        email=f"{role}@example.com",
        role=role,
    )

    assert response.status_code == 201
    assert response.json()["email"] == f"{role}@example.com"
    assert response.json()["role"] == role
    assert response.json()["is_active"] is True
    assert "password_hash" not in response.json()


def test_register_duplicate_email(client):
    first_response = register_user(client)

    assert first_response.status_code == 201

    second_response = register_user(client)

    assert second_response.status_code == 409


def test_login_successfully(client):
    register_user(client)

    response = login_user(client)

    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"


def test_login_with_incorrect_password(client):
    register_user(client)

    response = client.post(
        f"{BASE_URL}/login",
        data={
            "username": "driver@example.com",
            "password": "WrongPassword123",
        },
    )

    assert response.status_code == 401


def test_login_with_unregistered_email(client):
    response = login_user(client)

    assert response.status_code == 401


def test_profile_requires_authentication(client):
    response = client.get(f"{BASE_URL}/me")

    assert response.status_code == 401


def test_authenticated_user_can_access_profile(client):
    register_user(client)

    login_response = login_user(client)
    token = login_response.json()["access_token"]

    response = client.get(
        f"{BASE_URL}/me",
        headers={
            "Authorization": f"Bearer {token}"
        },
    )

    assert response.status_code == 200
    assert response.json()["email"] == "driver@example.com"
    assert response.json()["role"] == "driver"
