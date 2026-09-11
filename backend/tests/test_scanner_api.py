"""Scanner authentication, checkpoint enforcement, and the scan audit trail.

Everything here is an assertion about what the BACKEND refuses. None of these
protections may live only in the scanner client - an officer's phone is not a
trust boundary.
"""

from app.models.event import Attendance
from app.models.officer import AttendanceCheckpointScan, EventOfficerAssignment


def _scan(client, headers, student, **kwargs):
    body = {"student_id": student.student_id}
    body.update(kwargs)
    return client.post("/api/v1/scanner/scan", json=body, headers=headers)


class TestScannerLogin:
    def test_valid_event_code_and_pin_opens_a_session(
        self, client, event, make_officer, make_assignment
    ):
        officer = make_officer(name="Officer A", pin="123456")
        make_assignment(event, officer, "BSCS", year_level=1, section="A")

        res = client.post(
            "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "123456"}
        )
        assert res.status_code == 200, res.text
        body = res.json()

        assert body["token"]
        assert body["context"]["officer_name"] == "Officer A"
        assert body["context"]["assignment"]["course"] == "BSCS"
        assert body["context"]["assignment"]["year_level"] == 1
        assert body["context"]["assignment"]["section"] == "A"
        assert body["context"]["attendance_phase"] == "NOT_STARTED"
        assert body["context"]["current_checkpoint"] is None

    def test_login_response_never_leaks_the_pin(
        self, client, event, make_officer, make_assignment
    ):
        officer = make_officer(pin="123456")
        make_assignment(event, officer)

        res = client.post(
            "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "123456"}
        )
        raw = res.text
        assert "123456" not in raw
        assert "pin_hash" not in raw
        assert officer.pin_hash not in raw

    def test_wrong_pin_is_rejected(self, client, event, make_officer, make_assignment):
        officer = make_officer(pin="123456")
        make_assignment(event, officer)

        res = client.post(
            "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "999999"}
        )
        assert res.status_code == 401

    def test_inactive_officer_is_rejected(self, client, event, make_officer, make_assignment):
        officer = make_officer(pin="123456", is_active=False)
        make_assignment(event, officer)

        res = client.post(
            "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "123456"}
        )
        assert res.status_code == 401

    def test_officer_not_assigned_to_the_event_is_rejected(self, client, event, make_officer):
        """A real officer with the right PIN, but no assignment at this event -
        their PIN must not open a session here."""
        make_officer(pin="123456")  # no assignment created

        res = client.post(
            "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "123456"}
        )
        assert res.status_code == 401

    def test_unknown_event_code_is_rejected(self, client, event, make_officer, make_assignment):
        officer = make_officer(pin="123456")
        make_assignment(event, officer)

        res = client.post(
            "/api/v1/scanner/session", json={"event_code": "NOPE99", "pin": "123456"}
        )
        assert res.status_code == 401

    def test_failures_are_indistinguishable(self, client, event, make_officer, make_assignment):
        """Wrong PIN and wrong event must return the same message, so the
        endpoint can't be used as an oracle for either."""
        officer = make_officer(pin="123456")
        make_assignment(event, officer)

        wrong_pin = client.post(
            "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "000000"}
        )
        wrong_event = client.post(
            "/api/v1/scanner/session", json={"event_code": "ZZZZZZ", "pin": "123456"}
        )
        assert wrong_pin.json()["detail"] == wrong_event.json()["detail"]

    def test_deactivating_an_officer_kills_their_live_session(
        self, client, db, event, make_officer, make_assignment, scanner_login
    ):
        officer = make_officer(pin="123456")
        make_assignment(event, officer)
        headers = scanner_login()

        assert client.get("/api/v1/scanner/session", headers=headers).status_code == 200

        officer.is_active = False
        db.commit()

        assert client.get("/api/v1/scanner/session", headers=headers).status_code == 401


class TestCheckpointEnforcement:
    def test_cannot_scan_when_no_checkpoint_is_open(
        self, client, event, make_officer, make_assignment, make_student, register, scanner_login
    ):
        officer = make_officer(pin="123456")
        make_assignment(event, officer)
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        headers = scanner_login()

        res = _scan(client, headers, student)
        assert res.status_code == 409
        assert "checkpoint is open" in res.json()["detail"]

    def test_backend_decides_the_checkpoint_not_the_client(
        self,
        client,
        event,
        make_officer,
        make_assignment,
        make_student,
        register,
        scanner_login,
        advance_to,
    ):
        officer = make_officer(pin="123456")
        make_assignment(event, officer)
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        advance_to(event, "MIDDLE")
        headers = scanner_login()

        # Client sends nothing - server records MIDDLE from the event phase.
        res = _scan(client, headers, student)
        assert res.status_code == 200
        assert res.json()["checkpoint"] == "MIDDLE"

    def test_client_claiming_the_wrong_checkpoint_is_rejected(
        self,
        client,
        event,
        make_officer,
        make_assignment,
        make_student,
        register,
        scanner_login,
        advance_to,
    ):
        """Backend phase = MIDDLE, client attempts OUT -> REJECT."""
        officer = make_officer(pin="123456")
        make_assignment(event, officer)
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        advance_to(event, "MIDDLE")
        headers = scanner_login()

        res = _scan(client, headers, student, checkpoint="OUT")
        assert res.status_code == 409
        assert "MIDDLE" in res.json()["detail"]

    def test_officer_scans_all_three_checkpoints_on_one_session(
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
        """The same session survives the admin advancing the phase - the
        officer never logs in again between checkpoints."""
        officer = make_officer(pin="123456")
        make_assignment(event, officer)
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        headers = scanner_login()

        for phase, checkpoint in (("IN", "IN"), ("MIDDLE", "MIDDLE"), ("OUT", "OUT")):
            advance_to(event, phase)
            res = _scan(client, headers, student)
            assert res.status_code == 200, res.text
            assert res.json()["checkpoint"] == checkpoint

        record = (
            db.query(Attendance)
            .filter(Attendance.event_id == event.id, Attendance.student_id == student.id)
            .first()
        )
        assert record.status == "PRESENT"
        assert record.time_in is not None
        assert record.time_out is not None

    def test_invalid_qr_is_rejected(
        self, client, event, make_officer, make_assignment, scanner_login, advance_to
    ):
        officer = make_officer(pin="123456")
        make_assignment(event, officer)
        advance_to(event, "IN")
        headers = scanner_login()

        res = client.post(
            "/api/v1/scanner/scan", json={"student_id": "99-99999"}, headers=headers
        )
        assert res.status_code == 404

    def test_no_session_no_scan(self, client, event, make_student, advance_to):
        advance_to(event, "IN")
        student = make_student()
        res = client.post("/api/v1/scanner/scan", json={"student_id": student.student_id})
        assert res.status_code == 401


class TestDuplicateScanProtection:
    def test_second_scan_at_the_same_checkpoint_creates_no_second_record(
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
        officer = make_officer(pin="123456")
        make_assignment(event, officer)
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        advance_to(event, "IN")
        headers = scanner_login()

        first = _scan(client, headers, student)
        assert first.json()["status"] == "SCANNED"

        for _ in range(3):
            repeat = _scan(client, headers, student)
            assert repeat.status_code == 200
            assert repeat.json()["status"] == "ALREADY_SCANNED"

        count = (
            db.query(AttendanceCheckpointScan)
            .filter(
                AttendanceCheckpointScan.event_id == event.id,
                AttendanceCheckpointScan.student_id == student.id,
                AttendanceCheckpointScan.checkpoint == "IN",
            )
            .count()
        )
        assert count == 1

    def test_duplicate_protection_applies_to_middle_and_out_too(
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
        officer = make_officer(pin="123456")
        make_assignment(event, officer)
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        headers = scanner_login()

        for phase in ("MIDDLE", "OUT"):
            advance_to(event, phase)
            assert _scan(client, headers, student).json()["status"] == "SCANNED"
            assert _scan(client, headers, student).json()["status"] == "ALREADY_SCANNED"

        assert (
            db.query(AttendanceCheckpointScan)
            .filter(AttendanceCheckpointScan.event_id == event.id)
            .count()
            == 2
        )

    def test_a_second_officer_cannot_double_record_the_same_student(
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
        officer_a = make_officer(name="Officer A", pin="111111")
        officer_b = make_officer(name="Officer B", pin="222222")
        make_assignment(event, officer_a, "BSCS", year_level=1, section="A")
        make_assignment(event, officer_b, "BSCS", year_level=1, section="A")
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        advance_to(event, "IN")

        headers_a = scanner_login(pin="111111")
        headers_b = scanner_login(pin="222222")

        assert _scan(client, headers_a, student).json()["status"] == "SCANNED"
        assert _scan(client, headers_b, student).json()["status"] == "ALREADY_SCANNED"

        assert (
            db.query(AttendanceCheckpointScan)
            .filter(AttendanceCheckpointScan.event_id == event.id)
            .count()
            == 1
        )


class TestCrossSectionScans:
    def test_cross_section_asks_for_confirmation_first(
        self,
        client,
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
        student = make_student(course="BSIT", year_level=2, section="B")
        register(event, student)
        advance_to(event, "IN")
        headers = scanner_login()

        res = _scan(client, headers, student)
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "CROSS_SECTION_CONFIRM"
        assert body["student_course"] == "BSIT"
        assert body["student_year_level"] == 2
        assert body["student_section"] == "B"
        assert "BSCS Year 1 A" in body["message"]

    def test_cross_section_is_allowed_and_flagged_not_rejected(
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
        officer = make_officer(pin="123456")
        make_assignment(event, officer, "BSCS", year_level=1, section="A")
        student = make_student(course="BSIT", year_level=2, section="B")
        register(event, student)
        advance_to(event, "IN")
        headers = scanner_login()

        res = _scan(client, headers, student, allow_cross_section=True)
        assert res.status_code == 200
        assert res.json()["status"] == "SCANNED"
        assert res.json()["cross_section"] is True

        scan = (
            db.query(AttendanceCheckpointScan)
            .filter(AttendanceCheckpointScan.event_id == event.id)
            .one()
        )
        # The audit trail records both sides of the mismatch.
        assert scan.cross_section is True
        assert scan.officer_course == "BSCS"
        assert scan.officer_year_level == 1
        assert scan.officer_section == "A"
        assert scan.student_course == "BSIT"
        assert scan.student_year_level == 2
        assert scan.student_section == "B"
        assert scan.officer_id == officer.id
        assert scan.assignment_id is not None
        assert scan.scanner_session_id is not None

    def test_matching_section_scans_without_a_prompt(
        self,
        client,
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
        advance_to(event, "IN")
        headers = scanner_login()

        res = _scan(client, headers, student)
        assert res.json()["status"] == "SCANNED"
        assert res.json()["cross_section"] is False


class TestOfficerAssignmentModel:
    def test_same_officer_different_assignment_per_event(
        self, client, db, event, make_officer, make_assignment
    ):
        """Officer A -> Event A -> BSCS 1A, and Officer A -> Event B -> BSIT 2B."""
        from datetime import datetime

        from app.models.event import Event

        other = Event(
            name="Seminar",
            venue="AVR",
            description="Second event",
            event_date=datetime(2026, 10, 1, 13, 0),
            status="ACTIVE",
            event_code="SEM001",
            attendance_phase="NOT_STARTED",
            late_threshold_minutes=15,
        )
        db.add(other)
        db.commit()

        officer = make_officer(pin="123456")
        make_assignment(event, officer, "BSCS", year_level=1, section="A")
        make_assignment(other, officer, "BSIT", year_level=2, section="B")

        first = client.post(
            "/api/v1/scanner/session", json={"event_code": "GA2026", "pin": "123456"}
        ).json()
        second = client.post(
            "/api/v1/scanner/session", json={"event_code": "SEM001", "pin": "123456"}
        ).json()

        assert first["context"]["assignment"]["course"] == "BSCS"
        assert first["context"]["assignment"]["year_level"] == 1
        assert first["context"]["assignment"]["section"] == "A"
        assert second["context"]["assignment"]["course"] == "BSIT"
        assert second["context"]["assignment"]["year_level"] == 2
        assert second["context"]["assignment"]["section"] == "B"

    def test_two_officers_share_one_section_and_both_can_scan(
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
        officer_a = make_officer(name="Officer A", pin="111111")
        officer_b = make_officer(name="Officer B", pin="222222")
        make_assignment(event, officer_a, "BSCS", year_level=1, section="A")
        make_assignment(event, officer_b, "BSCS", year_level=1, section="A")

        one = make_student(first="One", course="BSCS", year_level=1, section="A")
        two = make_student(first="Two", course="BSCS", year_level=1, section="A")
        register(event, one)
        register(event, two)
        advance_to(event, "IN")

        assert _scan(client, scanner_login(pin="111111"), one).json()["status"] == "SCANNED"
        assert _scan(client, scanner_login(pin="222222"), two).json()["status"] == "SCANNED"

        scans = (
            db.query(AttendanceCheckpointScan)
            .filter(AttendanceCheckpointScan.event_id == event.id)
            .all()
        )
        assert {s.officer_id for s in scans} == {officer_a.id, officer_b.id}

    def test_assignment_is_not_per_checkpoint(self, db, event, make_officer, make_assignment):
        """There is no checkpoint column on an assignment, by design - an
        officer covers a section for the whole event, not one sweep of it."""
        officer = make_officer()
        make_assignment(event, officer)
        assert not hasattr(EventOfficerAssignment, "checkpoint")


class TestAttendanceStatusFromScans:
    """End-to-end: the scan path writes the same statuses the pure evaluation
    function promises, and keeps time_in/time_out usable by everything else."""

    def _setup(self, event, make_officer, make_assignment, make_student, register):
        officer = make_officer(pin="123456")
        make_assignment(event, officer, "BSCS", year_level=1, section="A")
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        return student

    def _status(self, db, event, student):
        return (
            db.query(Attendance)
            .filter(Attendance.event_id == event.id, Attendance.student_id == student.id)
            .first()
        )

    def test_in_middle_out_is_present(
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
        student = self._setup(event, make_officer, make_assignment, make_student, register)
        headers = scanner_login()
        for phase in ("IN", "MIDDLE", "OUT"):
            advance_to(event, phase)
            _scan(client, headers, student)
        assert self._status(db, event, student).status == "PRESENT"

    def test_middle_out_is_late(
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
        student = self._setup(event, make_officer, make_assignment, make_student, register)
        headers = scanner_login()
        for phase in ("MIDDLE", "OUT"):
            advance_to(event, phase)
            _scan(client, headers, student)

        record = self._status(db, event, student)
        assert record.status == "LATE"
        # No IN scan, but they were demonstrably present - time_in falls back
        # to their earliest scan rather than staying null.
        assert record.time_in is not None
        assert record.time_out is not None

    def test_in_out_without_middle_is_for_review(
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
        student = self._setup(event, make_officer, make_assignment, make_student, register)
        headers = scanner_login()
        for phase in ("IN", "OUT"):
            advance_to(event, phase)
            _scan(client, headers, student)
        assert self._status(db, event, student).status == "FOR_REVIEW"

    def test_out_only_is_for_review(
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
        student = self._setup(event, make_officer, make_assignment, make_student, register)
        headers = scanner_login()
        advance_to(event, "OUT")
        _scan(client, headers, student)
        assert self._status(db, event, student).status == "FOR_REVIEW"

    def test_in_only_is_incomplete(
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
        student = self._setup(event, make_officer, make_assignment, make_student, register)
        headers = scanner_login()
        advance_to(event, "IN")
        _scan(client, headers, student)

        record = self._status(db, event, student)
        assert record.status == "INCOMPLETE"
        assert record.time_out is None

    def test_in_middle_no_out_is_incomplete(
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
        student = self._setup(event, make_officer, make_assignment, make_student, register)
        headers = scanner_login()
        for phase in ("IN", "MIDDLE"):
            advance_to(event, phase)
            _scan(client, headers, student)
        assert self._status(db, event, student).status == "INCOMPLETE"

    def test_no_scans_leaves_no_attendance_row(
        self, db, event, make_student, register
    ):
        """Never scanned means the existing NO_SHOW / ABSENT / NOT_REGISTERED
        / EXCUSED lifecycle applies - the checkpoint code writes nothing."""
        student = make_student(course="BSCS", year_level=1, section="A")
        register(event, student)
        assert self._status(db, event, student) is None
