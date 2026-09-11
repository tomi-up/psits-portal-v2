"""Admin management of physical inventory items - matches the chapter's
actual Property Inventory report (Forwarded / New Property sections)."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, field_validator

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.inventory import InventoryItem
from app.models.student import SchoolYear

router = APIRouter(
    prefix="/officer/inventory", tags=["admin-inventory"], dependencies=[Depends(get_current_admin)]
)

VALID_SEMESTERS = {"1ST", "2ND"}
VALID_RECORD_TYPES = {"FORWARDED", "NEW"}
MEMO_PREFIX = "USM-PSITS"


class SchoolYearOption(BaseModel):
    id: str
    label: str
    is_active: bool


@router.get("/school-years")
def list_school_years(db: Session = Depends(get_db)):
    """For the school year dropdown on the inventory form - every year on
    file, not just the active one, since inventory can be logged retroactively."""
    years = db.query(SchoolYear).order_by(SchoolYear.start_date.desc()).all()
    return {
        "school_years": [
            SchoolYearOption(id=y.id, label=y.label, is_active=y.is_active) for y in years
        ]
    }


def _next_memo_number(db: Session, year: int) -> str:
    """USM-PSITS-{year}-{seq}, continuing from the highest existing sequence
    for that year. Purely a convenience suggestion - the field is optional
    ("if applicable" on the real form), so this is never forced."""
    prefix = f"{MEMO_PREFIX}-{year}-"
    existing = (
        db.query(InventoryItem)
        .filter(InventoryItem.memorandum_receipt_number.like(f"{prefix}%"))
        .all()
    )

    max_seq = 0
    for item in existing:
        suffix = (item.memorandum_receipt_number or "")[len(prefix):]
        if suffix.isdigit():
            max_seq = max(max_seq, int(suffix))

    return f"{prefix}{max_seq + 1:03d}"


@router.get("/suggest-number")
def suggest_memo_number(year: int, db: Session = Depends(get_db)):
    return {"memorandum_receipt_number": _next_memo_number(db, year)}


class InventoryCreateRequest(BaseModel):
    school_year_id: str
    semester: str
    record_type: str
    item_name: str
    date_purchased: datetime | None = None
    cost: float | None = None
    fund_source: str
    previous_accountable_officer: str | None = None
    current_accountable_officer: str
    memorandum_receipt_number: str | None = None
    recorded_by: str

    @field_validator("semester")
    @classmethod
    def valid_semester(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in VALID_SEMESTERS:
            raise ValueError(f"semester must be one of {sorted(VALID_SEMESTERS)}")
        return v

    @field_validator("record_type")
    @classmethod
    def valid_record_type(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in VALID_RECORD_TYPES:
            raise ValueError(f"record_type must be one of {sorted(VALID_RECORD_TYPES)}")
        return v

    @field_validator("item_name", "fund_source", "current_accountable_officer", "recorded_by")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field is required")
        return v


class InventoryUpdateRequest(InventoryCreateRequest):
    pass


class InventoryRow(BaseModel):
    id: str
    school_year_id: str
    school_year_label: str
    semester: str
    record_type: str
    item_name: str
    date_purchased: datetime | None
    cost: float | None
    fund_source: str
    previous_accountable_officer: str | None
    current_accountable_officer: str
    memorandum_receipt_number: str | None
    recorded_by: str
    created_at: datetime


def _validate_record_type_fields(record_type: str, previous_officer: str | None) -> None:
    if record_type == "FORWARDED" and not (previous_officer and previous_officer.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Previous accountable officer is required for a forwarded item",
        )
    if record_type == "NEW" and previous_officer and previous_officer.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A newly acquired item has no previous accountable officer",
        )


def _to_row(item: InventoryItem) -> InventoryRow:
    return InventoryRow(
        id=item.id,
        school_year_id=item.school_year_id,
        school_year_label=item.school_year.label if item.school_year else "(deleted)",
        semester=item.semester,
        record_type=item.record_type,
        item_name=item.item_name,
        date_purchased=item.date_purchased,
        cost=float(item.cost) if item.cost is not None else None,
        fund_source=item.fund_source,
        previous_accountable_officer=item.previous_accountable_officer,
        current_accountable_officer=item.current_accountable_officer,
        memorandum_receipt_number=item.memorandum_receipt_number,
        recorded_by=item.recorded_by,
        created_at=item.created_at,
    )


@router.get("/")
def list_inventory(
    school_year_id: str | None = None,
    semester: str | None = None,
    record_type: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(InventoryItem).options(joinedload(InventoryItem.school_year))
    if school_year_id:
        query = query.filter(InventoryItem.school_year_id == school_year_id)
    if semester:
        query = query.filter(InventoryItem.semester == semester.upper())
    if record_type:
        query = query.filter(InventoryItem.record_type == record_type.upper())

    items = query.order_by(InventoryItem.created_at.desc()).all()
    return {"items": [_to_row(i) for i in items]}


@router.post("/")
def create_inventory_item(body: InventoryCreateRequest, db: Session = Depends(get_db)):
    _validate_record_type_fields(body.record_type, body.previous_accountable_officer)

    school_year = db.query(SchoolYear).filter(SchoolYear.id == body.school_year_id).first()
    if not school_year:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found")

    item = InventoryItem(
        school_year_id=body.school_year_id,
        semester=body.semester,
        record_type=body.record_type,
        item_name=body.item_name,
        date_purchased=body.date_purchased,
        cost=body.cost,
        fund_source=body.fund_source,
        previous_accountable_officer=(body.previous_accountable_officer or "").strip() or None,
        current_accountable_officer=body.current_accountable_officer,
        memorandum_receipt_number=(body.memorandum_receipt_number or "").strip() or None,
        recorded_by=body.recorded_by,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return _to_row(item)


@router.put("/{item_id}")
def update_inventory_item(item_id: str, body: InventoryUpdateRequest, db: Session = Depends(get_db)):
    _validate_record_type_fields(body.record_type, body.previous_accountable_officer)

    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

    school_year = db.query(SchoolYear).filter(SchoolYear.id == body.school_year_id).first()
    if not school_year:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="School year not found")

    item.school_year_id = body.school_year_id
    item.semester = body.semester
    item.record_type = body.record_type
    item.item_name = body.item_name
    item.date_purchased = body.date_purchased
    item.cost = body.cost
    item.fund_source = body.fund_source
    item.previous_accountable_officer = (body.previous_accountable_officer or "").strip() or None
    item.current_accountable_officer = body.current_accountable_officer
    item.memorandum_receipt_number = (body.memorandum_receipt_number or "").strip() or None
    item.recorded_by = body.recorded_by

    db.commit()
    db.refresh(item)

    return _to_row(item)


@router.delete("/{item_id}")
def delete_inventory_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    db.delete(item)
    db.commit()
    return {"status": "DELETED"}
