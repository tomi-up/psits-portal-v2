# PSITS Portal V2: Student Activation & Authentication Architecture

**Status:** Design Phase - Awaiting Approval  
**Date:** August 26, 2026  
**Scope:** Student roster import, passwordless authentication, MFA enrollment, student dashboard

---

## 1. DATABASE SCHEMA

### 1.1 New Tables Required

#### Table: `school_year_semesters`
```sql
CREATE TABLE school_year_semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_year_id UUID NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
  label VARCHAR(50) NOT NULL,  -- e.g., "1st Semester", "2nd Semester"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(school_year_id, semester)
);
```

#### Table: `events`
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  event_date DATE,
  school_year_semester_id UUID NOT NULL REFERENCES school_year_semesters(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_events_school_year_semester (school_year_semester_id),
  INDEX idx_events_event_date (event_date)
);
```

#### Table: `attendance_records`
```sql
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  raw_status VARCHAR(50),  -- Original Excel value: "/", "E", "MORNING", "DAY 1", empty
  status VARCHAR(20) NOT NULL DEFAULT 'ABSENT',  -- Normalized: PRESENT, EXCUSED, ABSENT, PARTIAL
  normalized_at TIMESTAMP DEFAULT NOW(),
  recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, event_id),
  INDEX idx_attendance_student (student_id),
  INDEX idx_attendance_event (event_id),
  INDEX idx_attendance_status (status)
);
```

#### Table: `import_history`
```sql
CREATE TABLE import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type VARCHAR(50) NOT NULL,  -- 'STUDENT_ROSTER', 'ATTENDANCE'
  file_name VARCHAR(255) NOT NULL,
  file_hash VARCHAR(64) NOT NULL,
  school_year_semester_id UUID REFERENCES school_year_semesters(id) ON DELETE SET NULL,
  total_rows INT NOT NULL,
  successful_rows INT NOT NULL,
  failed_rows INT NOT NULL,
  preview_json JSONB,  -- Preview data structure (without PII)
  validation_errors JSONB,  -- Row-level validation errors
  import_status VARCHAR(20) NOT NULL,  -- PENDING, PREVIEW, CONFIRMED, COMPLETED, FAILED
  imported_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_import_history_type (import_type),
  INDEX idx_import_history_status (import_status)
);
```

#### Table: `import_rows`
```sql
CREATE TABLE import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_history_id UUID NOT NULL REFERENCES import_history(id) ON DELETE CASCADE,
  row_number INT NOT NULL,
  original_data JSONB NOT NULL,  -- Raw Excel row
  mapped_data JSONB NOT NULL,  -- Parsed/validated fields
  status VARCHAR(20) NOT NULL,  -- SUCCESS, DUPLICATE, INVALID, CONFLICT, NEW
  error_message TEXT,
  matched_student_id UUID REFERENCES students(id),  -- If existing student
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_import_rows_import_history (import_history_id),
  INDEX idx_import_rows_status (status)
);
```

#### Table: `student_mfa_secrets`
```sql
CREATE TABLE student_mfa_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  secret_encrypted VARCHAR(255) NOT NULL,  -- AES-encrypted TOTP secret (never plaintext)
  backup_codes_encrypted TEXT,  -- JSON array of encrypted backup codes
  enrolled_at TIMESTAMP,
  last_verified_at TIMESTAMP,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_student_mfa_secrets_profile (profile_id)
);
```

#### Table: `student_activation_tokens`
```sql
CREATE TABLE student_activation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA256 hash, not plaintext
  token_type VARCHAR(50) NOT NULL,  -- MFA_ENROLLMENT, MFA_RESET
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_activation_tokens_student (student_id),
  INDEX idx_activation_tokens_expires (expires_at)
);
```

### 1.2 Modified Tables

#### Table: `profiles`
**Add columns:**
```sql
ALTER TABLE profiles ADD COLUMN student_id_fk UUID UNIQUE REFERENCES students(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN mfa_required BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN mfa_enrolled_at TIMESTAMP;
ALTER TABLE profiles ADD COLUMN activation_status VARCHAR(20) DEFAULT 'PENDING';  -- PENDING, MFA_ENROLLED, ACTIVE
```

**Rationale:**
- Links Profile (Supabase auth identity) to Student (roster data)
- Tracks MFA enrollment state separate from account activation status
- Allows "student claimed but not yet MFA-enrolled" intermediate state

#### Table: `school_years`
**Modify:**
```sql
-- Add missing columns to support multiple semesters per school year
ALTER TABLE school_years ADD COLUMN current_semester INT CHECK (current_semester IN (1, 2));
```

---

## 2. ENTITY RELATIONSHIP DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION & IDENTITY                     │
├─────────────────────────────────────────────────────────────────┤

  [Supabase Auth Users]  (managed by Supabase, not in our DB)
           │
           │ auth_user_id
           ↓
      ┌─────────────┐
      │  profiles   │ ← Application-side user record
      ├─────────────┤
      │ id          │
      │ auth_user_id│◄────── Links to Supabase auth.users
      │ student_id  │
      │ student_id_ │◄────── NEW: Links to student roster
      │ activation_ │
      │ status      │
      │ mfa_required│
      │ mfa_enrolled│
      └─┬───────────┘
        │
        ├──────┬──────────┬───────────────┐
        │      │          │               │
        ↓      ↓          ↓               ↓
    [user_    [student_  [audit_        [student_mfa_
     roles]    mfa_       logs]           secrets]
              secrets]
        │
        ├────────────────────────────┐
        │                            │
        ↓                            ↓
    [roles]        [student_
     │              activation_
     │              tokens]
     ↓
[role_permissions]
     │
     ↓
[permissions]

┌─────────────────────────────────────────────────────────────────┐
│                    STUDENT ROSTER & ACADEMICS                    │
├─────────────────────────────────────────────────────────────────┤

      ┌──────────────┐
      │  students    │ ← Student roster (from Excel import)
      ├──────────────┤
      │ id           │
      │ student_id   │ (Unique identifier: NN-NNNNN)
      │ first_name   │
      │ middle_name  │
      │ last_name    │
      │ is_active    │
      └─┬────────────┘
        │
        ├────────────────────────────┬────────────────┐
        │                            │                │
        ↓                            ↓                ↓
   [student_            [attendance_          [import_rows]
    school_years]       records]
        │                    │
        │                    │
        ├─ program_id        │
        ├─ school_year_id    │
        │                    ├─ event_id
        │                    │
        ↓                    ↓
   [programs]         [events]
        │                 │
        │                 ├─ school_year_
        │                 │  semester_id
        │                 │
        ↓                 ↓
   [school_years]  [school_year_
                    semesters]

┌─────────────────────────────────────────────────────────────────┐
│                    IMPORT & AUDIT TRACKING                       │
├─────────────────────────────────────────────────────────────────┤

    ┌──────────────────┐
    │ import_history   │
    ├──────────────────┤
    │ id               │
    │ file_hash        │ (SHA256 of file, never stores actual file)
    │ import_status    │
    │ validation_errors│
    │ preview_json     │
    └─┬────────────────┘
      │
      │ 1:N
      ↓
  ┌─────────────┐
  │ import_rows │
  ├─────────────┤
  │ row_number  │
  │ status      │
  │ mapped_data │
  └─────────────┘
```

---

## 3. IMPORT MAPPING

### 3.1 Excel → Database Mapping

**Source:** PSITS_ATTENDANCE RECORD.xlsx (All year-level sheets)

| Excel Column | Data Type | Maps To | Validation | Notes |
|---|---|---|---|---|
| STUDENT ID | String | `students.student_id` | Pattern: `^\d{2}-\d{5}$` | Unique identifier |
| LAST NAME | String | `students.last_name` | 1-100 chars, trimmed | Case-insensitive match for activation |
| FIRST NAME | String | `students.first_name` | 1-100 chars, trimmed | Required |
| MIDDLE NAME | String | `students.middle_name` | 0-100 chars, nullable | Optional |
| YEAR | String | `student_school_years.year_level` | Must be 1,2,3,4 | Parsed from "1ST", "2ND", "3RD", "4TH" |
| COURSE | String | `programs.code` (foreign key) | 2-10 chars | Looked up or created |
| SECTION | String | `student_school_years.section` | 1-2 chars | e.g., "A", "B", "C" |
| [EVENT_N_HEADER] | String | → Event name lookup | → `events.name` | Event date parsed from header |
| [EVENT_N_VALUE] | String | → Attendance status | Normalized to enum | "/" = PRESENT, "E" = EXCUSED, empty = ABSENT, "MORNING"/"DAY 1" = PARTIAL |

### 3.2 Attendance Normalization Rules

```python
NORMALIZATION_RULES = {
    "/": "PRESENT",           # Slash mark = attended
    "E": "EXCUSED",           # E = excused/approved absence
    "": "ABSENT",             # Empty = did not attend
    "MORNING": "PARTIAL",     # Attended morning session only
    "DAY 1": "PARTIAL",       # Attended first day of multi-day event
    "AFTERNOON": "PARTIAL",   # Attended afternoon session
    None: "ABSENT",           # None/null = absent
}

# Always store both:
# - raw_status: Original Excel value (for audit trail)
# - status: Normalized enum (for queries/reports)
```

### 3.3 Event Extraction from Headers

**Example header:** `1ST GEN. ASSEMBLY 08/08/2025`

```
Event Name:  "1ST GEN. ASSEMBLY"
Event Date:  2025-08-08
School Year: 2025-2026 (inferred from workbook context)
Semester:    2 (inferred from "2nd SEMESTER S.Y. 2025-2026")
```

---

## 4. ATTENDANCE NORMALIZATION RULES

### 4.1 Transformation Logic

```python
class AttendanceNormalizer:
    """Configurable attendance status normalization."""
    
    @staticmethod
    def normalize(raw_value: str | None) -> str:
        """
        Normalize raw attendance value to standard enum.
        
        Args:
            raw_value: Original Excel cell value (e.g., "/", "E", "MORNING", etc.)
        
        Returns:
            Normalized status: "PRESENT", "EXCUSED", "ABSENT", "PARTIAL"
        """
        if not raw_value:
            return "ABSENT"
        
        raw_value = str(raw_value).strip().upper()
        
        # Exact matches
        if raw_value == "/":
            return "PRESENT"
        if raw_value == "E":
            return "EXCUSED"
        
        # Partial attendance keywords
        if any(kw in raw_value for kw in ["MORNING", "AFTERNOON", "DAY 1", "DAY 2"]):
            return "PARTIAL"
        
        # Default to absent if unrecognized
        return "ABSENT"
```

### 4.2 Storage Strategy

**Always store BOTH:**
- `raw_status`: Original, unmodified Excel value (for audit/compliance)
- `status`: Normalized enum (for queries/business logic)

**Example:**
```sql
-- Attendance record
INSERT INTO attendance_records (student_id, event_id, raw_status, status)
VALUES (
  'student-uuid',
  'event-uuid',
  'MORNING',        -- Original from Excel
  'PARTIAL'         -- Normalized for app logic
);
```

### 4.3 Configurable Rules

Create a configuration endpoint for admins to adjust normalization rules without code changes:

```python
# Future: /api/v1/admin/attendance-normalization-rules
# GET: Retrieve current rules
# POST: Update rules (with audit logging)
```

---

## 5. STUDENT ACTIVATION FLOW

### 5.1 UX Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                  STUDENT ACTIVATION JOURNEY                      │
└─────────────────────────────────────────────────────────────────┘

PHASE 1: IDENTITY VERIFICATION
┌──────────────────────────────────────────────────────────────────┐
│ Student navigates to /activate                                    │
│                                                                    │
│ Screen: Activation Form                                           │
│ Fields:                                                           │
│   - Student ID (e.g., 20-12345) [required]                       │
│   - Last Name [required]                                         │
│                                                                    │
│ User enters: ID + Last Name → Click "Verify"                     │
│                                                                    │
│ Backend: /api/v1/auth/student-activate/verify                    │
│   1. Look up student by student_id                               │
│   2. Compare last_name (case-insensitive)                        │
│   3. If match:                                                    │
│      - Check if already has active profile                       │
│      - Create Supabase Auth user (no password yet)               │
│      - Create activation_token (MFA_ENROLLMENT type)             │
│      - Return token (short-lived, 15 minutes)                    │
│   4. If no match: Error "Student record not found"               │
│                                                                    │
│ Response: { status: 'VERIFIED', activation_token: '...' }        │
└──────────────────────────────────────────────────────────────────┘
           ↓
PHASE 2: AUTHENTICATOR ENROLLMENT
┌──────────────────────────────────────────────────────────────────┐
│ Screen: MFA Setup                                                 │
│                                                                    │
│ Step 2a: Generate TOTP Secret                                     │
│ Backend: /api/v1/auth/student-activate/generate-mfa             │
│   1. Verify activation_token is valid & not expired              │
│   2. Generate TOTP secret (using pyotp or similar)               │
│   3. Encrypt secret before returning (AES-256)                   │
│   4. Store encrypted secret in session (not in DB yet)           │
│   5. Generate QR code for authenticator app                      │
│                                                                    │
│ Response:                                                         │
│ {                                                                 │
│   qr_code_data: "otpauth://totp/...",  -- For scanner            │
│   manual_entry_key: "XXXX XXXX XXXX...",  -- For manual entry    │
│   setup_token: "..."  -- For next step verification             │
│ }                                                                  │
│                                                                    │
│ Step 2b: User Scans/Enters Secret                                 │
│ User opens authenticator app (Google Authenticator, Authy, etc)  │
│ Scans QR code (or manually enters the key)                       │
│ Authenticator generates 6-digit code                              │
│                                                                    │
│ Step 2c: Verify TOTP Code                                         │
│ User enters 6-digit code                                         │
│ Backend: /api/v1/auth/student-activate/verify-mfa               │
│   1. Verify setup_token & activation_token                       │
│   2. Retrieve encrypted secret from session                      │
│   3. Validate 6-digit code against TOTP secret                   │
│      - Accept codes within ±1 time window (30 seconds)           │
│      - Reject if used before (prevent replay)                    │
│   4. If valid:                                                    │
│      - Encrypt TOTP secret properly                              │
│      - Save to student_mfa_secrets table                         │
│      - Generate backup codes (10x 8-digit codes)                 │
│      - Encrypt & save backup codes                               │
│      - Set Supabase Auth user password (strong random)           │
│      - Create profile with activation_status='MFA_ENROLLED'      │
│      - Update student.is_active = true                           │
│      - Delete activation_token                                    │
│      - Delete session-stored secret                               │
│   5. If invalid:                                                  │
│      - Return error, allow retry (max 5 attempts)                │
│      - After 5 failures, require identity re-verification        │
│                                                                    │
│ Response: { status: 'MFA_ENROLLED', message: '...' }             │
│                                                                    │
│ Screen: Success + Backup Codes                                    │
│ Show backup codes (plaintext, ONE TIME ONLY)                     │
│ Student MUST save/print backup codes                             │
│ Provide download option (encrypted PDF)                          │
│ Cannot show backup codes again after this screen                 │
│                                                                    │
│ After acknowledging: Redirect to /login                          │
└──────────────────────────────────────────────────────────────────┘
           ↓
PHASE 3: FIRST LOGIN
┌──────────────────────────────────────────────────────────────────┐
│ Screen: Login                                                     │
│ Fields:                                                           │
│   - Student ID [required]                                        │
│   - Authenticator Code (6-digit) [required]                      │
│                                                                    │
│ Backend: POST /api/v1/auth/student-login                         │
│   1. Look up student by student_id                               │
│   2. Get linked profile via student_id_fk                        │
│   3. Get encrypted TOTP secret from student_mfa_secrets          │
│   4. Decrypt TOTP secret                                         │
│   5. Validate 6-digit code against TOTP                          │
│      - Accept codes within ±1 time window                        │
│      - Prevent replay attacks                                    │
│   6. If valid:                                                    │
│      - Create Supabase session via Auth Admin API                │
│      - Return access_token                                       │
│      - Log audit: "student_login" (no PII logged)               │
│   7. If invalid:                                                  │
│      - Increment failed_attempts counter                         │
│      - After 5 failures: lock account for 15 minutes             │
│      - Return error                                               │
│                                                                    │
│ Response: { access_token: "...", user: {...} }                   │
│                                                                    │
│ Frontend: Store token, redirect to /dashboard                    │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 State Machine

```
Student States:
┌──────────────┐
│   PENDING    │ ← Created during import, not yet activated
├──────────────┤
│  - No Supabase user account
│  - No profile
│  - Can only view "/activate" page
│  - Receives identity verification form
└──────────────┘
        │ Identity verified, MFA setup initiated
        ↓
┌──────────────────┐
│  MFA_ENROLLMENT  │ ← In progress, temporary state
├──────────────────┤
│  - Supabase Auth user created (no password)
│  - TOTP secret in session (not persisted)
│  - Activation token valid
│  - Cannot login yet
└──────────────────┘
        │ TOTP code verified, MFA enrolled
        ↓
┌──────────────────┐
│ ACTIVE           │ ← Fully activated
├──────────────────┤
│  - Profile created & linked to student
│  - TOTP secret encrypted in student_mfa_secrets
│  - Backup codes generated
│  - Can login with student_id + authenticator_code
│  - Can access dashboard
└──────────────────┘
```

### 5.3 API Endpoints

```
POST /api/v1/auth/student-activate/verify
  Request: { student_id, last_name }
  Response: { activation_token, expires_in_seconds }
  Status: 200 (success), 404 (not found), 409 (already activated)

POST /api/v1/auth/student-activate/generate-mfa
  Headers: { Authorization: Bearer <activation_token> }
  Response: { qr_code_data, manual_entry_key, setup_token }
  Status: 200 (success), 401 (invalid token), 410 (expired)

POST /api/v1/auth/student-activate/verify-mfa
  Headers: { Authorization: Bearer <activation_token> }
  Request: { setup_token, totp_code }
  Response: { status, backup_codes }  # backup_codes shown ONCE
  Status: 201 (success), 401 (invalid), 429 (too many attempts)

POST /api/v1/auth/student-login
  Request: { student_id, authenticator_code }
  Response: { access_token, expires_in, user }
  Status: 200 (success), 401 (invalid), 429 (locked)

GET /api/v1/auth/me
  Headers: { Authorization: Bearer <access_token> }
  Response: { profile, roles, permissions }
  Status: 200 (success), 401 (unauthorized)
```

---

## 6. AUTHENTICATION ARCHITECTURE

### 6.1 Supabase Auth Integration (Passwordless)

**Current State:**
- Supabase Auth manages credentials
- Frontend uses `supabase.auth.signInWithPassword()`
- Backend validates tokens via `validate_supabase_token()`

**Proposed Change:**
- **Remove** password-based login from student flow
- **Add** student ID + TOTP code login
- **Keep** Supabase Auth as identity provider (manages user accounts, credentials, sessions)
- **Add** custom passwordless endpoint that:
  1. Validates student ID + TOTP
  2. Creates Supabase session without requiring password
  3. Returns access token to frontend

### 6.2 TOTP Implementation

**DO NOT** implement custom TOTP storage or generation.

**Use:** Supabase Auth's built-in MFA capabilities:
- **Option 1** (Preferred): Supabase's native MFA API
  - Let Supabase manage TOTP secrets
  - Use Supabase's MFA verification endpoints
  - Query MFA status from Supabase
  - **Advantage:** Encrypted at rest in Supabase
  - **Limitation:** Student ID-based login won't work with Supabase's standard flow

- **Option 2** (Fallback): Store encrypted TOTP in app DB
  - If Supabase MFA doesn't support student-ID-based flows
  - Encrypt secrets with AES-256
  - Never store plaintext
  - Keep in separate `student_mfa_secrets` table
  - **Limitation:** Requires app-level encryption key management

### 6.3 Session Management

**Flow:**
```
1. Student validates ID + TOTP → Backend
2. Backend validates TOTP against stored secret
3. Backend calls Supabase Admin API to create session
   - Use service_role key (backend only)
   - Create session for the corresponding auth.users row
4. Backend returns access_token to frontend
5. Frontend stores token (Supabase SDK handles storage)
6. Frontend uses token for subsequent requests
7. Backend validates token on each request
```

**Why not custom JWT:**
- Supabase JWT is already implemented
- Backend already validates via `validate_supabase_token()`
- No need to reinvent session management
- Supabase handles token expiry, refresh, revocation

### 6.4 Officer/Admin Authentication

**Keep unchanged:**
- Officers/admins use email-based Supabase Auth
- They signup via Supabase normally (or auto-created by admin)
- Roles assigned via `user_roles` table
- Permissions resolved via `role_permissions`

**No change to current flow** — only students use TOTP-based login.

---

## 7. SECURITY MODEL

### 7.1 Data Isolation

| User Type | Can Access | Authorization Mechanism |
|---|---|---|
| Student | Own profile, attendance, balance, sanctions | `/me` endpoints + row-level auth via `profiles.id` |
| Officer | Student data (assigned to their events), own profile | Role + permission checks |
| Admin | All data | SYSTEM_ADMIN role |
| Anonymous | None | Not authenticated |

### 7.2 Secrets & Encryption

| Secret | Storage | Encryption | Key Management |
|---|---|---|---|
| TOTP Secret | `student_mfa_secrets.secret_encrypted` | AES-256 | Environment variable, rotated by ops |
| Backup Codes | `student_mfa_secrets.backup_codes_encrypted` | AES-256 | Same as TOTP secret |
| Supabase Service Role Key | `.env` (backend only) | — | Not exposed to frontend |
| Database Credentials | `.env` | — | Not exposed to frontend |
| Excel File (source) | Local/external | — | Never committed to repo |

### 7.3 Audit Trail

**Always log (without PII):**
```
{
  action: "student_login",
  student_id_hashed: "<SHA256 hash>",  # NOT plaintext ID
  success: true/false,
  ip_address: "203.0.113.1",
  timestamp: "2026-08-26T10:30:00Z",
  reason_if_failed: "invalid_totp"
}
```

**Never log:**
- Student names
- Student IDs (use hashed)
- TOTP codes
- Passwords
- Backup codes
- Full email addresses (hash or truncate)

### 7.4 Rate Limiting

| Endpoint | Limit | Window | Action |
|---|---|---|---|
| `/student-activate/verify` | 5 requests | 15 min | Throttle IP |
| `/student-activate/verify-mfa` | 5 attempts | Per session | Lock enrollment, require re-verify |
| `/student-login` | 5 failures | 15 min | Lock account, require MFA reset |
| `/auth/verify` | 100 requests | 1 hour | Throttle IP |

### 7.5 Token Expiry

| Token Type | TTL | Refresh? |
|---|---|---|
| Supabase access token | 1 hour (default) | Yes, via refresh token |
| Activation token | 15 minutes | No, must restart flow |
| Setup token (MFA setup) | 15 minutes | No, must restart MFA enrollment |

---

## 8. STUDENT DASHBOARD API DESIGN

### 8.1 Endpoints (GET /me-style)

All endpoints return **only the authenticated student's data**.

```
GET /api/v1/students/me
  Response: {
    id, student_id, first_name, middle_name, last_name,
    program, year_level, section,
    profile: { auth_user_id, email, status },
    mfa_enrolled_at,
    created_at
  }

GET /api/v1/students/me/attendance
  Query: ?event_id=<uuid> &school_year_semester_id=<uuid> &status=PRESENT
  Response: [
    {
      event: { id, name, date },
      raw_status, status, recorded_at
    }
  ]

GET /api/v1/students/me/balance
  Response: {
    student_id,
    total_due, total_paid, balance,
    ledger_entries: [
      {
        date, description, amount, type (DEBIT/CREDIT),
        recorded_by_name (officer)
      }
    ]
  }

GET /api/v1/students/me/sanctions
  Response: [
    {
      id, date, reason, status (ACTIVE/RESOLVED),
      issued_by_name
    }
  ]

GET /api/v1/students/me/events
  Response: [
    {
      event: { id, name, date },
      attendance_status
    }
  ]
```

### 8.2 Authorization

**Backend implementation:**
```python
@router.get("/me")
async def get_student_profile(current_user = Depends(get_current_user)):
    # current_user = authenticated Profile
    student = db.query(Student).filter(
        Student.id == current_user.student_id_fk  # ← NOT from frontend
    ).first()
    
    if not student:
        raise UnauthorizedException("No student profile linked")
    
    return student  # Only return authenticated user's data

@router.get("/me/attendance")
async def get_my_attendance(
    current_user = Depends(get_current_user),
    event_id: str | None = None
):
    # Derive student identity from token
    student_id = current_user.student_id_fk  # ← NOT from query param
    
    query = db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == student_id
    )
    
    if event_id:
        query = query.filter(AttendanceRecord.event_id == event_id)
    
    return query.all()
```

**Never do this:**
```python
# ❌ WRONG: Trusting frontend student_id
@router.get("/students/{student_id}/attendance")
async def get_attendance(student_id: str, current_user = Depends(get_current_user)):
    # An attacker could request another student's ID
    return db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == student_id  # ← Vulnerable!
    ).all()
```

---

## 9. IMPORT VALIDATION & PREVIEW DESIGN

### 9.1 Import Flow (Admin UI)

```
┌─────────────────────────────────────────────────────────────────┐
│                   ADMIN IMPORT WORKFLOW                          │
└─────────────────────────────────────────────────────────────────┘

STEP 1: FILE UPLOAD
┌──────────────────────────────────────────────────────────────────┐
│ Screen: Choose File                                              │
│                                                                   │
│ Admin: Drag & drop or select Excel file                         │
│ Backend: POST /api/v1/admin/import/validate-file                │
│   1. Accept multipart file upload                                │
│   2. Validate file:                                               │
│      - File size < 10MB                                          │
│      - File extension = .xlsx                                    │
│      - File MIME type = application/vnd.ms-excel                │
│   3. Calculate file hash (SHA256)                                │
│   4. Check for duplicate imports                                 │
│      - If same hash exists & already completed: error            │
│      - If same hash pending: reuse import session               │
│   5. Parse Excel:                                                 │
│      - Read sheet names                                          │
│      - Validate column structure                                 │
│      - Count data rows                                           │
│   6. Save to import_history table (status='PENDING')             │
│   7. Return: { import_id, file_hash, summary }                   │
│                                                                   │
│ Response: { import_id, total_rows, sheet_summary }              │
└──────────────────────────────────────────────────────────────────┘
         ↓
STEP 2: VALIDATION & MAPPING
┌──────────────────────────────────────────────────────────────────┐
│ Backend: POST /api/v1/admin/import/<import_id>/validate        │
│   1. Parse each row:                                              │
│      - Extract student_id, last_name, first_name, etc.          │
│      - Validate format (student_id pattern, required fields)     │
│      - Look up program by course code                            │
│      - Parse year_level from YEAR column                         │
│      - Validate event names against database                     │
│      - Normalize attendance values                               │
│   2. For each row, determine status:                              │
│      - "NEW": Never seen this student_id before                  │
│      - "DUPLICATE": Multiple rows with same student_id           │
│      - "EXISTING": Student already in database                   │
│      - "CONFLICT": Same student_id, different name/program       │
│      - "INVALID": Missing required fields, bad format           │
│   3. Store each row in import_rows table                         │
│   4. Aggregate validation errors                                 │
│   5. Update import_history (status='PREVIEW')                    │
│                                                                   │
│ Response: { validation_errors, summary, preview_data }          │
└──────────────────────────────────────────────────────────────────┘
         ↓
STEP 3: PREVIEW
┌──────────────────────────────────────────────────────────────────┐
│ Screen: Import Preview                                           │
│                                                                   │
│ Display:                                                          │
│   - Summary: "579 students, 3 duplicates, 2 invalid rows"       │
│   - Validation Errors (collapsible):                             │
│     Row 42: "Invalid student ID format"                          │
│     Row 137: "Student already exists (20-00034)"                 │
│   - Preview Table (first 20 rows, no PII):                       │
│     StudentID | LastName | Program | Year | Status              │
│     (masked)  | (masked) | BLIS   | 4    | EXISTING             │
│     (masked)  | (masked) | CS     | 2    | NEW                  │
│   - Options: "Correct & Reupload" OR "Confirm & Import"        │
│     (Only available if 0 errors)                                │
└──────────────────────────────────────────────────────────────────┘
         ↓
STEP 4: CONFIRMATION
┌──────────────────────────────────────────────────────────────────┐
│ Screen: Confirm Import                                           │
│                                                                   │
│ Checklist (admin must acknowledge):                              │
│   ☑ I have verified the preview above                            │
│   ☑ I have backed up the production database                     │
│   ☑ I understand this action cannot be undone                    │
│   ☑ I confirm proceeding with import                             │
│                                                                   │
│ Action: "Proceed with Import" button                             │
│                                                                   │
│ Backend: POST /api/v1/admin/import/<import_id>/confirm          │
│   1. Verify import_history.status == 'PREVIEW'                  │
│   2. Verify confirmation checksum (prevent replay)               │
│   3. Begin database transaction                                  │
│   4. For each row with status='NEW' or 'EXISTING':               │
│      - Create/update student record                              │
│      - Create student_school_year record                         │
│      - Create events (if not exist)                              │
│      - Create attendance_records                                 │
│   5. For rows with status='DUPLICATE' or 'CONFLICT':             │
│      - Do NOT import (require manual resolution)                │
│   6. Commit transaction                                          │
│   7. Update import_history (status='COMPLETED')                  │
│   8. Log audit: "import_completed" (summary only, no PII)       │
│                                                                   │
│ Response: { status, imported_count, skipped_count }              │
└──────────────────────────────────────────────────────────────────┘
         ↓
STEP 5: COMPLETION
┌──────────────────────────────────────────────────────────────────┐
│ Screen: Success                                                  │
│                                                                   │
│ Display:                                                          │
│   ✓ Import completed successfully                                │
│   - 579 students imported                                        │
│   - 0 duplicates skipped (manual review required)                │
│   - 2 invalid rows skipped                                       │
│   - Timestamp: 2026-08-26 10:30:00 UTC                          │
│   - Imported by: admin@example.com                               │
│   - Action: Export import report (CSV/PDF)                       │
│                                                                   │
│ Next steps: Students can now activate via /activate             │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 API Endpoints

```
POST /api/v1/admin/import/validate-file
  Content-Type: multipart/form-data
  File: <binary xlsx>
  Response: {
    import_id: "<uuid>",
    file_hash: "<sha256>",
    summary: {
      total_rows: 579,
      sheets: ["1st", "2nd", "3rd", "4th"]
    }
  }
  Status: 201 (success), 400 (invalid), 413 (too large), 409 (duplicate)

POST /api/v1/admin/import/<import_id>/validate
  Response: {
    import_id,
    validation_errors: [
      { row: 42, field: "student_id", message: "Invalid format" },
      { row: 137, field: "student_id", message: "Already exists" }
    ],
    summary: {
      total_rows: 579,
      valid_rows: 577,
      new_students: 450,
      existing_students: 127,
      duplicates: 2,
      invalid: 2
    },
    can_confirm: false  # true only if invalid & duplicate counts are 0
  }

POST /api/v1/admin/import/<import_id>/confirm
  Request: { confirmation_checksum }
  Response: {
    status: "COMPLETED",
    imported_count: 577,
    skipped_count: 2,
    completed_at: "<timestamp>"
  }
  Status: 202 (in progress), 409 (already completed)

GET /api/v1/admin/import/<import_id>
  Response: Full import record + import_rows

GET /api/v1/admin/import
  Query: ?limit=20 &offset=0 &status=COMPLETED
  Response: Paginated list of imports
```

### 9.3 Non-PII Preview

**Never show in preview:**
- Student names
- Student IDs (use position index or masked hash)
- Email addresses
- Contact numbers
- Any personally identifiable information

**Safe to show:**
- Program/course code
- Year level
- Section letter
- Import status per row
- Validation errors (field name, not value)
- Row counts and aggregates

---

## 10. IMPLEMENTATION SEQUENCE

### Phase 1: Database Schema
- [ ] Create new tables: `school_year_semesters`, `events`, `attendance_records`, `import_history`, `import_rows`, `student_mfa_secrets`, `student_activation_tokens`
- [ ] Modify tables: Add columns to `profiles`, `school_years`
- [ ] Create indexes
- [ ] Write Alembic migrations

### Phase 2: Import Pipeline
- [ ] Build validation logic
- [ ] Build import preview endpoint
- [ ] Build confirmation & transaction logic
- [ ] Test with sample data (NO real student data yet)

### Phase 3: Activation Flow
- [ ] Build student identity verification endpoint
- [ ] Build TOTP secret generation & encryption
- [ ] Build TOTP verification endpoint
- [ ] Build backup code generation
- [ ] Test activation flow (no real students)

### Phase 4: Login
- [ ] Build passwordless login endpoint (student_id + TOTP)
- [ ] Integrate with Supabase Admin API
- [ ] Add rate limiting & lockout logic
- [ ] Test login flow

### Phase 5: Dashboard
- [ ] Build `/me` endpoints for student profile
- [ ] Build `/me/attendance` endpoint
- [ ] Build `/me/balance` endpoint (integrate with membership ledger)
- [ ] Build `/me/sanctions` endpoint
- [ ] Frontend: Student dashboard UI

### Phase 6: Testing & Security Review
- [ ] Security review of authentication flow
- [ ] Penetration testing of import pipeline
- [ ] Load testing of validation endpoints
- [ ] User acceptance testing with sample data

### Phase 7: Production Import
- [ ] Final validation of real Excel file
- [ ] Admin performs import with real data
- [ ] Verification of imported data
- [ ] Student activation begins

---

## 11. ROLLBACK & RECOVERY

### 11.1 If Import Fails

```sql
-- Rollback entire import (all changes in transaction)
-- All import_rows status='FAILED'
-- No student data modified
-- No attendance records created
-- No profiles created
-- Only import_history record remains as audit trail
```

### 11.2 If Need to Re-import

```sql
-- Same file hash will be detected
-- Admin can choose to:
--   (a) Reuse same import session (view preview again)
--   (b) Delete import & start fresh (creates new import_id)
```

### 11.3 If Activation Fails

```
Student can:
  1. Request admin reset of MFA enrollment
  2. Admin verifies student identity
  3. Admin calls: DELETE student_mfa_secrets, DELETE student_activation_tokens
  4. Student restarts activation from identity verification
```

---

## 12. GLOSSARY

| Term | Definition |
|---|---|
| **Activation** | Process of linking Supabase Auth account to student roster & enrolling in MFA |
| **TOTP** | Time-based One-Time Password (e.g., 6-digit codes from authenticator) |
| **MFA** | Multi-Factor Authentication (password + TOTP) |
| **Setup Token** | Short-lived token used during MFA enrollment setup |
| **Activation Token** | Short-lived token granting access to activation endpoints |
| **Backup Codes** | Emergency 8-digit codes for account recovery if MFA device is lost |
| **Passwordless** | No password in student login flow (only ID + TOTP) |
| **Raw Status** | Original Excel value (e.g., "/", "MORNING") |
| **Normalized Status** | Standard enum (e.g., "PRESENT", "PARTIAL") |
| **Import Preview** | Non-modifiable preview of parsed data before confirmation |
| **Duplicate** | Multiple rows in same import with same Student ID |
| **Conflict** | Same Student ID, different name or program |

---

## NEXT STEPS

1. **Review & Approve** this design document
2. **Address clarifications** (e.g., Supabase MFA vs. app-level TOTP)
3. **Create Alembic migrations** for new schema
4. **Implement Phase 1** (database)
5. **Implement Phase 2** (import pipeline)
6. ... (continue sequentially)

**Do NOT import real student data until:**
- [ ] All phases completed
- [ ] Security review passed
- [ ] Tested with sample data
- [ ] Admin & ops teams trained
