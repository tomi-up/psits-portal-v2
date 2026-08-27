"""Field-level normalization for the current-student roster importer.

Every function here is a pure string transform - no I/O, no workbook access,
no database access. Keeping this separate from extraction/validation makes
each rule easy to verify in isolation before it ever touches real data.
"""

from dataclasses import dataclass


def normalize_name(value) -> str | None:
    """Trim, collapse internal whitespace, and uppercase a name field."""
    if value is None:
        return None
    value = str(value).strip()
    value = " ".join(value.split())
    if not value:
        return None
    return value.upper()


def normalize_whitespace(value) -> str | None:
    """Trim + collapse whitespace WITHOUT changing case (course, section)."""
    if value is None:
        return None
    value = str(value).strip()
    value = " ".join(value.split())
    if not value:
        return None
    return value


def normalize_student_id(value) -> str | None:
    """Preserve the Student ID exactly as sourced (only strips stray
    whitespace) - validity is checked separately in validate.py, never
    silently corrected here."""
    if value is None:
        return None
    value = str(value).strip()
    return value or None


@dataclass
class NormalizedStudent:
    student_id: str | None
    last_name: str | None
    first_name: str | None
    middle_name: str | None
    year_level: str | None
    course: str | None
    section: str | None
    source_sheet: str
    source_row: int


def normalize_student(raw: dict, source_sheet: str, source_row: int) -> NormalizedStudent:
    """raw is the extracted {student_id, last_name, first_name, middle_name,
    year_level, course, section} dict straight from the worksheet cells."""
    return NormalizedStudent(
        student_id=normalize_student_id(raw.get("student_id")),
        last_name=normalize_name(raw.get("last_name")),
        first_name=normalize_name(raw.get("first_name")),
        middle_name=normalize_name(raw.get("middle_name")),
        # YEAR is preserved verbatim (uppercased/trimmed only) - this is the
        # field that carries the "OS" designation in the 4th-year sheet, and
        # we must not guess/rewrite it. See section 11 of the import spec.
        year_level=normalize_whitespace(raw.get("year_level")),
        course=normalize_whitespace(raw.get("course")),
        section=normalize_whitespace(raw.get("section")),
        source_sheet=source_sheet,
        source_row=source_row,
    )
