def test_attendance_websocket_rejects_invalid_admin_token(client, event):
    with client.websocket_connect(
        f"/api/v1/events/{event.id}/attendance/ws", headers={"host": "localhost"}
    ) as websocket:
        websocket.send_json({"token": "not-a-valid-token"})
        assert websocket.receive() == {"type": "websocket.close", "code": 1008, "reason": ""}


def test_attendance_websocket_accepts_active_admin(client, event, admin_token):
    with client.websocket_connect(
        f"/api/v1/events/{event.id}/attendance/ws", headers={"host": "localhost"}
    ) as websocket:
        websocket.send_json({"token": admin_token})
        assert websocket.receive() == {
            "type": "websocket.send",
            "text": '{"type":"authenticated"}',
        }


def test_public_event_detail_hides_inactive_events(client, db, event):
    event.status = "ENDED"
    db.commit()

    response = client.get(f"/api/v1/events/{event.id}")

    assert response.status_code == 404
