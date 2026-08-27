# PSITS Portal V2 - Getting Started

Welcome! This document will get you up and running in 10 minutes.

---

## 🎯 What's Ready

✅ **Complete Project Structure**
- Backend: FastAPI, SQLAlchemy, Alembic
- Frontend: React, Vite, TypeScript, Tailwind
- Documentation: Architecture, Schema, API, RBAC

✅ **Comprehensive Documentation**
- System architecture and flows
- Database entity-relationship diagram
- Role-based access control matrix
- Complete API specification

✅ **Configuration Files**
- Backend: pyproject.toml, .env.example, main.py
- Frontend: package.json, vite.config.ts, tailwind.config.js
- Database: Alembic migrations setup

✅ **Development Ready**
- Environment templates (.env.example)
- Development guide (DEVELOPMENT.md)
- Code examples and patterns

---

## 🚀 Quick Start (10 minutes)

### Step 1: Backend Setup (3 minutes)

```bash
cd backend

# Create & activate virtual environment
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install poetry
poetry install

# Create .env from template
cp .env.example .env

# Edit .env with your database URL:
# DATABASE_URL=postgresql://user:pass@localhost/psits_v2
```

### Step 2: Frontend Setup (3 minutes)

```bash
cd frontend

# Install dependencies
npm install

# Create .env from template
cp .env.example .env

# VITE_API_BASE_URL should already be set to http://localhost:8000/api/v1
```

### Step 3: Start Development Servers (3 minutes)

**Terminal 1 - Backend:**
```bash
cd backend
venv\Scripts\activate
python -m uvicorn app.main:app --reload
```

Expected output:
```
Uvicorn running on http://127.0.0.1:8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Expected output:
```
VITE v5.0.0  ready in 123 ms

➜  Local:   http://localhost:5173/
```

**Visit:** http://localhost:5173 in your browser

---

## 📍 Project Location

```
c:\PSITS\psits-portal-v2\     ← You are here!
├── backend/                  ← FastAPI app
├── frontend/                 ← React app
└── docs/                     ← Architecture & specs
```

**Do NOT modify** the old `c:\PSITS\psits-portal\` project.

---

## 📚 Documentation Map

| Document | Purpose | Read When |
|----------|---------|-----------|
| [README.md](README.md) | Project overview & features | First time setup |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Dev setup, testing, workflows | Writing code |
| [SYSTEM_FLOW.md](docs/SYSTEM_FLOW.md) | Architecture & data flows | Understanding design |
| [ERD.md](docs/ERD.md) | Database schema (30+ tables) | Working with database |
| [RBAC.md](docs/RBAC.md) | Authorization & permissions | Implementing access control |
| [API_SPEC.md](docs/API_SPEC.md) | All endpoints documented | Building frontend features |

---

## 🗂️ Project Structure

### Backend (`backend/`)

```
app/
├── main.py                 ← Start here (entry point)
├── core/
│   ├── config.py          ← Settings from .env
│   ├── exceptions.py       ← Custom error classes
│   └── security.py         ← Auth helpers (TODO)
├── api/
│   └── v1/                ← API routes (to be created)
│       ├── endpoints/
│       │   ├── auth.py
│       │   ├── events.py
│       │   └── ...
│       └── dependencies.py
├── models/                ← SQLAlchemy ORM models (to be created)
├── schemas/               ← Pydantic validation schemas (to be created)
├── services/              ← Business logic (to be created)
├── repositories/          ← Data access layer (to be created)
└── utils/                 ← Helper functions (to be created)

alembic/                   ← Database migrations
└── versions/              ← Migration files (auto-generated)
```

### Frontend (`frontend/`)

```
src/
├── main.tsx               ← Entry point
├── App.tsx                ← Root component
├── index.css              ← Global styles (Tailwind)
├── pages/                 ← Page components (to be created)
├── components/            ← Reusable components (to be created)
├── features/              ← Feature modules (to be created)
├── services/              ← API calls (to be created)
├── hooks/                 ← Custom hooks (to be created)
├── lib/                   ← Utilities (to be created)
└── types/                 ← TypeScript types (to be created)

public/                    ← Static assets
```

---

## 🔧 Key Commands

### Backend

```bash
cd backend

# Start server (with hot reload)
python -m uvicorn app.main:app --reload

# View API docs
open http://localhost:8000/api/docs

# Run tests (when available)
pytest

# Create database migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Format code
black app/ && isort app/
```

### Frontend

```bash
cd frontend

# Start dev server (with hot reload)
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build
```

---

## 🔐 Database Setup

### Option A: Supabase (Recommended)

1. Create free account: https://supabase.com
2. Create new project
3. Get connection string from Settings → Database
4. Add to `.env`:
   ```env
   DATABASE_URL=postgresql://postgres.[project-ref]:password@aws-0-region.pooler.supabase.com:5432/postgres
   ```

### Option B: Local PostgreSQL

1. Install PostgreSQL: https://www.postgresql.org/download/
2. Create database:
   ```bash
   createdb psits_v2
   ```
3. Add to `.env`:
   ```env
   DATABASE_URL=postgresql://postgres:password@localhost:5432/psits_v2
   ```

### Run Migrations

```bash
cd backend

# Apply all migrations
alembic upgrade head

# Verify by checking tables
# (Use pgAdmin, DBeaver, or psql)
```

---

## ✅ Checklist: You're Ready When...

- [ ] Backend starts at `http://localhost:8000` without errors
- [ ] Frontend starts at `http://localhost:5173` without errors
- [ ] Can access API docs at `http://localhost:8000/api/docs`
- [ ] Database connection works (check with `alembic current`)
- [ ] All `.env` files configured with values
- [ ] You can see "PSITS Portal V2" welcome page in browser

---

## 🚨 Common Issues

### Backend won't start

```bash
# Check Python version
python --version  # Should be 3.9+

# Reinstall dependencies
poetry install --no-cache

# Check .env file exists
dir /b backend\.env
```

### Frontend build error

```bash
# Clear node_modules
rmdir /s /q node_modules
npm install
```

### Database connection error

```bash
# Verify DATABASE_URL in .env
# Test connection with:
python -c "from app.core.config import settings; print(settings.database_url)"
```

---

## 📖 Next Steps

1. **Read [DEVELOPMENT.md](DEVELOPMENT.md)** (15 min)
   - Full setup instructions
   - Development workflows
   - Testing & debugging

2. **Read [SYSTEM_FLOW.md](docs/SYSTEM_FLOW.md)** (20 min)
   - Understand architecture
   - See data flow diagrams
   - Learn component organization

3. **Read [ERD.md](docs/ERD.md)** (15 min)
   - Study database schema
   - Understand relationships
   - See all 30+ tables

4. **Read [RBAC.md](docs/RBAC.md)** (10 min)
   - Learn authorization model
   - Understand roles & permissions
   - See permission matrix

5. **Read [API_SPEC.md](docs/API_SPEC.md)** (20 min)
   - Study endpoint specifications
   - Understand request/response formats
   - See error codes

---

## 🎯 First Development Task

**Goal:** Create your first API endpoint

1. Create a schema in `backend/app/schemas/student.py`
2. Create a route in `backend/app/api/v1/endpoints/student.py`
3. Register route in `backend/app/main.py`
4. Test at `http://localhost:8000/api/docs`
5. Create a React page in `frontend/src/pages/`
6. Call endpoint from React component

See [DEVELOPMENT.md](DEVELOPMENT.md) → "Common Development Tasks" for detailed example.

---

## 🆘 Need Help?

1. Check documentation in `/docs`
2. Review similar code patterns in codebase
3. Check git history: `git log --oneline`
4. Check error messages carefully (they're usually clear!)
5. Ask in team communication channel

---

## 💡 Key Points to Remember

✅ **Two separate projects:**
- Old: `c:\PSITS\psits-portal\` (reference only)
- New: `c:\PSITS\psits-portal-v2\` (development here)

✅ **Frontend & Backend separate:**
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- They communicate via API calls

✅ **Permission-based authorization:**
- Not role-based (no `if user.role == "admin"`)
- Use `if user.has_permission("action")`
- See RBAC.md for all permissions

✅ **Keep it running:**
- After each change, verify both frontend & backend work
- Run tests after adding features
- Check TypeScript/Python type errors

✅ **Vertical slices:**
- Complete features end-to-end
- Database → Backend → Frontend
- Don't implement partial features

---

## 🎓 Learning Path

**If you're new:**
1. Read README.md (5 min)
2. Read DEVELOPMENT.md (15 min)
3. Run `npm run dev` and `python -m uvicorn app.main:app --reload`
4. Explore running code in browser & terminal
5. Start making small changes & observe

**If you know React & Python:**
1. Skim README.md (2 min)
2. Read SYSTEM_FLOW.md & ERD.md (15 min)
3. Jump to DEVELOPMENT.md "Common Development Tasks"
4. Start building features

**If you know FastAPI/React:**
1. Read SYSTEM_FLOW.md & ERD.md (15 min)
2. Read RBAC.md & API_SPEC.md (15 min)
3. Check app/main.py for structure
4. Start building

---

## 🚀 Ready?

Open two terminals:

**Terminal 1:**
```bash
cd c:\PSITS\psits-portal-v2\backend
venv\Scripts\activate
python -m uvicorn app.main:app --reload
```

**Terminal 2:**
```bash
cd c:\PSITS\psits-portal-v2\frontend
npm run dev
```

Then open http://localhost:5173 in your browser.

**Welcome to PSITS Portal V2!** 🎉

---

**Last Updated:** August 25, 2026  
**Status:** ✅ Foundation Ready - Next: Authentication Implementation
