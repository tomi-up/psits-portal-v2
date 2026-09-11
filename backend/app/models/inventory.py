"""Physical inventory owned by the org, matching the chapter's actual
Property Inventory report: items either FORWARDED from the previous
administration, or newly acquired (NEW) under the current one - scoped to a
school year + semester the same way membership fees already are.
"""

from sqlalchemy import Column, String, ForeignKey, DateTime, Numeric, Index
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class InventoryItem(BaseModel):
    """One line of the Property Inventory report.

    FORWARDED items carry both previous_accountable_officer (who held it
    under the last administration) and current_accountable_officer (who
    holds it now). NEW items - acquired under the current administration -
    only ever have current_accountable_officer; there is no "previous" to
    record.

    date_purchased and cost are both nullable: the real form writes literal
    "n/a" for donated or freebie items, which a null column represents the
    same way. fund_source stays free text ("PSITS Funds", "Donation from
    Alumni", "Freebie from purchasing soc shirts and lanyards", ...) rather
    than a fixed bought/donated enum, because that is genuinely how varied
    the org's real entries are.

    recorded_by is a plain text field rather than an AdminAccount FK: the
    chapter currently records inventory from a single shared admin login, so
    there is no real per-admin identity to attribute this to yet. This is a
    deliberate placeholder pending real per-officer admin accounts.
    """

    __tablename__ = "inventory_items"

    school_year_id = Column(String(36), ForeignKey("school_years.id", ondelete="CASCADE"), nullable=False)
    semester = Column(String(10), nullable=False)  # "1ST" or "2ND"
    record_type = Column(String(20), nullable=False)  # "FORWARDED" or "NEW"

    item_name = Column(String(255), nullable=False)
    date_purchased = Column(DateTime, nullable=True)  # null == "n/a" on the paper form
    cost = Column(Numeric(10, 2), nullable=True)  # null == "n/a" on the paper form
    fund_source = Column(String(255), nullable=False)  # e.g. "PSITS Funds", "Donation from Alumni"

    previous_accountable_officer = Column(String(255), nullable=True)  # FORWARDED only
    current_accountable_officer = Column(String(255), nullable=False)

    memorandum_receipt_number = Column(String(50), nullable=True)  # optional - "if applicable"
    recorded_by = Column(String(255), nullable=False)

    school_year = relationship("SchoolYear")

    __table_args__ = (
        Index("ix_inventory_items_school_year", "school_year_id"),
        Index("ix_inventory_items_record_type", "record_type"),
    )

    def __repr__(self):
        return f"<InventoryItem(item_name={self.item_name}, record_type={self.record_type})>"
