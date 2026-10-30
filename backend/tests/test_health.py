def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_marks_demo_mode(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["payments"] == "simulated"
    assert response.json()["charging"] == "simulated"