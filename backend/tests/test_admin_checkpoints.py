"""Admin control of the attendance phase, officer management, and the
compatibility guarantees the new statuses must not break.
"""

from app.models.event import Attendance, Event
from app.models.officer import EventAttendancePhaseLog, Officer


def _advance(client, headers, event_id, next_phase):
    return client.post(
        f"/api/v1/officer/events/{event_id}/attendance-phase",
        json={"next_phase": next_phase},
        headers=headers,
    )


class TestAdminPhaseControl:
    def test_full_forward_sequence(self, client, admin_headers, event):
        sequence = ["IN", "IN_CLOSED", "MIDDLE", "MIDDLE_CLOSED", "OUT", "CLOSED"]
        for phase in sequence:
            res = _advance(client, admin_headers, event.id, phase)
            assert res.status_code == 200, res.text
            assert res.json()["attendance_phase"] == phase

    def test_cannot_skip_middle(self, client, admin_headers, event):
        _advance(client, admin_headers, event.id, "IN")
        res = _advance(client, admin_headers, event.id, "OUT")
        assert res.status_code == 409
        assert "IN_CLOSED" in res.json()["detail"]

    def test_cannot_go_backwards(self, client, admin_headers, event):
        for phase in ("IN", "IN_CLOSED", "MIDDLE"):
            _advance(client, admin_headers, event.id, phase)

        assert _advance(client, admin_headers, event.id, "IN").status_code == 409
        assert _advance(client, admin_headers, event.id, "NOT_STARTED").status_code == 409

    def test_cannot_advance_past_closed(self, client, admin_headers, event, db):
        event.attendance_phase = "CLOSED"
        db.commit()
        res = _advance(client, admin_headers, event.id, "IN")
        assert res.status_code == 409

    def test_a_stale_second_click_cannot_double_advance(self, client, admin_headers, event):
        """Two admins on the button at once: the second names a phase that is
        no longer next, so it is refused instead of skipping a checkpoint."""
        assert _advance(client, admin_headers, event.id, "IN").status_code == 200
        assert _advance(client, admin_headers, event.id, "IN").status_code == 409

    def test_every_change_is_audited(self, client, db, admin_headers, event):
        _advance(client, admin_headers, event.id, "IN")
        _advance(client, admin_headers, event.id, "IN_CLOSED")
        _advance(client, admin_headers, event.id, "MIDDLE")

        logs = (
            db.query(EventAttendancePhaseLog)
            .filter(EventAttendancePhaseLog.event_id == event.id)
            .order_by(EventAttendancePhaseLog.changed_at)
            .all()
        )
        assert [(l.previous_phase, l.new_phase) for l in logs] == [
            ("NOT_STARTED", "IN"),
            ("IN", "IN_CLOSED"),
            ("IN_CLOSED", "MIDDLE"),
        ]
        assert all(l.changed_by is not None for l in logs)
        assert all(l.changed_by_name == "Test Admin" for l in logs)

    def test_phase_endpoint_requires_admin(self, client, event):
        res = client.post(
            f"/api/v1/officer/events/{event.id}/attendance-phase", json={"next_phase": "IN"}
        )
        assert res.status_code == 401

    def test_middle_is_never_opened_automatically(self, client, admin_headers, event):
        """There is no scheduling input anywhere in this flow - MIDDLE only
        ever moves because an admin pressed the button."""
        _advance(client, admin_headers, event.id, "IN")
        _advance(client, admin_headers, event.id, "IN_CLOSED")

        state = client.get(
            f"/api/v1/officer/events/{event.id}/attendance-phase", headers=admin_headers
        ).json()
        assert state["attendance_phase"] == "IN_CLOSED"
        assert state["current_checkpoint"] is None
        assert state["next_phase"] == "MIDDLE"
        assert state["next_phase_label"] == "Open MIDDLE"


class TestOfficerManagement:
    def test_create_officer_and_never_return_the_pin(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/officers/",
            json={
                "name": "Officer A",
                "pin": "123456",
                "confirm_pin": "123456",
                "is_active": True,
            },
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        assert "123456" not in res.text
        assert "pin" not in res.json()

    def test_pin_is_stored_hashed_not_plaintext(self, client, db, admin_headers):
        client.post(
            "/api/v1/officer/officers/",
            json={"name": "Officer A", "pin": "654321", "confirm_pin": "654321"},
            headers=admin_headers,
        )
        officer = db.query(Officer).one()
        assert officer.pin_hash != "654321"
        assert officer.pin_hash.startswith("$2")  # bcrypt

    def test_listing_officers_never_exposes_the_hash(self, client, admin_headers, make_officer):
        make_officer(name="Officer A", pin="123456")
        res = client.get("/api/v1/officer/officers/", headers=admin_headers)
        assert res.status_code == 200
        assert "pin_hash" not in res.text
        assert "$2" not in res.text

    def test_mismatched_pins_are_rejected(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/officers/",
            json={"name": "Officer A", "pin": "123456", "confirm_pin": "654321"},
            headers=admin_headers,
        )
        assert res.status_code == 422

    def test_non_numeric_and_short_pins_are_rejected(self, client, admin_headers):
        for pin in ("abcdef", "12"):
            res = client.post(
                "/api/v1/officer/officers/",
                json={"name": "Officer A", "pin": pin, "confirm_pin": pin},
                headers=admin_headers,
            )
            assert res.status_code == 400

    def test_pin_reset_changes_which_pin_works(
        self, client, db, admin_headers, event, make_officer, make_assignment
    ):
        officer = make_officer(pin="111111")
        make_assignment(event, officer)

        assert (
            client.post(
                "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "111111"}
            ).status_code
            == 200
        )

        res = client.post(
            f"/api/v1/officer/officers/{officer.id}/pin",
            json={"pin": "222222", "confirm_pin": "222222"},
            headers=admin_headers,
        )
        assert res.status_code == 200

        assert (
            client.post(
                "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "111111"}
            ).status_code
            == 401
        )
        assert (
            client.post(
                "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "222222"}
            ).status_code
            == 200
        )

    def test_deactivate_via_update(self, client, db, admin_headers, make_officer):
        officer = make_officer(name="Officer A", pin="123456")
        res = client.put(
            f"/api/v1/officer/officers/{officer.id}",
            json={"name": "Officer A", "is_active": False},
            headers=admin_headers,
        )
        assert res.status_code == 200
        assert res.json()["is_active"] is False

    def test_officer_endpoints_require_admin(self, client):
        assert client.get("/api/v1/officer/officers/").status_code == 401


class TestEventOfficerAssignmentApi:
    def test_assign_and_list(self, client, admin_headers, event, make_officer):
        officer = make_officer(name="Officer A")
        res = client.post(
            f"/api/v1/officer/events/{event.id}/officers",
            json={"officer_id": officer.id, "course": "bscs", "year_level": 1, "section": "a"},
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        assert res.json()["course"] == "BSCS"
        assert res.json()["year_level"] == 1
        assert res.json()["section"] == "A"

        listed = client.get(
            f"/api/v1/officer/events/{event.id}/officers", headers=admin_headers
        ).json()
        assert len(listed["assignments"]) == 1

    def test_duplicate_assignment_is_rejected(self, client, admin_headers, event, make_officer):
        officer = make_officer()
        body = {"officer_id": officer.id, "course": "BSCS", "year_level": 1, "section": "A"}
        client.post(
            f"/api/v1/officer/events/{event.id}/officers", json=body, headers=admin_headers
        )
        res = client.post(
            f"/api/v1/officer/events/{event.id}/officers", json=body, headers=admin_headers
        )
        assert res.status_code == 409

    def test_two_officers_may_cover_the_same_section(
        self, client, admin_headers, event, make_officer
    ):
        a = make_officer(name="Officer A")
        b = make_officer(name="Officer B")
        for officer in (a, b):
            res = client.post(
                f"/api/v1/officer/events/{event.id}/officers",
                json={"officer_id": officer.id, "course": "BSCS", "year_level": 1, "section": "A"},
                headers=admin_headers,
            )
            assert res.status_code == 200, res.text

    def test_unassign(self, client, admin_headers, event, make_officer, make_assignment):
        officer = make_officer()
        assignment = make_assignment(event, officer)
        res = client.delete(
            f"/api/v1/officer/events/{event.id}/officers/{assignment.id}", headers=admin_headers
        )
        assert res.status_code == 200

        listed = client.get(
            f"/api/v1/officer/events/{event.id}/officers", headers=admin_headers
        ).json()
        assert listed["assignments"] == []


class TestScanAuditTrail:
    def test_audit_answers_who_scanned_this_student(
        self,
        client,
        admin_headers,
        event,
        make_officer,
        make_assignment,
        make_student,
        register,
        scanner_login,
        advance_to,
    ):
        officer = make_officer(name="Officer A", pin="123456")
        make_assignment(event, officer, "BSCS", year_level=1, section="A")
        student = make_student(first="Ana", course="BSCS", year_level=1, section="A")
        register(event, student)
        advance_to(event, "IN")
        headers = scanner_login()

        client.post(
            "/api/v1/scanner/scan", json={"student_id": student.student_id}, headers=headers
        )

        audit = client.get(
            f"/api/v1/officer/events/{event.id}/checkpoint-scans", headers=admin_headers
        ).json()
        assert audit["total"] == 1
        row = audit["scans"][0]
        assert row["officer_name"] == "Officer A"
        assert row["officer_course"] == "BSCS"
        assert row["officer_year_level"] == 1
        assert row["officer_section"] == "A"
        assert row["student_id"] == student.student_id
        assert row["checkpoint"] == "IN"
        assert row["scanned_at"]

    def test_cross_section_filter(
        self,
        client,
        admin_headers,
        event,
        make_officer,
        make_assignment,
        make_student,
        register,
        scanner_login,
        advance_to,
    ):
        officer = make_officer(pin="123456")
        make_assignment(event, officer, "BSCS", year_level=1, section="A")
        same = make_student(first="Same", course="BSCS", year_level=1, section="A")
        other = make_student(first="Other", course="BSIT", year_level=2, section="B")
        register(event, same)
        register(event, other)
        advance_to(event, "IN")
        headers = scanner_login()

        client.post("/api/v1/scanner/scan", json={"student_id": same.student_id}, headers=headers)
        client.post(
            "/api/v1/scanner/scan",
            json={"student_id": other.student_id, "allow_cross_section": True},
            headers=headers,
        )

        flagged = client.get(
            f"/api/v1/officer/events/{event.id}/checkpoint-scans?cross_section_only=true",
            headers=admin_headers,
        ).json()
        assert flagged["total"] == 1
        assert flagged["scans"][0]["student_course"] == "BSIT"


class TestBackwardCompatibility:
    def test_legacy_two_scan_event_is_untouched(
        self, client, db, admin_headers, event, make_student, register
    ):
        """An event that never enters the checkpoint workflow behaves exactly
        as it did before: scan-in -> INCOMPLETE, scan-out -> PRESENT."""
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)

        res = client.post(
            f"/api/v1/events/{event.id}/attendance/scan-in",
            json={"student_id": student.student_id},
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        record = db.query(Attendance).filter(Attendance.student_id == student.id).one()
        assert record.status == "INCOMPLETE"

        client.post(
            f"/api/v1/events/{event.id}/attendance/scan-out",
            json={"student_id": student.student_id},
            headers=admin_headers,
        )
        db.refresh(record)
        assert record.status == "PRESENT"

    def test_legacy_scan_is_refused_on_a_checkpoint_event(
        self, client, admin_headers, event, make_student, register, advance_to
    ):
        """Otherwise a stray legacy scan-out would overwrite a LATE or
        FOR_REVIEW verdict derived from the checkpoint scans."""
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        advance_to(event, "IN")

        res = client.post(
            f"/api/v1/events/{event.id}/attendance/scan-in",
            json={"student_id": student.student_id},
            headers=admin_headers,
        )
        assert res.status_code == 409
        assert "checkpoint" in res.json()["detail"].lower()

    def test_registrations_report_exposes_checkpoints_and_new_totals(
        self,
        client,
        admin_headers,
        event,
        make_officer,
        make_assignment,
        make_student,
        register,
        scanner_login,
        advance_to,
    ):
        officer = make_officer(pin="123456")
        make_assignment(event, officer, "BSCS", year_level=1, section="A")
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        headers = scanner_login()

        for phase in ("MIDDLE", "OUT"):
            advance_to(event, phase)
            client.post(
                "/api/v1/scanner/scan", json={"student_id": student.student_id}, headers=headers
            )

        data = client.get(
            f"/api/v1/officer/events/{event.id}/registrations", headers=admin_headers
        ).json()

        assert data["uses_checkpoints"] is True
        assert data["attendance_phase"] == "OUT"
        assert data["late_threshold_minutes"] == 20
        assert data["total_late_status"] == 1

        row = next(r for r in data["registrations"] if r["student_id"] == student.student_id)
        assert row["status"] == "LATE"
        assert row["checkpoints"] == ["MIDDLE", "OUT"]

    def test_excel_export_still_builds_for_a_checkpoint_event(
        self,
        client,
        admin_headers,
        event,
        make_officer,
        make_assignment,
        make_student,
        register,
        scanner_login,
        advance_to,
    ):
        officer = make_officer(pin="123456")
        make_assignment(event, officer, "BSCS", year_level=1, section="A")
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        headers = scanner_login()
        advance_to(event, "IN")
        client.post(
            "/api/v1/scanner/scan", json={"student_id": student.student_id}, headers=headers
        )

        res = client.get(
            f"/api/v1/officer/events/{event.id}/registrations/export", headers=admin_headers
        )
        assert res.status_code == 200
        assert res.content[:2] == b"PK"  # a real xlsx zip container

    def test_late_status_is_not_treated_as_an_absence_by_sanctions(
        self, db, event, make_student, register
    ):
        """LATE means they were there for MIDDLE and OUT. Sanctioning them
        like a no-show would be plainly wrong."""
        from app.core.sanctions import sync_sanctions_for_student
        from app.models.sanction import Sanction

        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        event.status = "ARCHIVED"
        db.add(Attendance(event_id=event.id, student_id=student.id, status="LATE"))
        db.commit()

        sync_sanctions_for_student(student.id, db)
        assert db.query(Sanction).filter(Sanction.student_id == student.id).count() == 0

    def test_for_review_does_not_auto_sanction(self, db, event, make_student, register):
        from app.core.sanctions import sync_sanctions_for_student
        from app.models.sanction import Sanction

        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        event.status = "ARCHIVED"
        db.add(Attendance(event_id=event.id, student_id=student.id, status="FOR_REVIEW"))
        db.commit()

        sync_sanctions_for_student(student.id, db)
        assert db.query(Sanction).filter(Sanction.student_id == student.id).count() == 0

    def test_incomplete_still_sanctions_as_before(self, db, event, make_student, register):
        """The existing rule must not have moved."""
        from app.core.sanctions import sync_sanctions_for_student
        from app.models.sanction import Sanction

        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        event.status = "ARCHIVED"
        db.add(Attendance(event_id=event.id, student_id=student.id, status="INCOMPLETE"))
        db.commit()

        sync_sanctions_for_student(student.id, db)
        assert db.query(Sanction).filter(Sanction.student_id == student.id).count() == 1

    def test_survey_workflow_is_unaffected_by_checkpoints(
        self,
        client,
        db,
        event,
        make_officer,
        make_assignment,
        make_student,
        register,
        scanner_login,
        advance_to,
    ):
        """A student who completes all three checkpoints is PRESENT, and their
        survey is separately PENDING - the two never overwrite each other."""
        event.survey_required = True
        db.commit()

        officer = make_officer(pin="123456")
        make_assignment(event, officer, "BSCS", year_level=1, section="A")
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        headers = scanner_login()

        for phase in ("IN", "MIDDLE", "OUT"):
            advance_to(event, phase)
            client.post(
                "/api/v1/scanner/scan", json={"student_id": student.student_id}, headers=headers
            )

        record = db.query(Attendance).filter(Attendance.student_id == student.id).one()
        assert record.status == "PRESENT"

        from app.api.v1.endpoints.admin_events import build_event_registrations

        data = build_event_registrations(db, db.query(Event).filter(Event.id == event.id).one())
        row = next(r for r in data.registrations if r.student_id == student.student_id)
        assert row.status == "PRESENT"
        assert row.survey_status == "PENDING"


class TestEventFormFields:
    def test_late_threshold_round_trips_and_a_code_is_generated(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/events/",
            json={
                "name": "Seminar",
                "venue": "AVR",
                "description": "d",
                "event_date": "2026-11-01T13:00:00",
                "status": "ACTIVE",
                "late_threshold_minutes": 45,
            },
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["late_threshold_minutes"] == 45
        assert body["attendance_phase"] == "NOT_STARTED"
        assert body["event_code"] and len(body["event_code"]) == 6

    def test_negative_threshold_is_rejected(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/events/",
            json={
                "name": "Seminar",
                "venue": "AVR",
                "description": "d",
                "event_date": "2026-11-01T13:00:00",
                "status": "ACTIVE",
                "late_threshold_minutes": -5,
            },
            headers=admin_headers,
        )
        assert res.status_code == 400

    def test_default_threshold_is_twenty(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/events/",
            json={
                "name": "Seminar",
                "venue": "AVR",
                "description": "d",
                "event_date": "2026-11-01T13:00:00",
                "status": "ACTIVE",
            },
            headers=admin_headers,
        )
        assert res.json()["late_threshold_minutes"] == 20
