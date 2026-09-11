"""Student explanation for a FOR_REVIEW attendance record, and admin
approve/reject of that explanation."""

from app.models.attendance_review import AttendanceReviewRequest
from app.models.event import Attendance


def _set_status(db, event, student, status_value):
    db.add(Attendance(event_id=event.id, student_id=student.id, status=status_value,
                       time_in=None, time_out=None))
    db.commit()


class TestSubmitReview:
    def test_submitting_for_a_for_review_record_succeeds(
        self, client, db, event, make_student, register
    ):
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        _set_status(db, event, student, "FOR_REVIEW")

        from app.core.security import create_access_token

        token = create_access_token(subject=student.id, token_type="student")
        res = client.post(
            f"/api/v1/events/{event.id}/attendance-review",
            json={"reason": "I stepped out briefly during MIDDLE for an emergency."},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200, res.text
        assert res.json()["status"] == "PENDING"

        row = db.query(AttendanceReviewRequest).filter(
            AttendanceReviewRequest.event_id == event.id, AttendanceReviewRequest.student_id == student.id
        ).one()
        assert row.status == "PENDING"
        assert "emergency" in row.reason

    def test_cannot_submit_when_not_for_review(self, client, db, event, make_student, register):
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        _set_status(db, event, student, "PRESENT")

        from app.core.security import create_access_token

        token = create_access_token(subject=student.id, token_type="student")
        res = client.post(
            f"/api/v1/events/{event.id}/attendance-review",
            json={"reason": "whatever"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400

    def test_cannot_submit_twice_while_pending(self, client, db, event, make_student, register):
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        _set_status(db, event, student, "FOR_REVIEW")

        from app.core.security import create_access_token

        token = create_access_token(subject=student.id, token_type="student")
        headers = {"Authorization": f"Bearer {token}"}
        body = {"reason": "explanation"}

        assert client.post(f"/api/v1/events/{event.id}/attendance-review", json=body, headers=headers).status_code == 200
        res = client.post(f"/api/v1/events/{event.id}/attendance-review", json=body, headers=headers)
        assert res.status_code == 409

    def test_empty_reason_is_rejected(self, client, db, event, make_student, register):
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        _set_status(db, event, student, "FOR_REVIEW")

        from app.core.security import create_access_token

        token = create_access_token(subject=student.id, token_type="student")
        res = client.post(
            f"/api/v1/events/{event.id}/attendance-review",
            json={"reason": "   "},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400


class TestAdminReviewsQueue:
    def _submit(self, db, event, student, reason="explanation"):
        req = AttendanceReviewRequest(event_id=event.id, student_id=student.id, reason=reason, status="PENDING")
        db.add(req)
        db.commit()
        db.refresh(req)
        return req

    def test_list_and_approve_marks_present(
        self, client, db, admin_headers, event, make_student, register
    ):
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        _set_status(db, event, student, "FOR_REVIEW")
        req = self._submit(db, event, student)

        listed = client.get("/api/v1/officer/attendance-reviews/", headers=admin_headers).json()
        assert len(listed["requests"]) == 1
        assert listed["requests"][0]["student_id"] == student.student_id

        res = client.put(f"/api/v1/officer/attendance-reviews/{req.id}/approve", headers=admin_headers)
        assert res.status_code == 200

        record = db.query(Attendance).filter(
            Attendance.event_id == event.id, Attendance.student_id == student.id
        ).one()
        assert record.status == "PRESENT"

        db.refresh(req)
        assert req.status == "APPROVED"
        assert req.reviewed_at is not None

    def test_reject_requires_a_reason_and_leaves_status_alone(
        self, client, db, admin_headers, event, make_student, register
    ):
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        _set_status(db, event, student, "FOR_REVIEW")
        req = self._submit(db, event, student)

        missing = client.put(
            f"/api/v1/officer/attendance-reviews/{req.id}/reject", json={"reason": ""}, headers=admin_headers
        )
        assert missing.status_code == 422

        res = client.put(
            f"/api/v1/officer/attendance-reviews/{req.id}/reject",
            json={"reason": "Does not explain the missing scan"},
            headers=admin_headers,
        )
        assert res.status_code == 200

        record = db.query(Attendance).filter(
            Attendance.event_id == event.id, Attendance.student_id == student.id
        ).one()
        assert record.status == "FOR_REVIEW"

        db.refresh(req)
        assert req.status == "REJECTED"
        assert req.rejection_reason == "Does not explain the missing scan"

    def test_cannot_approve_twice(self, client, db, admin_headers, event, make_student, register):
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        _set_status(db, event, student, "FOR_REVIEW")
        req = self._submit(db, event, student)

        assert client.put(f"/api/v1/officer/attendance-reviews/{req.id}/approve", headers=admin_headers).status_code == 200
        again = client.put(f"/api/v1/officer/attendance-reviews/{req.id}/approve", headers=admin_headers)
        assert again.status_code == 409

    def test_status_filter(self, client, db, admin_headers, event, make_student, register):
        a = make_student(first="A", course="BSCS", year_level=1, section="A")
        b = make_student(first="B", course="BSCS", year_level=1, section="A")
        register(event, a)
        register(event, b)
        _set_status(db, event, a, "FOR_REVIEW")
        _set_status(db, event, b, "FOR_REVIEW")
        req_a = self._submit(db, event, a)
        self._submit(db, event, b)

        client.put(f"/api/v1/officer/attendance-reviews/{req_a.id}/approve", headers=admin_headers)

        pending = client.get(
            "/api/v1/officer/attendance-reviews/?status_filter=PENDING", headers=admin_headers
        ).json()
        assert len(pending["requests"]) == 1
        assert pending["requests"][0]["student_id"] == b.student_id

    def test_requires_admin(self, client, event):
        assert client.get("/api/v1/officer/attendance-reviews/").status_code == 401


class TestDashboardExposesReviewStatus:
    def test_pending_review_shows_on_dashboard(
        self, client, db, event, make_student, register
    ):
        import uuid
        from datetime import datetime

        from app.models.user import Profile, AccountStatus
        from app.core.crypto import encrypt_secret
        from app.core.security import create_access_token

        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        _set_status(db, event, student, "FOR_REVIEW")
        # dashboard only includes rows with time_in set
        record = db.query(Attendance).filter(Attendance.student_id == student.id).one()
        record.time_in = datetime(2026, 9, 1, 0, 40)
        db.add(
            Profile(
                auth_user_id=str(uuid.uuid4()),
                student_id=student.student_id,
                display_name=f"{student.first_name} {student.last_name}",
                email=f"{student.student_id}@psits.local",
                status=AccountStatus.ACTIVE,
                totp_secret=encrypt_secret("JBSWY3DPEHPK3PXP"),
            )
        )
        db.commit()

        db.add(AttendanceReviewRequest(event_id=event.id, student_id=student.id, reason="x", status="PENDING"))
        db.commit()

        token = create_access_token(subject=student.id, token_type="student")
        res = client.get(
            "/api/v1/student-auth/me/dashboard", headers={"Authorization": f"Bearer {token}"}
        )
        assert res.status_code == 200, res.text
        row = next(r for r in res.json()["attendance"] if r["event_id"] == event.id)
        assert row["status"] == "FOR_REVIEW"
        assert row["review_status"] == "PENDING"
