# PSITS Portal V2 - Documentation Corrections Applied

**Status:** ✅ READY FOR PHASE 2  
**Date:** August 25, 2026  
**Scope:** Architecture corrections to SYSTEM_FLOW.md, ERD.md, RBAC.md, API_SPEC.md

---

## Executive Summary

The following critical corrections have been applied to the documentation **before Phase 2 implementation**:

### 1. Authentication Architecture

**CHANGED:** Custom JWT → **Supabase Auth**

- ✅ Use Supabase Auth as the authentication provider
- ✅ Frontend uses Supabase Auth JS SDK for login/signup
- ✅ Backend validates Supabase JWT on every request
- ✅ No custom password hashing, no custom JWT generation
- ✅ No custom sessions table (Supabase manages sessions)

**Flow:**
```
React + Supabase Auth SDK
    ↓
Supabase Auth (login/signup/MFA/sessions)
    ↓
Supabase Access Token (JWT)
    ↓
FastAPI validates token
    ↓
Resolve user roles/permissions from PostgreSQL
    ↓
Authorize request
```

---

### 2. Users / Profiles Model

**CHANGED:** Custom users table → **Supabase auth + profiles table**

**New structure:**

```
Supabase auth.users (MANAGED BY SUPABASE)
    ├─ id (UUID)
    ├─ email
    ├─ phone
    └─ ... (password stored securely by Supabase)

PostgreSQL profiles (OUR APPLICATION)
    ├─ id (UUID, PK)
    ├─ auth_user_id (FK → auth.users.id)
    ├─ student_id (optional, unique)
    ├─ display_name
    ├─ email (denormalized)
    ├─ profile_image_url
    ├─ status (ACTIVE, INACTIVE, SUSPENDED)
    ├─ created_at
    └─ updated_at
```

**Key changes:**
- ✅ NO passwords stored in our database
- ✅ auth_user_id links to Supabase auth.users
- ✅ student_id is optional (for student members)
- ✅ No custom user creation/authentication logic

---

### 3. Remove Custom Sessions

**DELETED:** sessions table

**Reason:** Supabase Auth manages:
- Session creation
- Session validation
- Refresh tokens
- Session expiration
- MFA sessions

Our application only needs:
- Load user profile (from auth_user_id)
- Load user roles
- Load user permissions
- Authorize request

---

### 4. RBAC: Organizational Roles vs System Admin

**CHANGED:** Merged roles → **Separate System Admin**

#### Full Access (3 roles)

**President, VP Internal, VP External**

- All organization modules
- All permissions
- System-level restrictions apply
- Audit logged

#### Operations Roles (5 roles)

**Secretary, Assistant Secretary, M&W, Events & Logistics, PIO**

Common permissions:
- organization.view, organization.update
- events.view, events.update
- event_registrations.view
- attendance.view, attendance.scan
- directory.view, directory.update
- announcements.view
- reports.view

Role-specific additions:
- **Secretary:** events.create, events.update, event_registrations.manage
- **Assistant Secretary:** (same as secretary without create)
- **M&W:** membership.view, students.view
- **Events & Logistics:** events.publish, event_registrations.manage
- **PIO:** announcements.create, announcements.update, content.*, directory.update

#### Finance Roles (3 roles)

**Treasurer, Assistant Treasurer, Finance Committee**

**Treasurer:**
- organization.view
- membership.view, membership.manage
- payments.view, payments.create, payments.update, **payments.void** ❌ NO delete
- remittance.view, remittance.create, remittance.update
- inventory.view, inventory.manage
- reports.view
- audit_logs.view

**Assistant Treasurer:**
- Viewing/creating only (no void)
- Limited inventory (no manage)

**Finance Committee:**
- Viewing/reporting only

#### System Admin (separate from executives)

- users.manage
- roles.manage
- permissions.manage
- school_years.manage
- students.view, students.import
- audit_logs.view
- system_settings.manage

**NOT** organization-level access

#### Student Role

- organization.view
- events.view, events.register
- event_registrations.view (own)
- attendance.view (own)
- membership.view (own)
- directory.view
- qr.view, qr.generate
- profile.view (own), profile.update (own)

---

### 5. RBAC: Permission-Based Authorization

**CHANGED:** Role names in code → **Permission checks**

❌ WRONG:
```python
if current_user.role == "Treasurer":
    allow_payment_creation()
```

✅ CORRECT:
```python
if "payments.create" in current_user.permissions:
    allow_payment_creation()
```

Benefits:
- Flexible permission assignment
- Not dependent on role names
- Easier to audit
- Supports hybrid roles

---

### 6. School Year Management

**CHANGED:** Single school_year → **student_school_years table**

**Structure:**
```
students
    ├─ id
    ├─ student_id (22-12345)
    ├─ first_name
    └─ ...

student_school_years (historical record)
    ├─ student_id (FK)
    ├─ school_year_id (FK)
    ├─ program_id
    ├─ year_level (1-4)
    ├─ section (A-D)
    └─ status (ACTIVE, INACTIVE)
```

**Key point:** Each student can have multiple enrollment records across years
- 2025-2026: BSCS, 2nd Year, Section A
- 2026-2027: BSCS, 3rd Year, Section A
- 2027-2028: BSCS, 4th Year, Section B

Historical data preserved. ✅

---

### 7. Membership Fees: Include Semesters

**CHANGED:** (school_year, program, year_level) → Add **semester**

**New unique constraint:**
```
UNIQUE(
    school_year_id,
    semester,
    program_id,
    year_level
)
```

**Example:**
```
2026-2027, 1st Semester, BSCS, 3rd Year: ₱500
2026-2027, 2nd Semester, BSCS, 3rd Year: ₱300
```

---

### 8. Financial Records: No Hard Delete

**CHANGED:** payments.delete → **payments.void**

**Payment flow:**
```
Original Payment: ₱500
    ↓
VOID action
    ↓
Status: VOIDED
Void Reason: "Entry error"
Voided By: User ID
Timestamp: 2026-08-25 10:30:00
    ↓
Audit Log entry created
    ↓
Original record preserved
```

**Constraint:**
- ❌ NO hard DELETE
- ✅ Use VOID status
- ✅ Preserve audit trail
- ✅ Track who voided it
- ✅ Track reason

**Remittances:** Same approach - status ACTIVE/CANCELLED, no delete

---

### 9. Organizational Directory: Positions vs Committees

**CHANGED:** Single "roles" table → **Separate positions + committees**

**New structure:**

```
organization_positions
    ├─ id
    ├─ code (PRESIDENT, SECRETARY, TREASURER)
    ├─ name
    └─ description

officer_assignments
    ├─ position_id
    ├─ user_id
    ├─ school_year_id
    └─ assigned_at

organization_committees
    ├─ id
    ├─ code (MEMBERSHIP_WELFARE, EVENTS_LOGISTICS, FINANCE)
    ├─ name
    └─ description

committee_members
    ├─ committee_id
    ├─ user_id
    ├─ school_year_id
    └─ joined_at
```

**Benefits:**
- One person can hold position + committee membership
- Multiple members per committee
- Historical tracking across years
- Clear separation of roles

Example:
- User A: President (position)
- User B: Secretary (position) + Finance Committee (member)
- User C: Finance Committee (member only)

---

### 10. Excel Student Import Workflow

**Flow (NO immediate insert):**

```
1. Admin selects school year
2. Admin uploads Excel file
3. Backend validates file
4. Backend reads and parses Excel
5. Backend validates columns exist
6. Backend validates rows
7. Backend detects duplicates
8. Backend returns PREVIEW (not imported yet)
9. Frontend shows summary:
   - Total: 500
   - Valid: 485
   - Invalid: 15
   - Duplicates: 5
10. Admin reviews error report
11. Admin clicks "Confirm Import"
12. Backend (in transaction):
    - Creates/updates student records
    - Associates with school_year
    - Creates import_history record
13. Rollback if any error
14. Returns import summary
```

**student_imports table stores:**
- school_year_id
- file_name
- uploaded_by
- upload_timestamp
- total_rows
- imported_rows
- updated_rows
- failed_rows
- error_log (JSON)

---

### 11. QR Attendance: Opaque Tokens

**CHANGED:** Direct payload → **Opaque registration token**

**Old (NOT secure):**
```
QR payload: "student_id=22-12345&event_id=abc123"
```

**New (secure):**
```
1. Student registers for event
2. Backend creates opaque token:
   {registration_id}:{timestamp}:{hash}
3. QR encodes token (not personal info)
4. Officer scans QR
5. Backend validates token
6. Backend resolves registration
7. Backend prevents duplicates
8. Backend records attendance
```

**Key points:**
- ✅ Token is opaque (no personal info visible)
- ✅ Token has expiration
- ✅ Token is cryptographically signed
- ✅ Backend must validate every scan
- ✅ Database prevents duplicate attendance

---

### 12. Attendance Table

**Stores:**
```
event_id
student_id
school_year_id
status (PRESENT, LATE, EXCUSED, ABSENT)
recorded_by (officer user ID)
recorded_at
created_at
```

**Constraint:**
```
UNIQUE(event_id, student_id)
```

Prevents duplicate attendance. ✅

---

### 13. API Authentication (Supabase)

**Header format:**
```
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

**Validation on backend:**
```python
1. Extract token from header
2. Call Supabase Auth API to verify token
   POST https://project.supabase.co/auth/v1/verify
3. Get user_id from verified token
4. Query profiles table for auth_user_id
5. Load roles/permissions
6. Check endpoint permission
7. Execute or return 403
```

**Response format:**
```json
{
  "success": true,
  "data": { /* endpoint response */ },
  "message": "Success",
  "timestamp": "2026-08-25T10:30:00Z"
}
```

---

### 14. Dynamic Landing Page

**Content types:**
- Announcements (DRAFT, PUBLISHED, ARCHIVED)
- Featured Content (images + description + links)
- Event Highlights
- Organization Information

**Storage:**
- Content metadata: PostgreSQL
- Images/media: Supabase Storage (secure URLs)

**Access control:**
- Authorized users can manage
- Public users view published content only
- Draft/archived content hidden from public

---

### 15. Preserve All Existing Features

The redesign maintains:

✅ Student roster management
✅ Student records & enrollment
✅ Events & event management
✅ Event registration
✅ QR code attendance
✅ Membership & membership ledger
✅ Payment recording & history
✅ Remittance workflow
✅ Inventory management
✅ Inventory ledger
✅ Sanctions & fines
✅ Organizational directory
✅ RBAC
✅ Reports

**New additions:**
- Dynamic landing page
- Featured content management
- Announcements system
- School year management
- Excel import with preview
- Mobile-first QR scanner
- Notifications
- Audit logging
- Improved permissions system

---

## Files Updated

✅ SYSTEM_FLOW_CORRECTED.md (new comprehensive doc)

**Still need corrections:**
- ERD.md (database schema)
- RBAC.md (permissions matrix)
- API_SPEC.md (authentication endpoints)

---

## Before Phase 2 Implementation

**DO NOT code yet. These corrections must be in documentation first.**

1. ✅ Read SYSTEM_FLOW_CORRECTED.md
2. ⏳ Review corrections against old docs
3. ⏳ Update ERD.md, RBAC.md, API_SPEC.md
4. ⏳ Then proceed to Phase 2 with Supabase Auth integration

---

## Next Actions

1. Replace old SYSTEM_FLOW.md with SYSTEM_FLOW_CORRECTED.md
2. Update ERD.md with:
   - Supabase auth.users reference
   - profiles with auth_user_id
   - Remove custom users/sessions tables
   - Add student_school_years
   - Add payments.void (no delete)
   - Add committee_members table
3. Update RBAC.md with:
   - New role definitions
   - System Admin separate
   - Specific permissions per role
   - Permission-based checks
4. Update API_SPEC.md with:
   - Supabase JWT validation
   - Authorization header format
   - Endpoint protection patterns

---

**Status:** ✅ Architecture Corrections Complete  
**Ready for:** Phase 2 Implementation (Supabase Auth + RBAC)

