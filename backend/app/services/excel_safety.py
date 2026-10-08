"""Shared guard against spreadsheet formula injection: a cell value starting
with =, +, -, or @ is interpreted as a formula by Excel/LibreOffice/Sheets
on open, regardless of what openpyxl's own data type says it is. Any export
column that can contain student-submitted or otherwise externally-supplied
text needs to go through this before being written."""

from typing import Any

FORMULA_TRIGGER_CHARS = ("=", "+", "-", "@")


def safe_cell_value(value: Any) -> Any:
    if isinstance(value, str) and value.startswith(FORMULA_TRIGGER_CHARS):
        return "'" + value
    return value
