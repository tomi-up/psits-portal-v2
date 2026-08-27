# Student Roster Import: Excel → Database Mapping

**Source:** PSITS_ATTENDANCE RECORD.xlsx  
**Target:** `students`, `student_school_years`, `events`, `attendance_records` tables  
**Import Status:** Ready for design review (DO NOT IMPORT REAL DATA YET)

---

## 1. Field Mapping Reference

### Identity Fields

| Excel Column | DB Table | DB Column | Type | Validation | Mapping Logic |
|---|---|---|---|---|---|
| STUDENT ID | `students` | `student_id` | String(20) | `^\d{2}-\d{5}$` | Direct copy, trim whitespace |
| LAST NAME | `students` | `last_name` | String(100) | 1-100 chars | Trim, uppercase for matching |
| FIRST NAME | `students` | `first_name` | String(100) | 1-100 chars, required | Trim |
| MIDDLE NAME | `students` | `middle_name` | String(100) | 0-100 chars | Trim, nullable |

### Academic Fields

| Excel Column | DB Table | DB Column | Type | Validation | Mapping Logic |
|---|---|---|---|---|---|
| YEAR | `student_school_years` | `year_level` | INT | 1, 2, 3, or 4 | "1ST"→1, "2ND"→2, "3RD"→3, "4TH"→4 |
| COURSE | `programs` | `code` | String(10) | 2-10 chars | Lookup or create if not exist |
| SECTION | `student_school_years` | `section` | String(10) | 1-2 chars | Trim, e.g., "A", "B" |

### Attendance Fields

| Excel Column | DB Table | DB Column (raw) | DB Column (norm) | Type | Mapping Logic |
|---|---|---|---|---|---|
| [EVENT_N] | `events` | `name` | — | String(255) | Extracted from column header |
| [EVENT_N_VALUE] | `attendance_records` | `raw_status` | `status` | String(50) / Enum | Apply normalization rules |

---

## 2. School Year & Semester Mapping

### Workbook Metadata

```
Source Workbook: "2nd SEMESTER S.Y. 2025-2026"

Maps to:
  school_years.label = "2025-2026"
  school_year_semesters.semester = 2
  school_year_semesters.label = "2nd Semester"
```

### Pre-Import Requirements

**Before importing, ensure these records exist:**

```sql
INSERT INTO school_years (label, start_date, end_date, is_active)
VALUES ('2025-2026', '2025-08-01', '2026-07-31', FALSE)
ON CONFLICT DO NOTHING;

INSERT INTO school_year_semesters (school_year_id, semester, label, start_date, end_date)
SELECT id, 2, '2nd Semester', '2026-01-01', '2026-05-31'
FROM school_years WHERE label = '2025-2026'
ON CONFLICT DO NOTHING;
```

---

## 3. Event Extraction & Mapping

### Example: Extract from Column Header

**Input Excel Header:**  
```
1ST GEN. ASSEMBLY 08/08/2025
```

**Parsing Steps:**
1. Remove trailing date: `"1ST GEN. ASSEMBLY 08/08/2025"` → `"1ST GEN. ASSEMBLY"`
2. Extract date: `08/08/2025` → `2025-08-08`
3. Lookup/create event:
   ```sql
   INSERT INTO events (name, event_date, school_year_semester_id)
   SELECT
     '1ST GEN. ASSEMBLY',
     '2025-08-08',
     sys.school_year_semesters.id
   FROM school_year_semesters
   WHERE semester = 2 AND school_year_id IN (
     SELECT id FROM school_years WHERE label = '2025-2026'
   )
   ON CONFLICT (name, event_date) DO NOTHING;
   ```

### All Events (from Workbook Inspection)

| Event Name | Date | Extracted From | Year Levels |
|---|---|---|---|
| 1ST GEN. ASSEMBLY | 2025-08-08 | Header | All |
| CLEAN-UP DRIVE | 2025-09-12 | Header | All |
| CEIT FIESTA 2025 | Unknown | Header (no date) | All |
| PASIKLABAN 2025 | Unknown | Header (no date) | All |
| GDG DEVFEST2025 | 2025-10-11 | Header | All |
| Meeting for Blockchain Event 2025 | 2025-10-20 | Header | 3rd only |
| INDUSTRY READINESS SEMINAR | 2025-10-18 | Header | 4th only |
| FIRST BLOCK: Gateway to Blockchain | 2025-10-27 | Header (sub-row) | All |
| 1ST SEMESTRAL MEETING | 2025-12-12 | Header | All |
| PAUNAHAI: GAME ON | 2026-02-20 | Header | All |
| COTABATO ICT SUMMIT: PITCHING COMPETITION | 2026-03-02 | Header | All |
| COTABATO ICT SUMMIT: EXHIBIT | 2026-03-03 | Header | All |
| ONLINE SEMESTRAL MEETING | 2026-05-29 | Header | All |

---

## 4. Attendance Status Normalization

### Normalization Rules

```python
NORMALIZATION_MAP = {
    # Exact matches
    "/": "PRESENT",           # Slash = attended
    "E": "EXCUSED",           # E = excused absence
    "": "ABSENT",             # Empty = didn't attend
    None: "ABSENT",           # None/null = absent
    
    # Pattern matches (case-insensitive)
    r"MORNING": "PARTIAL",    # Morning session only
    r"AFTERNOON": "PARTIAL",  # Afternoon session only
    r"DAY\s+1": "PARTIAL",    # First day of multi-day event
    r"DAY\s+2": "PARTIAL",    # Second day of multi-day event
    r"START": "PARTIAL",      # Started but incomplete
    r"PRESENT": "PRESENT",    # Explicit "PRESENT" text
}

def normalize(raw_value: str | None) -> str:
    """Normalize attendance value to enum."""
    if raw_value is None or raw_value == "":
        return "ABSENT"
    
    raw = str(raw_value).strip().upper()
    
    # Exact match first
    if raw in NORMALIZATION_MAP:
        return NORMALIZATION_MAP[raw]
    
    # Pattern match
    for pattern, normalized in NORMALIZATION_MAP.items():
        if pattern.startswith("r\""):  # Regex pattern
            if re.search(pattern[2:-1], raw):
                return normalized
    
    # Default to ABSENT for unrecognized
    return "ABSENT"
```

### Examples

| Raw Value | Normalized | Stored As |
|---|---|---|
| `/` | PRESENT | `raw_status="/", status="PRESENT"` |
| `E` | EXCUSED | `raw_status="E", status="EXCUSED"` |
| ` ` (space) | ABSENT | `raw_status=" ", status="ABSENT"` |
| `MORNING` | PARTIAL | `raw_status="MORNING", status="PARTIAL"` |
| `DAY 1` | PARTIAL | `raw_status="DAY 1", status="PARTIAL"` |
| (empty cell) | ABSENT | `raw_status="", status="ABSENT"` |
| `START` | PARTIAL | `raw_status="START", status="PARTIAL"` |

---

## 5. Row-by-Row Import Logic

### Algorithm: Process Single Row

```python
class StudentRosterImporter:
    def process_row(self, row_data: dict, import_id: str) -> ImportRowResult:
        """
        Process a single Excel row.
        
        Args:
            row_data: Parsed row from Excel (column name → value)
            import_id: Reference to import_history.id
        
        Returns:
            ImportRowResult with status, errors, and mapped data
        """
        result = ImportRowResult()
        mapped_data = {}
        errors = []
        
        # 1. VALIDATE & MAP IDENTITY FIELDS
        student_id = row_data.get('STUDENT ID', '').strip()
        if not student_id:
            errors.append("STUDENT ID is required")
        elif not re.match(r'^\d{2}-\d{5}$', student_id):
            errors.append(f"STUDENT ID format invalid: {student_id}")
        else:
            mapped_data['student_id'] = student_id
        
        last_name = row_data.get('LAST NAME', '').strip().upper()
        if not last_name:
            errors.append("LAST NAME is required")
        else:
            mapped_data['last_name'] = last_name
        
        first_name = row_data.get('FIRST NAME', '').strip()
        if not first_name:
            errors.append("FIRST NAME is required")
        else:
            mapped_data['first_name'] = first_name
        
        middle_name = row_data.get('MIDDLE NAME', '').strip() or None
        mapped_data['middle_name'] = middle_name
        
        # 2. VALIDATE & MAP ACADEMIC FIELDS
        year_str = row_data.get('YEAR', '').strip().upper()
        year_map = {"1ST": 1, "2ND": 2, "3RD": 3, "4TH": 4}
        year_level = year_map.get(year_str)
        if year_level is None:
            errors.append(f"Invalid YEAR: {year_str}")
        else:
            mapped_data['year_level'] = year_level
        
        course_code = row_data.get('COURSE', '').strip()
        if not course_code:
            errors.append("COURSE is required")
        else:
            # Lookup program (or flag for manual review)
            program = db.query(Program).filter(
                Program.code.ilike(course_code)
            ).first()
            if not program:
                errors.append(f"Unknown program code: {course_code}")
            else:
                mapped_data['program_id'] = program.id
        
        section = row_data.get('SECTION', '').strip() or None
        mapped_data['section'] = section
        
        # 3. ATTENDANCE VALUES
        attendance_mappings = {}
        for col_name, col_value in row_data.items():
            if col_name in ['SEQ. NO.', 'STUDENT ID', 'LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'YEAR', 'COURSE', 'SECTION']:
                continue  # Skip identity/academic columns
            
            # This is an event column
            event_name = self._extract_event_name(col_name)
            raw_status = str(col_value).strip() if col_value else ""
            normalized_status = self._normalize_attendance(raw_status)
            
            attendance_mappings[event_name] = {
                'raw_status': raw_status,
                'status': normalized_status
            }
        
        mapped_data['attendance'] = attendance_mappings
        
        # 4. DETERMINE ROW STATUS
        if errors:
            result.status = "INVALID"
            result.error_message = "; ".join(errors)
            return result
        
        # Check for duplicate in same import
        duplicate_rows = db.query(ImportRow).filter(
            ImportRow.import_history_id == import_id,
            ImportRow.mapped_data['student_id'].astext == student_id
        ).all()
        if duplicate_rows:
            result.status = "DUPLICATE"
            result.error_message = f"Student {student_id} appears {len(duplicate_rows) + 1} times in this import"
            return result
        
        # Check if student already exists
        existing_student = db.query(Student).filter(
            Student.student_id == student_id
        ).first()
        if existing_student:
            # Check for conflict: same ID, different name/program?
            if (existing_student.last_name.upper() != last_name or
                existing_student.first_name != first_name):
                result.status = "CONFLICT"
                result.error_message = f"Student ID {student_id} exists with different name"
                result.matched_student_id = existing_student.id
                result.mapped_data = mapped_data
                return result
            else:
                result.status = "EXISTING"
        else:
            result.status = "NEW"
        
        result.mapped_data = mapped_data
        return result
```

---

## 6. Database Insert Logic (Transaction)

### Pseudocode: Commit Import

```python
async def commit_import(import_id: str, db: Session):
    """
    Commit import to database. Must run in transaction.
    If any error occurs, entire transaction rolls back.
    """
    try:
        import_record = db.query(ImportHistory).get(import_id)
        if import_record.import_status != "PREVIEW":
            raise ValueError("Import not in PREVIEW state")
        
        # Get school year/semester (hardcoded for now)
        semester = db.query(SchoolYearSemester).filter(
            SchoolYearSemester.semester == 2,
            SchoolYearSemester.school_year.has(SchoolYear.label == "2025-2026")
        ).first()
        
        import_rows = db.query(ImportRow).filter(
            ImportRow.import_history_id == import_id,
            ImportRow.status.in_(["NEW", "EXISTING"])  # Skip DUPLICATE/INVALID
        ).all()
        
        for import_row in import_rows:
            mapped = import_row.mapped_data
            
            # 1. CREATE OR UPDATE STUDENT
            student = db.query(Student).filter(
                Student.student_id == mapped['student_id']
            ).first()
            
            if not student:
                student = Student(
                    student_id=mapped['student_id'],
                    first_name=mapped['first_name'],
                    middle_name=mapped['middle_name'],
                    last_name=mapped['last_name'],
                    is_active=True
                )
                db.add(student)
                db.flush()  # Get ID before next insert
            
            # 2. CREATE STUDENT_SCHOOL_YEAR RECORD
            ssy = StudentSchoolYear(
                student_id=student.id,
                school_year_id=semester.school_year_id,
                program_id=mapped['program_id'],
                year_level=mapped['year_level'],
                section=mapped['section'],
                status="ACTIVE",
                enrolled_at=func.now()
            )
            db.add(ssy)
            db.flush()
            
            # 3. CREATE EVENTS (if not exist)
            for event_name, attendance_data in mapped['attendance'].items():
                event = db.query(Event).filter(
                    Event.name == event_name,
                    Event.school_year_semester_id == semester.id
                ).first()
                
                if not event:
                    event = Event(
                        name=event_name,
                        event_date=self._extract_date(event_name),
                        school_year_semester_id=semester.id
                    )
                    db.add(event)
                    db.flush()
                
                # 4. CREATE ATTENDANCE RECORD
                attendance = AttendanceRecord(
                    student_id=student.id,
                    event_id=event.id,
                    raw_status=attendance_data['raw_status'],
                    status=attendance_data['status'],
                    normalized_at=func.now()
                )
                db.add(attendance)
            
            # Update import row status
            import_row.status = "IMPORTED"
            import_row.matched_student_id = student.id
        
        # Mark import as completed
        import_record.import_status = "COMPLETED"
        import_record.completed_at = func.now()
        import_record.successful_rows = len(import_rows)
        
        db.commit()
        
    except Exception as e:
        db.rollback()
        import_record.import_status = "FAILED"
        import_record.error_message = str(e)
        db.commit()
        raise
```

---

## 7. Officer Handling

### Officers Sheet Structure

The "PSITS OFFICERS" sheet has slightly different columns:
- Columns 1-8: Same as student sheets (STUDENT ID, LAST NAME, etc.)
- Column 9: POSITION (e.g., "President", "Treasurer")
- Columns 10+: Attendance (limited)

### Import Logic for Officers

```python
def process_officer_row(self, row_data: dict) -> ImportRowResult:
    """
    Process officer/staff row.
    
    Officers are treated as:
    1. Students first (matching by STUDENT ID)
    2. Then linked to organization via POSITION
    """
    result = self.process_row(row_data)  # Standard student processing
    
    if result.status not in ["NEW", "EXISTING"]:
        return result  # Invalid row, don't process position
    
    position = row_data.get('POSITION', '').strip()
    if not position:
        result.errors.append("POSITION is required for officer row")
        return result
    
    # Position handling (future enhancement)
    result.mapped_data['position'] = position
    result.mapped_data['is_officer'] = True
    
    return result
```

**Post-Import:**
Admins manually assign roles/permissions to officer accounts after import.

---

## 8. Validation Rules Summary

| Field | Required | Format | Examples | Error Message |
|---|---|---|---|---|
| STUDENT ID | Yes | `^\d{2}-\d{5}$` | 20-00034, 26-12345 | "Invalid student ID format" |
| LAST NAME | Yes | 1-100 chars | Santos, Dela Cruz | "Last name is required" |
| FIRST NAME | Yes | 1-100 chars | Juan, Maria | "First name is required" |
| MIDDLE NAME | No | 0-100 chars | (empty), A., de los Santos | N/A |
| YEAR | Yes | 1ST, 2ND, 3RD, 4TH | 4TH | "Invalid year level" |
| COURSE | Yes | 2-10 chars | BLIS, CS | "Unknown program code" |
| SECTION | No | 1-2 chars | A, B, AB | N/A |
| Attendance | No | See normalization | /, E, MORNING | Defaults to ABSENT |

---

## 9. Deduplication Strategy

### Pre-Import Check

```sql
-- Check for duplicates WITHIN the import
SELECT student_id, COUNT(*) as count
FROM import_rows
WHERE import_history_id = <import_id>
GROUP BY student_id
HAVING count > 1;
```

### Post-Import Conflict Resolution

If the same student ID appears in different imports:
- Old import row is not modified (immutable)
- New import can either:
  - **SKIP**: Don't re-import (keep old data)
  - **UPDATE**: Replace with new data (audit trail via import_history)
  - **CONFLICT**: Flag for manual review

---

## 10. Audit Trail

### Logged Events

```sql
-- What gets logged
INSERT INTO audit_logs (action, entity_type, entity_id, details)
VALUES (
  'import.completed',
  'import',
  <import_id>,
  {
    "file_hash": "<sha256>",
    "total_rows": 579,
    "successful_rows": 577,
    "failed_rows": 2,
    "imported_by": "<profile_id>",
    "timestamp": "2026-08-26T10:30:00Z"
  }
);

-- What is NOT logged
-- - Student names (privacy)
-- - Student IDs (privacy)
-- - Original Excel file content (too large)
-- - File path or location (security)
```

---

## 11. Testing Checklist

**Before importing real data:**

- [ ] Validation correctly rejects invalid student IDs
- [ ] Validation correctly detects duplicates within import
- [ ] Validation correctly detects existing students
- [ ] Preview shows correct row counts (new, existing, invalid, duplicate)
- [ ] Event extraction correctly parses headers and dates
- [ ] Attendance normalization correctly applies rules
- [ ] Transaction rolls back on any error (test with duplicate constraint)
- [ ] Import history records all details correctly
- [ ] No PII logged in audit trail
- [ ] File hash prevents re-importing same file
- [ ] Officer rows processed correctly
- [ ] Backup codes: Can successfully decrypt after import
- [ ] Performance: Import 579 students in < 30 seconds

---

## 12. Troubleshooting

| Issue | Likely Cause | Solution |
|---|---|---|
| "Unknown program code: BLIS" | Program not in database | Admin creates program before import |
| "Student appears 2 times in import" | Duplicate row in Excel | Remove duplicate row, re-upload |
| "Student ID 20-00034 exists with different name" | CONFLICT status | Admin reviews & either skips or forces update |
| "Import already exists" | File hash matches completed import | Use existing import data or delete & re-upload |
| Import progress stuck at "VALIDATING" | Long-running validation | Check server logs, may need to increase timeout |
| "Attachment record creation failed: CONSTRAINT" | Event not created properly | Check event_date extraction logic |

---

## NEXT STEPS

1. ✅ Review this mapping document
2. ✅ Confirm event dates & extraction logic
3. ⬜ Create Alembic migrations for schema
4. ⬜ Implement validator (`StudentRosterValidator`)
5. ⬜ Implement importer (`StudentRosterImporter`)
6. ⬜ Test with sample Excel (NO real data)
7. ⬜ Perform security review
8. ⬜ Admin & ops training
9. ⬜ Import real PSITS_ATTENDANCE RECORD.xlsx

**DO NOT PROCEED TO STEP 6 WITHOUT SIGN-OFF ON THIS DOCUMENT.**
