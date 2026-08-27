# PSITS Portal V2 - Development Guide

This guide covers everything needed to develop and contribute to the PSITS Portal V2 project.

---

## 📋 Prerequisites

### Required
- **Python 3.9+** (backend)
- **Node.js 18+** (frontend)
- **PostgreSQL 12+** (database) OR Supabase account
- **Git** (version control)
- **Visual Studio Code** or preferred IDE

### Recommended
- **Postman** or **Insomnia** (API testing)
- **DBeaver** or **pgAdmin** (database management)
- **Docker** (containerization)

---

## 🚀 Initial Setup

### 1. Clone Repository

```bash
cd c:\PSITS
git clone <repository-url> psits-portal-v2
cd psits-portal-v2
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Install Poetry (if not installed)
pip install poetry

# Install dependencies
poetry install

# Create .env file
cp .env.example .env
```

**Edit `.env` with your database connection:**

```env
# For local PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/psits_v2

# For Supabase (recommended)
DATABASE_URL=postgresql://postgres.[project-ref]:password@aws-0-region.pooler.supabase.com:5432/postgres
```

**Install PostgreSQL (if using local):**
- Download from https://www.postgresql.org/download/
- Create database: `createdb psits_v2`

### 3. Database Migrations

```bash
cd backend

# Create initial migration
alembic revision --autogenerate -m "Initial schema"

# Apply migrations
alembic upgrade head
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

**Edit `.env` with API configuration:**

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_DEBUG=true
```

---

## 🏃 Running Development Servers

### Backend (Terminal 1)

```bash
cd backend

# Activate venv (if not already)
venv\Scripts\activate

# Start development server
python -m uvicorn app.main:app --reload --port 8000
```

**Access:**
- API: http://localhost:8000
- Docs: http://localhost:8000/api/docs

### Frontend (Terminal 2)

```bash
cd frontend

# Start development server
npm run dev
```

**Access:**
- Frontend: http://localhost:5173
- Auto-reload on changes

---

## 📝 Project Structure

### Backend

```
backend/
├── app/
│   ├── main.py                 # Entry point
│   ├── core/
│   │   ├── config.py          # Settings
│   │   ├── exceptions.py       # Custom exceptions
│   │   └── security.py         # Auth & security
│   ├── api/
│   │   ├── v1/
│   │   │   ├── endpoints/      # Route handlers
│   │   │   └── dependencies.py # Shared dependencies
│   │   └── __init__.py
│   ├── models/                 # SQLAlchemy ORM models
│   ├── schemas/                # Pydantic request/response models
│   ├── services/               # Business logic
│   ├── repositories/           # Data access layer
│   └── utils/                  # Helper functions
├── alembic/
│   ├── versions/               # Migration files
│   └── env.py
├── tests/                      # Test suite
├── pyproject.toml              # Poetry dependencies
├── alembic.ini                 # Alembic config
└── .env                        # Environment variables
```

### Frontend

```
frontend/
├── src/
│   ├── main.tsx               # Entry point
│   ├── App.tsx                # Root component
│   ├── index.css              # Global styles
│   ├── pages/                 # Page components
│   ├── components/            # Reusable components
│   ├── layouts/               # Layout wrappers
│   ├── features/              # Feature-specific modules
│   ├── services/              # API services
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utilities
│   └── types/                 # TypeScript type definitions
├── public/                    # Static assets
├── index.html                 # HTML template
├── package.json               # NPM dependencies
├── vite.config.ts             # Vite configuration
├── tsconfig.json              # TypeScript config
├── tailwind.config.js         # Tailwind CSS config
└── .env                       # Environment variables
```

---

## 🧪 Testing

### Backend Tests

```bash
cd backend

# Run all tests
pytest

# Run specific test file
pytest tests/test_auth.py

# Run with coverage
pytest --cov=app

# Run with verbose output
pytest -v

# Run with debugging
pytest -s
```

### Frontend Tests

```bash
cd frontend

# Run tests (when configured)
npm test

# Run with coverage
npm run test:cov
```

---

## 💻 Code Quality

### Backend

```bash
cd backend

# Format code (Black)
black app/

# Sort imports (isort)
isort app/

# Lint code (Flake8)
flake8 app/

# Type checking (mypy)
mypy app/

# All together
black app/ && isort app/ && flake8 app/ && mypy app/
```

### Frontend

```bash
cd frontend

# Check TypeScript
npm run type-check

# Lint (ESLint)
npm run lint

# Fix linting issues
npm run lint -- --fix
```

---

## 📚 Database Migrations

### Create New Migration

After modifying `models/`, create a migration:

```bash
cd backend

# Auto-generate migration from model changes
alembic revision --autogenerate -m "Add user table"

# Review generated migration in alembic/versions/
# Edit if necessary (auto-generation may miss some changes)

# Apply migration
alembic upgrade head
```

### Common Migration Commands

```bash
# See current database version
alembic current

# See available versions
alembic history

# View SQL that would be executed
alembic upgrade head --sql

# Downgrade one version
alembic downgrade -1

# Downgrade to specific version
alembic downgrade abc123

# Downgrade all
alembic downgrade base
```

---

## 🔐 Authentication

### Backend JWT Setup

1. **Generate secret key:**
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

2. **Add to `.env`:**
   ```env
   SECRET_KEY=<generated-key>
   ```

3. **Test login endpoint:**
   ```bash
   curl -X POST "http://localhost:8000/api/v1/auth/login" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@psits.local",
       "password": "ChangeMe123!"
     }'
   ```

### Using JWT in Requests

```bash
# Get token from login response
TOKEN="<token-from-response>"

# Use in subsequent requests
curl -X GET "http://localhost:8000/api/v1/users/me" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🛠️ Common Development Tasks

### Add New API Endpoint

1. **Create schema** (`app/schemas/`):
   ```python
   from pydantic import BaseModel
   
   class EventCreateSchema(BaseModel):
       title: str
       description: str
       venue: str
       starts_at: datetime
   ```

2. **Create route handler** (`app/api/v1/endpoints/events.py`):
   ```python
   from fastapi import APIRouter, Depends
   from app.core.security import get_current_user
   
   router = APIRouter()
   
   @router.post("/")
   async def create_event(
       data: EventCreateSchema,
       current_user = Depends(get_current_user)
   ):
       # Implementation
       pass
   ```

3. **Register route** in `app/main.py`:
   ```python
   from app.api.v1.endpoints import events
   app.include_router(events.router, prefix="/api/v1/events")
   ```

### Add New React Component

1. **Create component** (`src/components/MyComponent.tsx`):
   ```typescript
   interface MyComponentProps {
     title: string;
     onClose: () => void;
   }
   
   export function MyComponent({ title, onClose }: MyComponentProps) {
     return <div className="p-4">{title}</div>
   }
   ```

2. **Use in page**:
   ```typescript
   import { MyComponent } from '@/components/MyComponent'
   
   export function HomePage() {
     return <MyComponent title="Hello" onClose={() => {}} />
   }
   ```

### Add Permission Check

**Backend:**
```python
@router.post("/")
async def create_event(
    data: EventCreateSchema,
    current_user = Depends(get_current_user)
):
    if not current_user.has_permission("events.create"):
        raise ForbiddenException("You don't have permission to create events")
    # Proceed
```

**Frontend:**
```typescript
<PermissionGate permission="events.create">
  <CreateEventButton />
</PermissionGate>
```

---

## 🐛 Debugging

### Backend Debugging

**Using print statements:**
```python
print(f"Debug: {variable}")
```

**Using logging:**
```python
import logging
logger = logging.getLogger(__name__)
logger.info(f"Event created: {event.id}")
logger.error(f"Error: {str(e)}")
```

**Using debugger:**
```python
import pdb; pdb.set_trace()  # Add breakpoint
```

### Frontend Debugging

**React DevTools Browser Extension:**
- Chrome: https://chrome.google.com/webstore/detail/react-developer-tools/
- Firefox: Firefox Add-ons store

**VS Code Debugger:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/frontend"
    }
  ]
}
```

---

## 🚀 Building for Production

### Backend

```bash
cd backend

# Generate requirements.txt from Poetry
poetry export -f requirements.txt --output requirements.txt

# Create production image (Docker)
docker build -t psits-portal-backend:latest .
docker run -p 8000:8000 psits-portal-backend:latest
```

### Frontend

```bash
cd frontend

# Build optimized bundle
npm run build

# Preview production build locally
npm run preview

# Deploy dist/ folder to static hosting
```

---

## 📖 Documentation Locations

- **System Architecture:** [SYSTEM_FLOW.md](docs/SYSTEM_FLOW.md)
- **Database Schema:** [ERD.md](docs/ERD.md)
- **Authorization:** [RBAC.md](docs/RBAC.md)
- **API Endpoints:** [API_SPEC.md](docs/API_SPEC.md)
- **Project README:** [README.md](README.md)

---

## 🤝 Git Workflow

### Branch Naming

```
feature/feature-name       # New feature
bugfix/bug-description     # Bug fix
refactor/refactor-name     # Refactoring
docs/documentation-update  # Documentation
```

### Commit Message Format

```
type(scope): brief description

Longer description explaining what and why.

Fixes #123
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

### Basic Workflow

```bash
# Create feature branch
git checkout -b feature/event-management

# Make changes and commit
git add .
git commit -m "feat(events): add event creation endpoint"

# Push branch
git push origin feature/event-management

# Create Pull Request on GitHub
```

---

## 🆘 Troubleshooting

### Backend won't start

```bash
# Check Python version
python --version  # Should be 3.9+

# Reinstall dependencies
poetry install --no-cache

# Check database connection
sqlalchemy.create_engine(settings.database_url).connect()
```

### Frontend build fails

```bash
# Clear cache
rm -rf node_modules package-lock.json

# Reinstall
npm install

# Clear Vite cache
rm -rf .vite
```

### Database errors

```bash
# Check if PostgreSQL is running
# Drop and recreate database
dropdb psits_v2
createdb psits_v2

# Re-run migrations
alembic downgrade base
alembic upgrade head
```

### Import errors in Python

```bash
# Ensure you're in the right directory
cd backend

# Activate virtual environment
venv\Scripts\activate

# Check Python path
python -c "import sys; print(sys.path)"
```

---

## 📝 Convention Standards

### Python/FastAPI

- **File naming:** `snake_case`
- **Function naming:** `snake_case`
- **Class naming:** `PascalCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Line length:** 100 characters (Black default)
- **Type hints:** Always use for functions

### TypeScript/React

- **File naming:** `PascalCase.tsx` for components, `camelCase.ts` for utilities
- **Function naming:** `camelCase` or `PascalCase` for components
- **Variable naming:** `camelCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **No `any` types:** Use proper TypeScript types
- **Props interface:** `interface ComponentProps {}`

---

## 🎯 Development Checklist

Before pushing code:

- [ ] Code compiles/runs without errors
- [ ] All tests pass (`pytest`, `npm test`)
- [ ] Type checking passes (`mypy`, `npm run type-check`)
- [ ] Linting passes (`black`, `isort`, `flake8`, `eslint`)
- [ ] Database migrations applied successfully
- [ ] Feature works in browser/Postman
- [ ] Documentation updated if needed
- [ ] No hardcoded secrets or credentials
- [ ] No console errors or warnings
- [ ] Committed changes follow naming conventions

---

## 🆘 Getting Help

1. **Check documentation:** Review docs/ folder first
2. **Check git history:** `git log --oneline` for similar changes
3. **Check existing code:** Look for patterns in similar features
4. **Ask in team chat:** Share error logs and what you've tried

---

**Last Updated:** August 25, 2026  
**Version:** 0.1.0
