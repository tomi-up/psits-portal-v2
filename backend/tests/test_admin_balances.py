"""Admin 'Add Balance' - manually assessing a new membership due for a
student who doesn't have a fee row for a term yet."""

from app.models.balance import MembershipFee


class TestCreateBalance:
    def test_admin_can_add_a_new_balance(self, client, db, admin_headers, make_student, school_setup):
        student = make_student()

        res = client.post(
            "/api/v1/officer/balances/",
            headers=admin_headers,
            json={
                "student_id": student.student_id,
                "school_year_id": school_setup["year"].id,
                "semester": "1ST",
                "amount_due": 150,
            },
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["student_id"] == student.student_id
        assert body["amount_due"] == 150
        assert body["amount_paid"] == 0
        assert body["balance"] == 150
        assert body["status"] == "UNPAID"

        fee = db.query(MembershipFee).filter(MembershipFee.student_id == student.id).one()
        assert float(fee.amount_due) == 150

    def test_rejects_duplicate_balance_for_same_term(self, client, admin_headers, make_student, school_setup):
        student = make_student()
        first = client.post(
            "/api/v1/officer/balances/",
            headers=admin_headers,
            json={
                "student_id": student.student_id,
                "school_year_id": school_setup["year"].id,
                "semester": "1ST",
            },
        )
        assert first.status_code == 200, first.text

        dup = client.post(
            "/api/v1/officer/balances/",
            headers=admin_headers,
            json={
                "student_id": student.student_id,
                "school_year_id": school_setup["year"].id,
                "semester": "1ST",
            },
        )
        assert dup.status_code == 409

    def test_rejects_unknown_student(self, client, admin_headers, school_setup):
        res = client.post(
            "/api/v1/officer/balances/",
            headers=admin_headers,
            json={
                "student_id": "no-such-student",
                "school_year_id": school_setup["year"].id,
                "semester": "1ST",
            },
        )
        assert res.status_code == 404

    def test_rejects_invalid_semester(self, client, admin_headers, make_student, school_setup):
        student = make_student()
        res = client.post(
            "/api/v1/officer/balances/",
            headers=admin_headers,
            json={
                "student_id": student.student_id,
                "school_year_id": school_setup["year"].id,
                "semester": "3RD",
            },
        )
        assert res.status_code == 422

    def test_requires_admin(self, client, make_student, school_setup):
        student = make_student()
        res = client.post(
            "/api/v1/officer/balances/",
            json={
                "student_id": student.student_id,
                "school_year_id": school_setup["year"].id,
                "semester": "1ST",
            },
        )
        assert res.status_code in (401, 403)


class TestListSchoolYears:
    def test_lists_school_years_for_the_dropdown(self, client, admin_headers, school_setup):
        res = client.get("/api/v1/officer/school-years", headers=admin_headers)
        assert res.status_code == 200, res.text
        labels = [y["label"] for y in res.json()["school_years"]]
        assert school_setup["year"].label in labels


class TestCreateSchoolYear:
    def test_admin_can_add_a_new_school_year(self, client, admin_headers, school_setup):
        res = client.post(
            "/api/v1/officer/school-years",
            headers=admin_headers,
            json={"label": "2025-2026", "start_date": "2025-08-01", "end_date": "2026-05-31"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["label"] == "2025-2026"
        assert body["is_active"] is False

        labels = [y["label"] for y in client.get("/api/v1/officer/school-years", headers=admin_headers).json()["school_years"]]
        assert "2025-2026" in labels
        assert school_setup["year"].label in labels

    def test_setting_new_year_active_deactivates_the_others(self, client, admin_headers, school_setup):
        res = client.post(
            "/api/v1/officer/school-years",
            headers=admin_headers,
            json={
                "label": "2025-2026", "start_date": "2025-08-01", "end_date": "2026-05-31",
                "is_active": True,
            },
        )
        assert res.status_code == 200, res.text

        years = {y["label"]: y["is_active"] for y in client.get("/api/v1/officer/school-years", headers=admin_headers).json()["school_years"]}
        assert years["2025-2026"] is True
        assert years[school_setup["year"].label] is False

    def test_rejects_duplicate_label(self, client, admin_headers, school_setup):
        res = client.post(
            "/api/v1/officer/school-years",
            headers=admin_headers,
            json={"label": school_setup["year"].label, "start_date": "2026-08-01", "end_date": "2027-05-31"},
        )
        assert res.status_code == 409

    def test_rejects_malformed_label(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/school-years",
            headers=admin_headers,
            json={"label": "2025", "start_date": "2025-08-01", "end_date": "2026-05-31"},
        )
        assert res.status_code == 422

    def test_rejects_non_consecutive_years(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/school-years",
            headers=admin_headers,
            json={"label": "2025-2028", "start_date": "2025-08-01", "end_date": "2026-05-31"},
        )
        assert res.status_code == 422

    def test_rejects_end_before_start(self, client, admin_headers):
        res = client.post(
            "/api/v1/officer/school-years",
            headers=admin_headers,
            json={"label": "2030-2031", "start_date": "2031-08-01", "end_date": "2030-05-31"},
        )
        assert res.status_code == 422

    def test_requires_admin(self, client):
        res = client.post(
            "/api/v1/officer/school-years",
            json={"label": "2030-2031", "start_date": "2030-08-01", "end_date": "2031-05-31"},
        )
        assert res.status_code in (401, 403)
