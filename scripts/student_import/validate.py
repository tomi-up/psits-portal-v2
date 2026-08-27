"""Validation rules for normalized student records.

Nothing here mutates a record - every function only reports issues. Invalid
rows are kept in the output (flagged), never silently dropped or corrected,
per the import spec's "do not silently discard/correct" rules.
"""

import re
from dataclasses import dataclass, field

from normalize import NormalizedStudent

STUDENT_ID_PATTERN = re.compile(r"^\d{2}-\d{5}$")

# Sheet label -> the YEAR value we expect students in that sheet to carry.
# "OS" (Over Stay) is a known, allowed alternate value ONLY for the 4th-year
# sheet - see section 11 of the import spec. It is reported separately, not
# treated as a mismatch.
EXPECTED_YEAR_BY_SHEET = {
    "1ST YR": "1ST",
    "2ND YR": "2ND",
    "3RD YR": "3RD",
    "4TH YR": "4TH",
}

REQUIRED_FIELDS = ["student_id", "last_name", "first_name", "year_level", "course", "section"]


@dataclass
class ValidationIssue:
    code: str
    message: str
    source_sheet: str
    source_row: int


@dataclass
class ValidatedStudent:
    record: NormalizedStudent
    issues: list[ValidationIssue] = field(default_factory=list)
    is_over_stay: bool = False

    @property
    def is_valid(self) -> bool:
        return len(self.issues) == 0


def validate_student(record: NormalizedStudent) -> ValidatedStudent:
    issues: list[ValidationIssue] = []
    sheet, row = record.source_sheet, record.source_row

    for field_name in REQUIRED_FIELDS:
        if not getattr(record, field_name):
            issues.append(
                ValidationIssue(
                    code="MISSING_REQUIRED_FIELD",
                    message=f"Missing required field '{field_name}'",
                    source_sheet=sheet,
                    source_row=row,
                )
            )

    if record.student_id and not STUDENT_ID_PATTERN.match(record.student_id):
        issues.append(
            ValidationIssue(
                code="INVALID_STUDENT_ID_FORMAT",
                message=f"Student ID does not match NN-NNNNN format: '{record.student_id}'",
                source_sheet=sheet,
                source_row=row,
            )
        )

    is_over_stay = False
    expected_year = EXPECTED_YEAR_BY_SHEET.get(sheet)
    if record.year_level and expected_year:
        if sheet == "4TH YR" and record.year_level.upper() == "OS":
            is_over_stay = True
        elif record.year_level.upper() != expected_year:
            issues.append(
                ValidationIssue(
                    code="YEAR_SHEET_MISMATCH",
                    message=(
                        f"YEAR column value '{record.year_level}' does not match "
                        f"sheet '{sheet}' (expected '{expected_year}')"
                    ),
                    source_sheet=sheet,
                    source_row=row,
                )
            )

    return ValidatedStudent(record=record, issues=issues, is_over_stay=is_over_stay)


def detect_duplicates(validated: list[ValidatedStudent]) -> dict[str, list[ValidatedStudent]]:
    """Group records by student_id where more than one occurrence exists -
    covers both within-sheet and cross-sheet duplicates in one pass."""
    by_id: dict[str, list[ValidatedStudent]] = {}
    for v in validated:
        sid = v.record.student_id
        if not sid:
            continue
        by_id.setdefault(sid, []).append(v)
    return {sid: group for sid, group in by_id.items() if len(group) > 1}


def detect_conflicts(duplicate_groups: dict[str, list[ValidatedStudent]]) -> dict[str, list[ValidatedStudent]]:
    """Of the duplicate Student IDs, which ones disagree on name/course/section?
    These require manual review - we never guess which record is correct."""
    conflicts = {}
    for sid, group in duplicate_groups.items():
        signatures = {
            (v.record.last_name, v.record.first_name, v.record.course, v.record.section) for v in group
        }
        if len(signatures) > 1:
            conflicts[sid] = group
    return conflicts
