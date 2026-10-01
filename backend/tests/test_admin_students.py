"""Admin student creation - also covers that a new student gets membership
fee rows for both semesters automatically, so they show up in the
Membership Ledger right away instead of needing a separate manual step."""

from app.models.balance import MembershipFee
from app.models.student import Student


class TestCreateStudent:
    def test_creating_a_student_also_creates_both_semester_fees(self, client, db, admin_headers, school_setup):
        res = client.post(
            "/api/v1/officer/students/",
            headers=admin_headers,
            json={
                "student_id": "26-00001",
                "first_name": "Test",
                "last_name": "Student",
                "program": "BSCS",
                "year_level": 1,
                "section": "A",
            },
        )
        assert res.status_code == 201, res.text

        student = db.query(Student).filter(Student.student_id == "26-00001").one()
        fees = db.query(MembershipFee).filter(MembershipFee.student_id == student.id).all()
        semesters = sorted(f.semester for f in fees)
        assert semesters == ["1ST", "2ND"]
        for fee in fees:
            assert float(fee.amount_due) == 100.0
            assert float(fee.amount_paid) == 0.0
            assert fee.school_year_id == school_setup["year"].id

    def test_rejects_duplicate_student_id(self, client, admin_headers, make_student):
        student = make_student()
        res = client.post(
            "/api/v1/officer/students/",
            headers=admin_headers,
            json={
                "student_id": student.student_id,
                "first_name": "Dup",
                "last_name": "Licate",
                "program": "BSCS",
                "year_level": 1,
                "section": "A",
            },
        )
        assert res.status_code == 409

    def test_requires_admin(self, client):
        res = client.post(
            "/api/v1/officer/students/",
            json={
                "student_id": "26-00002",
                "first_name": "No",
                "last_name": "Auth",
                "program": "BSCS",
                "year_level": 1,
                "section": "A",
            },
        )
        assert res.status_code in (401, 403)
