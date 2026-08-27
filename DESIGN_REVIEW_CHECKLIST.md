# Student Activation & Import Design - Review Checklist

**Status:** Ready for Design Review  
**Date:** August 26, 2026  
**Documents:** 3 comprehensive design specs  
**Real Data Imported:** NO (awaiting approval)

---

## 📋 DOCUMENTS PRODUCED

### 1. ARCHITECTURE_STUDENT_ACTIVATION.md
**Covers:** Overall system architecture and integration

- [x] Database schema (12 tables)
- [x] Entity relationship diagram
- [x] Import pipeline flow (5 phases)
- [x] Attendance normalization rules
- [x] Student activation flow (3 phases)
- [x] State machine (PENDING → MFA_ENROLLMENT → ACTIVE)
- [x] API endpoints (all routes with status codes)
- [x] Authentication architecture (with Supabase integration)
- [x] Security model (data isolation, encryption, audit trails)
- [x] Student dashboard API design (/me-style endpoints)
- [x] Import validation & preview design (5-step workflow)
- [x] Implementation sequence (7 phases)
- [x] Rollback & recovery procedures
- [x] Glossary of terms

**Read it when:** You need the big picture of how all systems fit together

---

### 2. IMPORT_MAPPING.md
**Covers:** Excel-to-database field mapping and import logic

- [x] Field mapping reference table
- [x] School year & semester mapping
- [x] Event extraction from headers (11-13 events per year level)
- [x] Attendance status normalization (/, E, MORNING, etc.)
- [x] Row-by-row import algorithm (pseudocode)
- [x] Database insert logic in transaction
- [x] Officer handling (special cases)
- [x] Validation rules summary
- [x] Deduplication strategy
- [x] Audit trail logging
- [x] Testing checklist (10 items)
- [x] Troubleshooting guide

**Read it when:** You need details on parsing the Excel file and creating student records

---

### 3. AUTHENTICATION_DESIGN.md
**Covers:** Passwordless authentication and TOTP implementation

- [x] Student login flow (passwordless: ID + TOTP)
- [x] Officer/admin login flow (unchanged: email + password)
- [x] Decision: Supabase MFA vs App-Level TOTP (chose App-Level)
- [x] TOTP implementation code examples
- [x] Encryption strategy (AES-256 with Fernet)
- [x] Backend login endpoint (complete implementation)
- [x] MFA reset procedure (admin-initiated)
- [x] Security considerations (key management, rate limiting, audit logs)
- [x] Testing strategy (unit tests + integration tests)
- [x] Deployment checklist (16 items)
- [x] Future enhancements (5 ideas)

**Read it when:** You need to understand how students log in and how TOTP is managed

---

## ✅ EXCEL FILE STRUCTURE (ANALYZED, NOT IMPORTED)

### Workbook Overview
- **File:** PSITS_ATTENDANCE RECORD.xlsx
- **Sheets:** 5 (1st, 2nd, 3rd, 4th, PSITS OFFICERS)
- **Total records:** 636 students + 57 officers
- **School year:** 2nd Semester S.Y. 2025-2026
- **Status:** Analyzed, awaiting import approval

### Data Summary
| Year Level | Students | Attendance Events |
|---|---|---|
| 1st Year | 182 | 11 events |
| 2nd Year | 114 | 11 events |
| 3rd Year | 133 | 12 events |
| 4th Year | 150 | 12 events |
| Officers | 57 | 4 categories |
| **TOTAL** | **636** | — |

### Column Structure
- **Identity (8 cols):** SEQ. NO., STUDENT ID, LAST NAME, FIRST NAME, MIDDLE NAME, YEAR, COURSE, SECTION
- **Attendance (11-12 cols):** Event names with dates (e.g., "1ST GEN. ASSEMBLY 08/08/2025")
- **Status Values:** "/" = present, "E" = excused, empty = absent, "MORNING"/"DAY 1" = partial

**File Analysis Report:**
→ See IMPORT_MAPPING.md § 11. Troubleshooting

---

## 🔐 SECURITY DECISIONS MADE

### Authentication
- **Student Login:** Passwordless (Student ID + 6-digit authenticator code)
- **Officer Login:** Email + password (Supabase standard, unchanged)
- **TOTP Storage:** App-level (AES-256 encrypted, not Supabase)
- **Backup Codes:** 10x 8-digit codes, generated once, shown once
- **Rate Limiting:** 5 attempts per 15-minute window, then 15-minute lockout

### Data Security
- **Excel file:** Never committed to Git, never exposed via API
- **PII in logs:** Hashed or truncated, names/IDs excluded
- **Encryption key:** Stored in .env (development), AWS Secrets Manager (production)
- **Audit trail:** Immutable, encrypted at rest, no plaintext secrets

### Authorization
- **Students:** Can only access their own attendance, balance, sanctions (via /me endpoints)
- **Officers:** Role-based + permission-based, RBAC model
- **Admins:** Full access, can reset student MFA
- **Officers as students:** Matched by Student ID, no duplicate creation

---

## 📊 SCHEMA CHANGES SUMMARY

### New Tables (7)
```
✓ school_year_semesters  - Semester metadata
✓ events                 - Event roster (extracted from Excel)
✓ attendance_records     - Student attendance (raw + normalized)
✓ import_history         - Import job tracking
✓ import_rows            - Per-row validation results
✓ student_mfa_secrets    - Encrypted TOTP secrets & backup codes
✓ student_activation_tokens - Temporary tokens for activation flow
```

### Modified Tables (2)
```
✓ profiles               - Add: student_id_fk, mfa_required, mfa_enrolled_at, activation_status
✓ school_years          - Add: current_semester
```

### Unchanged Tables
```
✓ students              - Already has all needed columns
✓ student_school_years - Already has all needed columns
✓ roles                - No change needed
✓ permissions          - No change needed
✓ user_roles           - No change needed
✓ role_permissions     - No change needed
✓ audit_logs           - Will be used for import/auth events
```

---

## 🔄 ACTIVATION FLOW (3 PHASES)

### Phase 1: Identity Verification
```
Student → Enter Student ID + Last Name
        → Backend verifies against student roster
        → Return activation_token (15 min TTL)
```

### Phase 2: Authenticator Enrollment
```
Student → Backend generates TOTP secret
        → Display QR code to scan with authenticator app
        → Student enters 6-digit code to verify enrollment
        → Backend saves encrypted secret
        → Display backup codes (shown once, never again)
```

### Phase 3: First Login
```
Student → Enter Student ID + 6-digit code from authenticator
        → Backend validates TOTP
        → Create Supabase session
        → Redirect to dashboard
```

---

## 🚀 IMPLEMENTATION SEQUENCE (7 PHASES)

| Phase | Component | Estimated | Gating |
|---|---|---|---|
| 1️⃣ | Database schema + migrations | 2 days | None |
| 2️⃣ | Import validation pipeline | 3 days | Phase 1 |
| 3️⃣ | Student activation flow | 3 days | Phase 1 |
| 4️⃣ | Passwordless login endpoint | 2 days | Phase 1, 3 |
| 5️⃣ | Student dashboard (/me endpoints) | 3 days | Phase 4 |
| 6️⃣ | Testing & security review | 5 days | Phase 2-5 |
| 7️⃣ | Production import & go-live | 1 day | Phase 6 ✅ |

**Total: ~19 days (3 weeks)**

---

## ⚠️ CRITICAL DECISIONS REQUIRING APPROVAL

### Decision 1: TOTP Storage Mechanism ⭐
**Question:** Where should TOTP secrets be stored?

**Options:**
- A) Supabase MFA API (secrets encrypted by Supabase)
- B) App-level storage (secrets encrypted by app)

**Recommendation:** **Option B (App-Level)** ✅
- Simpler integration with student-ID-based login
- Full control over activation UX
- Can show backup codes once
- Uses Supabase for account management, not MFA

**Status:** Approved in design doc

---

### Decision 2: Event Date Extraction ⭐
**Question:** Some event headers have dates, some don't. How should we handle missing dates?

**Options:**
- A) Require date in header, skip events without dates
- B) Use semester start/end date as default
- C) Flag for manual review, allow admin to specify

**Recommendation:** **Option C (Flag for manual review)**
- Some events don't have dates in the Excel headers
- Examples: "CEIT FIESTA 2025", "PASIKLABAN 2025"
- Admin should verify actual event dates before import

**Status:** Needs approval

---

### Decision 3: Officer Deduplication ⭐
**Question:** If an officer is also listed as a student, should we create one record or two?

**Options:**
- A) Create one student record, then assign officer role
- B) Create separate student & officer records
- C) Flag for manual review, admin decides

**Recommendation:** **Option A (One record)**
- Officers in PSITS are also students
- Use Student ID as unique identity
- Assign "OFFICER" role to the same student profile
- Prevents data inconsistency

**Status:** Needs approval

---

## 📝 PRE-IMPORT REQUIREMENTS

Before importing real student data, ensure:

- [ ] **Architecture Review:** All stakeholders approve the 3 design documents
- [ ] **Security Review:** Penetration tester reviews authentication & encryption
- [ ] **Database:** Alembic migrations created & tested on staging
- [ ] **Code:** All endpoints implemented & tested with sample data
- [ ] **Testing:** Full test suite passes (unit + integration + load)
- [ ] **Encryption:** TOTP encryption key generated & stored securely
- [ ] **Backup:** Production database backed up
- [ ] **Runbook:** MFA reset & account recovery procedures documented
- [ ] **Training:** Admins trained on import process & troubleshooting
- [ ] **Dry Run:** Perform import on staging with real Excel file
- [ ] **Sign-off:** Project lead & operations sign-off

---

## 🎯 NEXT STEPS (IN ORDER)

1. **Read & Review** (Today)
   - Read all 3 design documents
   - Comment on decisions requiring approval
   - Flag any concerns or questions

2. **Approve** (By [DATE])
   - Confirm TOTP storage mechanism
   - Confirm event date handling
   - Confirm officer deduplication approach
   - Sign off on architecture

3. **Implement Phase 1** (Start [DATE])
   - Create Alembic migrations for new schema
   - Run migrations on staging
   - Verify schema in database

4. **Implement Phase 2-6** (Sequentially)
   - Follow implementation sequence above
   - Complete each phase before next

5. **Final Testing** (Before go-live)
   - Security review
   - Load testing
   - Dry run with real Excel file

6. **Go-Live** (Date: [TBD])
   - Import real student data
   - Activate student enrollment
   - Monitor for issues

---

## ❓ QUESTIONS FOR CLARIFICATION

### On Excel Data
1. **Event dates:** Should missing dates be flagged or auto-filled?
2. **Semester:** Is "2nd Semester S.Y. 2025-2026" correct for all rows?
3. **Officers:** Should officers get STUDENT role automatically?

### On Authentication
4. **Backup codes:** Should they be downloadable/printable as PDF?
5. **MFA reset:** Who can trigger? (Just admins or also self-service with verification?)
6. **Authenticator apps:** Which apps should we test with? (Google Authenticator, Authy, Microsoft Authenticator)

### On Dashboard
7. **Attendance display:** Should students see historical events from prior years/semesters?
8. **Balance history:** Full ledger or just current balance?
9. **Sanctions:** Should students see sanctions issued but not yet served?

### On Deployment
10. **Timeline:** Do you have a target go-live date?
11. **Announcement:** Should students be notified before activation opens?
12. **Grace period:** Should there be time before accounts auto-lock if not activated?

---

## 📞 DESIGN REVIEW PROCESS

**Duration:** 2-3 days for comprehensive review

**Required Attendees:**
- [ ] Project Lead
- [ ] Backend Tech Lead
- [ ] Frontend Tech Lead
- [ ] Security Officer
- [ ] Database Administrator
- [ ] Operations Manager

**Review Format:**
- [ ] Read documents (in order: 1 → 2 → 3)
- [ ] Async Q&A in team channel
- [ ] Approval decision meeting (30 min)
- [ ] Document sign-off

---

## 🔗 DOCUMENT LINKS

All documents stored in `/c/PSITS/psits-portal-v2/`:

1. **ARCHITECTURE_STUDENT_ACTIVATION.md** — Main system design
2. **IMPORT_MAPPING.md** — Excel parsing & field mapping  
3. **AUTHENTICATION_DESIGN.md** — TOTP & login flow
4. **DESIGN_REVIEW_CHECKLIST.md** — This file (overview & sign-off)

---

## ✍️ SIGN-OFF SECTION

**Indicate approval by updating this section:**

```
ARCHITECTURE DESIGN
- [ ] Backend Lead: __________________  Date: ________
- [ ] Security Lead: __________________  Date: ________
- [ ] Project Lead: __________________  Date: ________

IMPORT MAPPING
- [ ] Backend Lead: __________________  Date: ________
- [ ] DBA: __________________  Date: ________

AUTHENTICATION DESIGN
- [ ] Backend Lead: __________________  Date: ________
- [ ] Security Lead: __________________  Date: ________

OVERALL APPROVAL
- [ ] Project Lead: __________________  Date: ________
- [ ] Go-live authorized: YES / NO
```

---

## 📌 IMPORTANT REMINDERS

🚫 **DO NOT:**
- Import real student data until all designs approved
- Commit the actual PSITS_ATTENDANCE RECORD.xlsx file to Git
- Store student names/IDs in logs or tests
- Expose the Excel file through any API
- Implement custom JWT/session auth (use Supabase)
- Store plaintext TOTP secrets in the database

✅ **DO:**
- Review designs carefully before approval
- Test with sample data first
- Plan for key rotation & disaster recovery
- Document all decisions & rationale
- Train admins before go-live
- Perform security review before production

---

**Status:** Awaiting design review approval  
**Next Review Date:** [TBD]  
**Final Approval Deadline:** [TBD]

