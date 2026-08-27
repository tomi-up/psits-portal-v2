# PSITS V2 — Current Student Excel Importer

**Local processing and validation only.** This tool does not touch Supabase,
does not touch the application database, and does not write anything back
to the source workbook. It stops after producing a local preview + report.

```
Excel -> local processing -> normalization -> validation -> preview/report -> STOP
```

## What it does

- Reads `private_data/PSITS_ATTENDANCE_SY_2026-2027.xlsx` (read-only — never
  saved back to).
- Processes the four student-year sheets (matched by `1ST` / `2ND` / `3RD` /
  `4TH` appearing in the sheet name — the real workbook uses `"1ST YR"`,
  `"2ND YR"`, etc., not the literal strings `"1st"`/`"2nd"`).
- Skips any sheet with `OFFICER` in its name (the real workbook has
  `PSITS_OFFICERS`) — reported as `SKIPPED — OUT OF SCOPE`, never parsed.
- Extracts only the identity columns: `STUDENT ID`, `LAST NAME`,
  `FIRST NAME`, `MIDDLE NAME`, `YEAR`, `COURSE`, `SECTION`. Attendance/event
  columns to the right of these (per-semester GA columns, balance/sanctions,
  etc.) are never read.
- Normalizes names (trim, collapse whitespace, uppercase); preserves
  `student_id`, `course`, and `year_level` exactly as sourced (no guessing,
  no auto-correction).
- Validates required fields, Student ID format (`NN-NNNNN`), and whether
  `YEAR` matches the sheet it's in.
- **Over Stay (OS):** the 4th-year sheet's `YEAR` column contains either
  `4TH` or the literal value `OS`. `OS` is preserved as-is — it is **not**
  treated as invalid, not excluded, and not rewritten to `4TH`. It's counted
  separately in the report.
- Detects duplicate Student IDs (within a sheet and across sheets) and flags
  which duplicates actually **conflict** (different name/course/section on
  the same ID) — these require manual review, and this tool never guesses
  which record is correct.
- Writes a validation report and a normalized CSV preview to
  `private_data/import_preview/` (gitignored, since `private_data/` as a
  whole is ignored).
- Prints a terminal summary — aggregate counts only. It never dumps the full
  roster or prints bulk student names/IDs to the terminal.

## What it deliberately does NOT do

- No Supabase client is imported anywhere in this tool.
- No database writes of any kind (no insert/update/delete/upsert).
- No changes to `students`, `profiles`, auth, roles, or permissions.
- No processing of the `PSITS_OFFICERS` sheet (future work).
- No import of attendance/event columns (future work — separate from the
  current-roster importer).
- No changes to the source `.xlsx` file.

## Running it

```bash
cd scripts/student_import
python import_students.py
```

Optionally point it at a different workbook:

```bash
python import_students.py path/to/other_workbook.xlsx
```

Requires `openpyxl` (no other third-party dependencies, and no dependency
on the backend's virtualenv or `requirements`/`pyproject.toml` — this tool
is intentionally independent of the main application).

## Output

- `private_data/import_preview/validation_report.txt` — the same report
  printed to the terminal, saved for reference.
- `private_data/import_preview/normalized_students_preview.csv` — every
  extracted record (valid and invalid), with `is_valid`, `is_over_stay`, and
  a semicolon-joined `issues` column for anything flagged. **Contains real
  student data — never commit this file** (it's under `private_data/`,
  which is gitignored).

## Files

- `import_students.py` — orchestrates load -> extract -> normalize ->
  validate -> report -> preview. Entry point.
- `normalize.py` — pure field-level normalization functions, no I/O.
- `validate.py` — validation rules, duplicate/conflict detection, no I/O.

## Known data-quality findings (from the current workbook)

- One Student ID (`25-10515`) appears in both `1ST YR` and `2ND YR` with
  differing details — flagged as a conflict requiring manual review.
- Four rows in `2ND YR` have a populated name but a **blank** Student ID
  cell in the source workbook — flagged as invalid (`MISSING_REQUIRED_FIELD`)
  rather than silently dropped.
- `2ND YR`, `3RD YR`, and `4TH YR` have no `BSIT` group this cycle (only
  `1ST YR` does) — this is a workbook data fact, not a tool error.
