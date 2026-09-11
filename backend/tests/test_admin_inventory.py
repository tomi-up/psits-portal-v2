"""Admin inventory tracking, matching the chapter's real Property Inventory
report: Forwarded items (carried over from the previous administration) vs
New items (acquired under the current one)."""

from app.models.inventory import InventoryItem


def _create(client, headers, **overrides):
    body = {
        "school_year_id": overrides.pop("school_year_id"),
        "semester": "1ST",
        "record_type": "NEW",
        "item_name": "Projector",
        "date_purchased": "2026-09-01T00:00:00",
        "cost": 15000,
        "fund_source": "PSITS Funds",
        "previous_accountable_officer": None,
        "current_accountable_officer": "President",
        "memorandum_receipt_number": None,
        "recorded_by": "Juan Dela Cruz",
    }
    body.update(overrides)
    return client.post("/api/v1/officer/inventory/", json=body, headers=headers)


class TestRecordTypeValidation:
    def test_new_item_succeeds_without_a_previous_officer(self, client, admin_headers, school_setup):
        res = _create(client, admin_headers, school_year_id=school_setup["year"].id)
        assert res.status_code == 200, res.text
        assert res.json()["record_type"] == "NEW"
        assert res.json()["previous_accountable_officer"] is None

    def test_new_item_rejects_a_previous_officer(self, client, admin_headers, school_setup):
        res = _create(
            client,
            admin_headers,
            school_year_id=school_setup["year"].id,
            previous_accountable_officer="Old President",
        )
        assert res.status_code == 400

    def test_forwarded_item_requires_a_previous_officer(self, client, admin_headers, school_setup):
        res = _create(
            client,
            admin_headers,
            school_year_id=school_setup["year"].id,
            record_type="FORWARDED",
            previous_accountable_officer=None,
        )
        assert res.status_code == 400

    def test_forwarded_item_succeeds_with_both_officers(self, client, admin_headers, school_setup):
        res = _create(
            client,
            admin_headers,
            school_year_id=school_setup["year"].id,
            record_type="FORWARDED",
            previous_accountable_officer="Old President",
            current_accountable_officer="New President",
        )
        assert res.status_code == 200, res.text
        assert res.json()["previous_accountable_officer"] == "Old President"
        assert res.json()["current_accountable_officer"] == "New President"

    def test_invalid_record_type_rejected(self, client, admin_headers, school_setup):
        res = _create(client, admin_headers, school_year_id=school_setup["year"].id, record_type="BORROWED")
        assert res.status_code == 422

    def test_invalid_semester_rejected(self, client, admin_headers, school_setup):
        res = _create(client, admin_headers, school_year_id=school_setup["year"].id, semester="3RD")
        assert res.status_code == 422


class TestDonatedOrFreebieItemsAllowNullCostAndDate:
    def test_n_a_cost_and_date_are_accepted(self, client, admin_headers, school_setup):
        res = _create(
            client,
            admin_headers,
            school_year_id=school_setup["year"].id,
            date_purchased=None,
            cost=None,
            fund_source="Donation from Alumni",
        )
        assert res.status_code == 200, res.text
        assert res.json()["date_purchased"] is None
        assert res.json()["cost"] is None
        assert res.json()["fund_source"] == "Donation from Alumni"

    def test_fund_source_is_free_text_not_an_enum(self, client, admin_headers, school_setup):
        for source in ["PSITS Funds", "Donation from Alumni", "Freebie from purchasing soc shirts and lanyards"]:
            res = _create(client, admin_headers, school_year_id=school_setup["year"].id, fund_source=source)
            assert res.status_code == 200, res.text
            assert res.json()["fund_source"] == source


class TestMemorandumReceiptNumber:
    def test_optional(self, client, admin_headers, school_setup):
        res = _create(client, admin_headers, school_year_id=school_setup["year"].id)
        assert res.json()["memorandum_receipt_number"] is None

    def test_can_be_set_manually(self, client, admin_headers, school_setup):
        res = _create(
            client, admin_headers, school_year_id=school_setup["year"].id, memorandum_receipt_number="USM-PSITS-2026-045"
        )
        assert res.json()["memorandum_receipt_number"] == "USM-PSITS-2026-045"

    def test_suggest_endpoint_continues_the_sequence(self, client, admin_headers, school_setup):
        _create(client, admin_headers, school_year_id=school_setup["year"].id, memorandum_receipt_number="USM-PSITS-2026-045")
        suggestion = client.get("/api/v1/officer/inventory/suggest-number?year=2026", headers=admin_headers)
        assert suggestion.json()["memorandum_receipt_number"] == "USM-PSITS-2026-046"


class TestInventoryCrud:
    def test_list_and_filter(self, client, admin_headers, school_setup):
        _create(client, admin_headers, school_year_id=school_setup["year"].id, record_type="NEW")
        _create(
            client,
            admin_headers,
            school_year_id=school_setup["year"].id,
            record_type="FORWARDED",
            previous_accountable_officer="Old President",
            item_name="Old Banner",
        )

        listed = client.get("/api/v1/officer/inventory/", headers=admin_headers).json()
        assert len(listed["items"]) == 2

        new_only = client.get("/api/v1/officer/inventory/?record_type=NEW", headers=admin_headers).json()
        assert len(new_only["items"]) == 1
        assert new_only["items"][0]["item_name"] == "Projector"

        forwarded_only = client.get(
            "/api/v1/officer/inventory/?record_type=FORWARDED", headers=admin_headers
        ).json()
        assert len(forwarded_only["items"]) == 1
        assert forwarded_only["items"][0]["item_name"] == "Old Banner"

    def test_update(self, client, admin_headers, school_setup):
        created = _create(client, admin_headers, school_year_id=school_setup["year"].id).json()

        res = client.put(
            f"/api/v1/officer/inventory/{created['id']}",
            json={
                "school_year_id": school_setup["year"].id,
                "semester": "2ND",
                "record_type": "NEW",
                "item_name": "Projector (updated)",
                "date_purchased": "2026-09-01T00:00:00",
                "cost": 16000,
                "fund_source": "PSITS Funds",
                "previous_accountable_officer": None,
                "current_accountable_officer": "Vice President",
                "memorandum_receipt_number": None,
                "recorded_by": "Maria Santos",
            },
            headers=admin_headers,
        )
        assert res.status_code == 200, res.text
        assert res.json()["semester"] == "2ND"
        assert res.json()["item_name"] == "Projector (updated)"
        assert res.json()["current_accountable_officer"] == "Vice President"
        assert res.json()["recorded_by"] == "Maria Santos"

    def test_delete(self, client, admin_headers, db, school_setup):
        created = _create(client, admin_headers, school_year_id=school_setup["year"].id).json()

        res = client.delete(f"/api/v1/officer/inventory/{created['id']}", headers=admin_headers)
        assert res.status_code == 200
        assert db.query(InventoryItem).count() == 0

    def test_requires_admin(self, client):
        assert client.get("/api/v1/officer/inventory/").status_code == 401

    def test_list_school_years(self, client, admin_headers, school_setup):
        res = client.get("/api/v1/officer/inventory/school-years", headers=admin_headers)
        assert res.status_code == 200
        labels = [y["label"] for y in res.json()["school_years"]]
        assert "2026-2027" in labels
