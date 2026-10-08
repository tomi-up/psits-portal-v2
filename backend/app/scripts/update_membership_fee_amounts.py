"""Correct membership fee amounts to the org's actual dues:

- 2026-2027 (freshmen's year): 100 pesos per semester - already the
  default on creation, this is just confirming/backfilling any stragglers.
- 2025-2026 (2nd-4th year backfill): 200 pesos per semester - these were
  created at the old 100 default by retarget_membership_fees_by_year.py,
  which only moved which school year the fee belonged to, not its amount.

Only amount_due is touched; amount_paid is left exactly as-is. A student who
already paid in full under the old (wrong) amount will correctly show a
remaining balance afterward rather than having their payment silently
inflated to match.

Dry-run by default; --commit to actually write.
"""

import argparse
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.balance import MembershipFee
from app.models.student import SchoolYear

AMOUNTS_BY_YEAR_LABEL = {
    "2026-2027": Decimal("100.00"),
    "2025-2026": Decimal("200.00"),
}


def update(commit: bool) -> None:
    engine = create_engine(settings.database_url, pool_pre_ping=True, hide_parameters=True)
    with Session(engine) as db:
        try:
            counts: dict[str, int] = {}
            for label, amount in AMOUNTS_BY_YEAR_LABEL.items():
                school_year = db.query(SchoolYear).filter(SchoolYear.label == label).first()
                if not school_year:
                    raise ValueError(f"School year {label} does not exist")

                fees = (
                    db.query(MembershipFee)
                    .filter(MembershipFee.school_year_id == school_year.id)
                    .filter(MembershipFee.amount_due != amount)
                    .all()
                )
                for fee in fees:
                    fee.amount_due = amount
                counts[label] = len(fees)

            if not commit:
                db.rollback()
        except Exception:
            db.rollback()
            raise
        else:
            if commit:
                db.commit()

        print(f"Mode: {'COMMITTED' if commit else 'DRY RUN (rolled back)'}")
        for label, amount in AMOUNTS_BY_YEAR_LABEL.items():
            print(f"{label}: {counts[label]} fee rows updated to {amount}")
    engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Commit changes; default is rollback")
    args = parser.parse_args()
    update(args.commit)
