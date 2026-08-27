# PSITS Portal V2 - Entity Relationship Diagram (CORRECTED)

**Status:** Supabase Auth integration applied  
**Date:** August 25, 2026

---

## Key Architectural Changes

✅ **Supabase auth.users** - External identity provider (NOT our responsibility)  
✅ **profiles** - Links auth_user_id to application data (NO passwords)  
✅ **student_school_years** - Preserves enrollment history  
✅ **payments.void()** - No hard deletes, preserve audit trail  
✅ **remittance_items** - Links payments to remittances  
✅ **committee_members** - Separate from officer positions  

---

## Entity Relationship Diagram

```
EXTERNAL: Supabase Auth
┌──────────────────────┐
│   auth.users         │ ← External (managed by Supabase)
├──────────────────────┤
│ id (UUID)            │
│ email (UNIQUE)       │
│ phone                │
│ password_hash        │ ← Supabase manages
│ email_verified_at    │
│ created_at           │
└────────────┬─────────┘
             │ 
             │ Referenced by
             ↓
┌──────────────────────────────────────────────────────┐
│              OUR APPLICATION DATABASE                │
├──────────────────────────────────────────────────────┤

AUTHORIZATION & PROFILES
┌────────────────────┐         ┌──────────────────┐
│    profiles        │────────→│  auth.users      │
├────────────────────┤         │  (FK: id)        │
│ id (UUID, PK)      │         └──────────────────┘
│ auth_user_id ──────┘
│ student_id (UNIQUE, nullable)
│ display_name
│ email (denormalized)
│ profile_image_url
│ status (ACTIVE/INACTIVE/SUSPENDED)
│ created_at
│ updated_at
└────────────┬─────────────────────────────────────────────┐
             │                                             │
             │ (1 to many)                                 │
             ↓                                             │
    ┌──────────────────────┐                               │
    │   user_roles         │                               │
    ├──────────────────────┤                               │
    │ user_id (FK) ────────┘───────→ profiles              │
    │ role_id (FK) ─────→ roles      │
    │ assigned_at          │         │
    └──────────────────────┘         │
             │                       │
             ↓                       │
    ┌──────────────────────┐         │
    │     roles            │         │
    ├──────────────────────┤         │
    │ id (UUID, PK)        │         │
    │ code (UNIQUE)        │         │
    │ name                 │         │
    │ description          │         │
    │ is_active            │         │
    │ order                │         │
    └────────────┬─────────┘         │
                 │                   │
                 │ (many-to-many)    │
                 ↓                   │
    ┌──────────────────────────┐    │
    │  role_permissions        │    │
    ├──────────────────────────┤    │
    │ role_id (FK) ────┐       │    │
    │ permission_id ───┼───────┼────┘
    │ (FK)             │       │
    │ granted_at       │       │
    └──────────────────┼───────┘
                       │
                       ↓
         ┌─────────────────────────┐
         │   permissions           │
         ├─────────────────────────┤
         │ id (UUID, PK)           │
         │ code (UNIQUE)           │
         │ description             │
         │ category                │
         └─────────────────────────┘

ACADEMIC DOMAIN
┌────────────────────────┐
│   school_years         │
├────────────────────────┤
│ id (UUID, PK)          │
│ label (UNIQUE)         │ ← "2026-2027"
│ start_date             │
│ end_date               │
│ is_active              │
│ created_at             │
└────────────┬───────────┘
             │
             │ (1 to many)
             ↓
┌──────────────────────────────────────────┐
│   programs                               │
├──────────────────────────────────────────┤
│ id (UUID, PK)                            │
│ code (UNIQUE) ← "BSCS", "BSIS", "BLIS"  │
│ name                                     │
│ description                              │
└────────────┬────────────────────────────┬┘
             │                            │
             │ (1 to many)                │
             ↓                            ↓
┌──────────────────────┐      ┌───────────────────┐
│     students         │      │ student_school_   │
├──────────────────────┤      │ years             │
│ id (UUID, PK)        │←─ ┬──├───────────────────┤
│ student_id (UNIQUE)  │   │  │ id (UUID, PK)     │
│ first_name           │   │  │ student_id (FK)──┘
│ middle_name          │   │  │ school_year_id ──→
│ last_name            │   │  │ (FK)              │
│ suffix               │   │  │ program_id (FK)──┐
│ email                │   │  │ year_level       │ ┌────────────┐
│ contact_number       │   │  │ (1-4)            │─→│ programs   │
│ is_active            │   │  │ section          │  └────────────┘
│ created_at           │   │  │ status           │
│ updated_at           │   │  │ enrolled_at      │
└──────────────────────┘   │  └──────┬───────────┘
                           │         │
                           │         ↓ (1 to many)
                           │  ┌──────────────────┐
                           │  │ event_attendance │
                           │  └──────────────────┘
                           │
                           │ (Referenced by)
                           ↓
            ┌──────────────────────────────┐
            │ membership_ledger             │
            ├──────────────────────────────┤
            │ id (UUID, PK)                │
            │ student_school_year_id ──────┴─→ student_school_years
            │ school_year_id (FK)
            │ total_amount
            │ paid_amount (COMPUTED)
            │ balance (COMPUTED)
            │ status
            │ created_at
            └──────────────────────────────┘

EVENTS DOMAIN
┌────────────────────────┐
│      events            │
├────────────────────────┤
│ id (UUID, PK)          │
│ school_year_id (FK)    │
│ title                  │
│ slug (UNIQUE)          │
│ description            │
│ venue                  │
│ banner_url             │
│ starts_at              │
│ ends_at                │
│ registration_open      │
│ registration_close     │
│ capacity               │
│ is_published           │
│ facebook_album_url     │
│ facebook_photos        │
│ created_by (FK)        │
│ created_at             │
│ updated_at             │
└────────────┬───────────┘
             │
      ┌──────┴──────────┐
      │                 │
      ↓                 ↓
┌──────────────────┐  ┌──────────────────────┐
│ event_           │  │ event_attendance     │
│ registrations    │  ├──────────────────────┤
├──────────────────┤  │ id (UUID, PK)        │
│ id (UUID, PK)    │  │ event_id (FK)        │
│ event_id (FK)    │  │ student_id (FK)      │
│ student_id (FK)  │  │ school_year_id (FK)  │
│ status           │  │ status               │
│ registered_at    │  │ recorded_by (FK)     │
│ UNIQUE(event_id, │  │ recorded_at          │
│ student_id)      │  │ UNIQUE(event_id,     │
└──────────────────┘  │        student_id)   │
                      └──────────────────────┘

FINANCE DOMAIN
┌────────────────────────────────┐
│   membership_fees              │
├────────────────────────────────┤
│ id (UUID, PK)                  │
│ school_year_id (FK)            │
│ semester (1st, 2nd)            │
│ program_id (FK)                │
│ year_level (1-4)               │
│ amount                         │
│ due_date                       │
│ UNIQUE(school_year_id,         │
│   semester, program_id,        │
│   year_level)                  │
└────────┬──────────────────────┬┘
         │                      │
         ↓ (1 to many)          │
┌──────────────────────────────┐ │
│  membership_ledger           │ │
├──────────────────────────────┤ │
│ id (UUID, PK)                │ │
│ student_school_year_id ──────┼─┘
│ school_year_id (FK)          │
│ total_amount                 │
│ paid_amount (SUM(payments))   │
│ balance (total - paid)        │
│ status (ACTIVE/SETTLED)       │
│ created_at                    │
│ updated_at                    │
└────────┬─────────────────────┘
         │
         │ (1 to many)
         ↓
┌──────────────────────────┐
│     payments             │
├──────────────────────────┤
│ id (UUID, PK)            │
│ membership_ledger_id ──→ ledger
│ amount                   │
│ payment_date             │
│ method (CASH/TRANSFER/   │
│   CHEQUE/ONLINE)         │
│ reference                │
│ recorded_by (FK)         │
│ status (ACTIVE/VOIDED)   │
│ void_reason (nullable)   │
│ voided_by (FK, nullable) │
│ voided_at (nullable)     │
│ created_at               │
│ updated_at               │
└────────┬─────────────────┘
         │
         │ (many-to-many)
         ↓
┌──────────────────────────────┐
│   remittance_items           │
├──────────────────────────────┤
│ id (UUID, PK)                │
│ remittance_id (FK)           │
│ payment_id (FK) ────┐        │
│ amount               │        │
│ created_at           │        │
└──────────┬───────────┼────────┘
           │           │
           │           ↓ (FK)
           │      ┌──────────────┐
           │      │  payments    │
           │      └──────────────┘
           │
           ↓ (1 to many)
┌──────────────────────────────┐
│      remittances             │
├──────────────────────────────┤
│ id (UUID, PK)                │
│ school_year_id (FK)          │
│ total_amount                 │
│ status (DRAFT/SUBMITTED/     │
│   APPROVED)                  │
│ submitted_by (FK)            │
│ submitted_at                 │
│ created_at                   │
│ updated_at                   │
└──────────────────────────────┘

INVENTORY DOMAIN
┌─────────────────────────────┐
│  inventory_assets           │
├─────────────────────────────┤
│ id (UUID, PK)               │
│ asset_code (UNIQUE)         │
│ name                        │
│ description                 │
│ category                    │
│ quantity                    │
│ unit_cost                   │
│ condition (GOOD/FAIR/POOR)  │
│ status (AVAILABLE/IN_USE)   │
│ location                    │
│ acquired_at                 │
│ created_at                  │
│ updated_at                  │
└────────────┬────────────────┘
             │
      ┌──────┴──────┐
      │             │
      ↓             ↓
┌──────────────────────────┐ ┌───────────────────┐
│ inventory_               │ │ asset_turnovers   │
│ transactions             │ ├───────────────────┤
├──────────────────────────┤ │ id (UUID, PK)     │
│ id (UUID, PK)            │ │ asset_id (FK)     │
│ asset_id (FK)            │ │ borrowed_by (FK)  │
│ transaction_type         │ │ borrowed_at       │
│ quantity_change          │ │ due_at            │
│ reason                   │ │ returned_at       │
│ recorded_by (FK)         │ │ returned_cond.    │
│ recorded_at              │ │ notes             │
│ created_at               │ └───────────────────┘
└──────────────────────────┘

ORGANIZATION DOMAIN
┌────────────────────────┐
│ organization_profile   │
├────────────────────────┤
│ id (UUID, PK)          │
│ name                   │
│ description            │
│ mission                │
│ vision                 │
│ history                │
│ logo_url               │
│ cover_url              │
│ contact_email          │
│ contact_phone          │
│ website                │
│ updated_by (FK)        │
│ created_at             │
│ updated_at             │
└────────────────────────┘

┌────────────────────────────┐      ┌────────────────────┐
│ organization_positions     │      │ organization_      │
├────────────────────────────┤      │ committees         │
│ id (UUID, PK)              │      ├────────────────────┤
│ code (UNIQUE)              │      │ id (UUID, PK)      │
│ name ← PRESIDENT,          │      │ code (UNIQUE)      │
│        SECRETARY, etc.     │      │ name               │
│ description                │      │ description        │
│ order                      │      │ created_at         │
│ is_active                  │      └────────┬───────────┘
└────────────┬───────────────┘              │
             │                              │
             │ (1 to many)                  │ (1 to many)
             ↓                              ↓
┌────────────────────────────┐  ┌────────────────────────┐
│ officer_assignments        │  │ committee_members      │
├────────────────────────────┤  ├────────────────────────┤
│ id (UUID, PK)              │  │ id (UUID, PK)          │
│ position_id (FK)           │  │ committee_id (FK)      │
│ user_id (FK) ──→ profiles  │  │ user_id (FK) ─→ profiles
│ school_year_id (FK)        │  │ school_year_id (FK)    │
│ assigned_at                │  │ joined_at              │
│ ended_at (nullable)        │  │ UNIQUE(committee_id,   │
│ UNIQUE(position_id,        │  │   user_id, school_year)
│   user_id, school_year)    │  └────────────────────────┘
└────────────────────────────┘

CONTENT DOMAIN
┌───────────────────────────────┐
│      announcements            │
├───────────────────────────────┤
│ id (UUID, PK)                 │
│ title                         │
│ content                       │
│ priority (HIGH/NORMAL/LOW)    │
│ status (DRAFT/PUBLISHED/...)  │
│ published_at                  │
│ expires_at                    │
│ created_by (FK)               │
│ created_at                    │
│ updated_at                    │
└───────────────────────────────┘

┌───────────────────────────────┐
│   featured_contents           │
├───────────────────────────────┤
│ id (UUID, PK)                 │
│ title                         │
│ description                   │
│ image_url (Supabase Storage)  │
│ content_type                  │
│ linked_event_id (FK, null)    │
│ linked_url                    │
│ status (DRAFT/PUBLISHED)      │
│ position_order                │
│ published_at                  │
│ expires_at                    │
│ created_by (FK)               │
│ created_at                    │
│ updated_at                    │
└───────────────────────────────┘

┌───────────────────────────────┐
│      sanctions                │
├───────────────────────────────┤
│ id (UUID, PK)                 │
│ student_school_year_id (FK)   │
│ event_id (FK, nullable)       │
│ reason                        │
│ amount                        │
│ status (ACTIVE/SETTLED/..)    │
│ issued_at                     │
│ issued_by (FK)                │
│ settled_at (nullable)         │
│ notes                         │
│ created_at                    │
│ updated_at                    │
└───────────────────────────────┘

SYSTEM DOMAIN
┌───────────────────────────────┐
│      notifications            │
├───────────────────────────────┤
│ id (UUID, PK)                 │
│ user_id (FK → profiles)       │
│ type                          │
│ title                         │
│ message                       │
│ data (JSON)                   │
│ read_at (nullable)            │
│ created_at                    │
└───────────────────────────────┘

┌───────────────────────────────┐
│      audit_logs               │
├───────────────────────────────┤
│ id (UUID, PK)                 │
│ user_id (FK)                  │
│ action                        │
│ entity_type                   │
│ entity_id                     │
│ old_values (JSON)             │
│ new_values (JSON)             │
│ ip_address                    │
│ user_agent                    │
│ created_at (INDEX)            │
│ APPEND-ONLY (no updates)      │
└───────────────────────────────┘

┌───────────────────────────────┐
│   student_imports             │
├───────────────────────────────┤
│ id (UUID, PK)                 │
│ school_year_id (FK)           │
│ file_name                     │
│ file_path (Supabase Storage)  │
│ total_rows                    │
│ valid_rows                    │
│ invalid_rows                  │
│ imported_rows                 │
│ updated_rows                  │
│ failed_rows                   │
│ status                        │
│ imported_by (FK)              │
│ error_log (JSON)              │
│ imported_at                   │
│ created_at                    │
└───────────────────────────────┘
```

---

## Key Constraints & Rules

### Authentication & Authorization

- ✅ Supabase auth.users is external source of truth
- ✅ profiles.auth_user_id links to auth.users.id
- ✅ NO passwords stored in profiles table
- ✅ user_roles.user_id references profiles.id
- ✅ role_permissions define access control

### Academic Data

- ✅ UNIQUE(student_school_years: student_id, school_year_id)
- ✅ student_school_years preserves historical enrollment
- ✅ Each student can enroll in multiple school years
- ✅ Program and year_level are per-enrollment, not per-student

### Financial Records

- ✅ Payments have status (ACTIVE, VOIDED) - NO hard DELETE
- ✅ Voided payments include: void_reason, voided_by, voided_at
- ✅ remittance_items links payments to remittances
- ✅ A payment belongs to exactly one remittance (when active)
- ✅ membership_fees include semester in unique constraint
- ✅ membership_ledger.paid_amount = SUM(active payments)
- ✅ membership_ledger.balance = total_amount - paid_amount

### Organization Structure

- ✅ organization_positions (PRESIDENT, SECRETARY, etc.)
- ✅ officer_assignments link positions to users per school_year
- ✅ organization_committees (MEMBERSHIP_WELFARE, EVENTS_LOGISTICS, etc.)
- ✅ committee_members link committees to users per school_year
- ✅ One user can have position + committee memberships

### Attendance & Events

- ✅ UNIQUE(event_attendance: event_id, student_id)
- ✅ Prevents duplicate check-in for same event
- ✅ event_attendance must reference school_year_id
- ✅ Attendance statuses: PRESENT, LATE, EXCUSED, ABSENT

### Audit & History

- ✅ audit_logs table is append-only (no updates/deletes)
- ✅ student_imports preserves import history
- ✅ All timestamps immutable after creation
- ✅ All user actions include recorded_by or created_by

---

## Foreign Key Relationships

All foreign keys have appropriate ON DELETE behavior:

- CASCADE for dependent records (e.g., user_roles when user deleted)
- RESTRICT for shared resources (e.g., events when school_year active)
- SET NULL for optional references

---

**Status:** ✅ Corrected schema ready for implementation

