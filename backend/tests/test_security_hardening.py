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


def test_attendance_websocket_rejects_token_revoked_by_password_change(client, db, event, admin_token):
    """REST endpoints reject a token the instant its security stamp no
    longer matches the account's current one (e.g. after a password
    change) - the WebSocket channel has to honor that same revocation
    instead of staying authenticated until the token's own expiry."""
    from app.models.admin import AdminAccount

    admin = db.query(AdminAccount).filter(AdminAccount.email == "admin@psits-test.org").one()
    admin.security_stamp = "rotated-by-a-password-change"
    db.commit()

    with client.websocket_connect(
        f"/api/v1/events/{event.id}/attendance/ws", headers={"host": "localhost"}
    ) as websocket:
        websocket.send_json({"token": admin_token})
        assert websocket.receive() == {"type": "websocket.close", "code": 1008, "reason": ""}


def test_public_event_detail_hides_inactive_events(client, db, event):
    event.status = "ENDED"
    db.commit()

    response = client.get(f"/api/v1/events/{event.id}")

    assert response.status_code == 404
