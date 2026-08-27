# PSITS Portal V2

An admin + student portal for the Philippine Society of Information Technology Students (PSITS), covering event management, QR-based attendance, and passwordless student login.

**Status:** Active MVP — admin and student flows below are built and working; anything not listed here isn't implemented yet.

---

## Features

**Admin**
- Email/password login (bcrypt-hashed, rate-limited)
- Event management: create/edit events, Draft → Active → Archived lifecycle, mandatory-attendance flag, per-year-level attendance exemptions
- Attendance DataTable per event: live updates via WebSocket as officers scan, filters (program/year/section/status), Present/Incomplete/No-show/Absent/Not Registered/Excused statuses
- Excel export of the full eligible roster for an event (logo, org header, summary counts, per-student registration + attendance detail)
- Student roster management (add/edit)
- QR scanner for check-in/check-out
- In-app Help & Guide page

**Student**
- Passwordless login: Student ID + TOTP authenticator code (no password stored)
- Self-service account activation with QR-code authenticator enrollment (Google Authenticator, Authy, etc.)
- Browse and register for events
- Personal attendance history

---

## Tech Stack

**Backend:** FastAPI, SQLAlchemy 2.0 (sync), Pydantic v2, PostgreSQL (via Supabase), `python-jose` (JWT), `passlib`/bcrypt, `pyotp` (TOTP), `openpyxl` (Excel export), `slowapi` (rate limiting)

**Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Router

**Infrastructure:** Supabase (PostgreSQL + connection pooling)

---

## Project Structure

```
psits-portal-v2/
├── backend/
│   ├── app/
│   │   ├── core/           # config, database engine, security/JWT, rate limiting
│   │   ├── api/v1/endpoints/  # route handlers (admin, student, events, attendance)
│   │   ├── models/         # SQLAlchemy models
│   │   ├── services/       # business logic (e.g. Excel export builder)
│   │   └── scripts/        # one-off DB setup/maintenance scripts
│   ├── init_db_mvp.py       # creates all tables (SQLAlchemy create_all - no migration runner in use yet)
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── pages/           # route-level page components (Admin*, Student*)
│   │   ├── components/      # shared UI (Sidebar, toast, notices, etc.)
│   │   └── lib/             # fetch wrappers, auth helpers
│   └── .env.example
│
└── private_data/             # real student data working files - gitignored, never committed
```

---

## Getting Started

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows; use `source venv/bin/activate` on macOS/Linux

pip install poetry
poetry install

cp .env.example .env
# Fill in DATABASE_URL, SECRET_KEY, MFA_ENCRYPTION_KEY, SUPABASE_URL/KEY - see comments in .env.example

python init_db_mvp.py        # creates tables if they don't exist yet
python -m uvicorn app.main:app --reload
```

Runs on `http://localhost:8000`. `GET /health` and `GET /ping` (unauthenticated) are available for uptime checks — the latter is meant for an external cron/uptime pinger to keep a free-tier host from spinning down.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Runs on `http://localhost:5173`, with `/api` proxied to the backend during development (see `vite.config.ts`).

---

## Configuration Notes

- **Database pooling**: if using Supabase's pooler, stay on the **session-mode port (5432)**, not transaction-mode (6543) — transaction mode caused connections to hang indefinitely in testing with this app's setup rather than failing cleanly. Keep `DATABASE_POOL_SIZE` + `DATABASE_MAX_OVERFLOW` comfortably under your Supabase plan's total connection cap (free tier: 15) — see comments in `.env.example`.
- **Secrets** (`SECRET_KEY`, `MFA_ENCRYPTION_KEY`, `DATABASE_URL`, Supabase keys) live only in `.env`, which is gitignored. Never commit real values — use `.env.example` as the template for what needs to be set.
- Schema is currently managed via `Base.metadata.create_all()` (see `init_db_mvp.py`), not Alembic migrations — the `alembic/` scaffold exists but isn't wired into the actual deploy/setup flow yet.

---

## Security

- Student login is passwordless: Student ID + a 6-digit TOTP code, rate-limited to 10 attempts/minute per IP
- Admin login: bcrypt-hashed passwords, rate-limited to 5 attempts/minute per IP
- Student TOTP secrets encrypted at rest (Fernet)
- JWT sessions (HS256, 12-hour expiry) for both admin and student
- All admin API routes require a valid admin session; students can only ever access their own data

---

## Deployment

Frontend targets **Vercel**; backend targets **Render**. Render's free tier spins down on inactivity — hit `GET /ping` on a schedule (e.g. via an external cron service) to keep it warm.

---

**License:** Internal project for PSITS.
