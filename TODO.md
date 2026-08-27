# PSITS Portal V2 - TODO & Testing Guide

Last updated: 2026-08-25

---

## Part 1: How to test the current setup (Phase 2 - Auth Foundation)

### Prerequisites (one-time)

1. **Supabase project keys** are already in `backend/.env` and `frontend/.env`
   (`SUPABASE_KEY` / `VITE_SUPABASE_ANON_KEY` = the `sb_publishable_...` key).
2. **Email confirmation is currently OFF** in Supabase (Dashboard -> Authentication
   -> Sign In / Providers -> Email -> "Confirm email"). This was turned off to get
   past the free-tier email rate limit during dev testing. **Turn it back ON before
   any real users sign up**, otherwise anyone can activate an account with an email
   they don't own.
3. Poetry venv is set up in `backend/` (Python 3.12). Node deps are installed in
   `frontend/` (`node_modules` present).

### Start both servers

```bash
# Terminal 1 - backend (from backend/)
poetry run uvicorn app.main:app --port 8000

# Terminal 2 - frontend (from frontend/)
npm run dev
```

- Backend: http://localhost:8000 (docs at `/api/docs`)
- Frontend: http://localhost:5173

### Manual browser test (the real user flow)

1. Open http://localhost:5173
2. Click **"Create an account"**, sign up with any email + password (8+ chars).
   Since email confirmation is off, you're signed in immediately - no email needed.
3. You land on the **activation page**. Enter a **student ID + last name that
   exists in the `students` table**. A test record was seeded during Phase 2
   verification:
   - Student ID: `22-99999`
   - Last name: `Student`
   (Delete this via SQL or a future admin UI once real roster data exists - see
   Phase 3 below.)
4. On success you land on the **dashboard**, showing your profile, assigned
   role(s), and the full resolved permission list.
5. **Sign out** button in the dashboard header returns you to `/login`.

### Automated backend test (no browser, checks the full chain)

Useful after touching `security.py`, `auth_service.py`, or the RBAC seed data.

```bash
# 1. Get a real Supabase access token (email confirmation must be OFF)
curl -s -X POST "https://gbidiooxbjzaezztleja.supabase.co/auth/v1/signup" \
  -H "apikey: sb_publishable_1Hk-r9irCea9mEbjDIwHIw_-5-qrvki" \
  -H "Content-Type: application/json" \
  -d '{"email":"test.'"$(date +%s)"'@gmail.com","password":"TestPassword123!"}'
# copy the "access_token" field from the response

TOKEN="<paste access_token here>"

# 2. Verify token
curl -s -X POST http://localhost:8000/api/v1/auth/verify -H "Authorization: Bearer $TOKEN"

# 3. Confirm no profile yet (expect 401)
curl -s http://localhost:8000/api/v1/auth/me -H "Authorization: Bearer $TOKEN"

# 4. Activate against the seeded test student
curl -s -X POST http://localhost:8000/api/v1/auth/activate \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"student_id":"22-99999","last_name":"Student"}'

# 5. Confirm profile + STUDENT role + permissions now resolve
curl -s http://localhost:8000/api/v1/auth/me -H "Authorization: Bearer $TOKEN"
```

Expected: step 3 returns `401 UNAUTHORIZED`, step 5 returns the profile with
`"roles":[{"code":"STUDENT",...}]` and a 14-item `permissions` array matching
`docs/RBAC_CORRECTED.md`.

### Checking the database directly

The Supabase Postgres instance also still holds the **legacy Next.js/Prisma
tables** (`UserAccount`, `StudentProfile`, `Event`, `Program`, `SchoolYear`, etc. -
PascalCase). These are untouched and unused by V2 - don't confuse them with the
new lowercase tables (`profiles`, `roles`, `permissions`, `students`,
`school_years`, `programs`, `student_school_years`, `audit_logs`, `user_roles`,
`role_permissions`).

To re-run schema/seed setup from scratch (drops and rebuilds only the V2 auth
tables, leaves legacy tables and student roster tables alone):

```bash
cd backend
poetry run python -m app.scripts.init_db_simple
```

---

## Part 2: Remaining work

### Phase 3 - Student Roster Management
- [ ] Backend: `POST /api/v1/students/import/preview` - parse Excel, validate
      rows, detect duplicates, return preview (per `docs/API_SPEC_CORRECTED.md`)
- [ ] Backend: `POST /api/v1/students/import/execute` - transactional bulk
      insert/update + `student_imports` history record
- [ ] Backend: `GET/POST/PATCH /api/v1/students` - manual CRUD (System Admin)
- [ ] Backend: `POST/PATCH /api/v1/school-years` - create/activate school years
- [ ] Backend: `POST/PATCH /api/v1/programs` - manage BSCS/BSIS/BLIS etc.
- [ ] Frontend: Admin roster page - Excel upload, preview table, confirm import
- [ ] Frontend: School year switcher (affects most other views)
- [ ] Remove/replace the manually-seeded `22-99999` test student once real
      roster import works

### Phase 4 - Organization Directory
- [ ] Backend: `GET/PATCH /api/v1/organization` - org profile (mission, vision,
      history, logo)
- [ ] Backend: `GET/POST/PATCH /api/v1/organization/positions` +
      `/officer-assignments` - who holds PRESIDENT/SECRETARY/etc. per school year
- [ ] Backend: `GET/POST/PATCH /api/v1/organization/committees` +
      `/committee-members`
- [ ] Frontend: Public directory page, admin officer/committee assignment UI

### Phase 5 - Events, Registration & QR Attendance
- [ ] Backend: `GET/POST/PATCH/DELETE /api/v1/events`, `/events/{id}/publish`
- [ ] Backend: `POST /api/v1/events/{id}/register` - opaque signed registration
      token (per `docs/DOCUMENTATION_CORRECTIONS_APPLIED.md` section 11)
- [ ] Backend: `POST /api/v1/attendance/scan` - validate token, prevent
      duplicate attendance (`UNIQUE(event_id, student_id)`)
- [ ] Backend: `GET /api/v1/attendance`, `/event-registrations`
- [ ] Frontend: Event list/detail/create pages, registration button + QR
      display, mobile-friendly scanner page for officers

### Phase 6 - Membership & Finance
- [ ] Backend: `GET/POST /api/v1/membership-fees` - per school year/semester/
      program/year level
- [ ] Backend: `GET /api/v1/membership-ledger` - auto-computed paid/balance
- [ ] Backend: `POST /api/v1/payments`, `POST /api/v1/payments/{id}/void`
      (no hard delete - status VOIDED + audit log, per RBAC_CORRECTED.md)
- [ ] Backend: `POST /api/v1/remittances`, `/remittances/{id}/approve`,
      `remittance_items` linking table
- [ ] Frontend: Treasurer dashboard - record payment, void with reason,
      build remittance from a set of payments, approval view

### Phase 7 - Inventory
- [ ] Backend: `GET/POST/PATCH /api/v1/inventory` - assets CRUD
- [ ] Backend: `POST /api/v1/inventory/{id}/turnover` - borrow/return log
- [ ] Frontend: Inventory list, borrow/return flow

### Phase 8 - Sanctions
- [ ] Backend: `GET/POST/PATCH /api/v1/sanctions`, `/sanctions/{id}/settle`
- [ ] Frontend: M&W committee sanctions list + issue/settle forms

### Phase 9 - Content & Landing Page
- [ ] Backend: `GET/POST/PATCH /api/v1/announcements`
- [ ] Backend: `GET/POST/PATCH /api/v1/featured-content` - Supabase Storage for
      images
- [ ] Frontend: Public landing page (announcements, featured content, event
      highlights), PIO content management UI

### Phase 10 - Reporting & Audit
- [ ] Backend: `GET /api/v1/reports/*` - membership, financial, attendance
      summaries
- [ ] Backend: `GET /api/v1/audit-logs` - filterable audit trail view
- [ ] Wire actual audit log writes into payments/void/remittance/sanctions/
      role changes endpoints (the `audit_logs` table exists but nothing writes
      to it yet)
- [ ] Frontend: Reports dashboard, audit log viewer (System Admin only)

### Phase 11 - Notifications
- [ ] Backend: `GET/PATCH /api/v1/notifications` - in-app notifications table
      + read/unread state
- [ ] Decide on delivery: in-app only vs. email via Supabase/SMTP
- [ ] Frontend: Notification bell/dropdown

### Phase 12 - System Admin Panel
- [ ] Frontend: Role/permission management UI (assign roles to users, view/
      edit the permission matrix) - currently only seedable via
      `init_db_simple.py`
- [ ] Frontend: User management (search profiles, suspend/reactivate)
- [ ] Backend: enforce `SYSTEM_ADMIN`-only guards on all of the above via
      `require_permission(...)` dependencies already available in
      `app/core/security.py`

### Cross-cutting / housekeeping
- [ ] Turn Supabase "Confirm email" back ON before real users are onboarded
- [ ] Delete leftover E2E test accounts from Supabase Auth -> Users
      (`psits.v2.e2e.*@gmail.com` / `psits-v2-e2e-test-*`)
- [ ] Delete or repurpose the seeded test student (`22-99999`)
- [ ] Decide what happens to the legacy Prisma tables (`UserAccount`,
      `StudentProfile`, `Event`, `Program`, `SchoolYear`, `OrganizationMember`,
      `MembershipLedger`, `Sanction`, `InventoryAsset`, `AssetTurnoverLog`,
      `EventAttendance`, `EventRegistration`) - migrate data into V2 tables,
      or archive/drop once V2 is live
- [ ] Add automated tests (pytest for backend, at minimum covering
      `AuthService` and the permission-resolution SQL in `security.py`)
- [ ] Set up CI (lint + type-check + tests) for both `backend/` and `frontend/`
- [ ] Production deployment plan (hosting for FastAPI backend, static hosting
      for Vite build, environment secrets management)
