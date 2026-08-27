# PSITS Portal V2 - System Flow Documentation (CORRECTED)

**Status:** Architecture Corrections Applied  
**Date:** August 25, 2026

## Critical Architectural Changes

✅ **Supabase Auth** is the authentication provider (NOT custom JWT)  
✅ **System Admin** is separate from Organization Executives  
✅ **Profiles table** uses Supabase auth_user_id (no passwords stored)  
✅ **No custom sessions** - Supabase Auth manages sessions  
✅ **Permission-based RBAC** with explicit permissions per role  

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication Flow (Supabase Auth)](#authentication-flow-supabase-auth)
3. [Database Models](#database-models)
4. [API Authorization](#api-authorization)
5. [Major Feature Flows](#major-feature-flows)
6. [Security Considerations](#security-considerations)

---

## Architecture Overview

### Layered Architecture

```
┌──────────────────────────┐
│   React Vite Frontend    │
│  (Supabase Auth JS SDK)  │
└────────────┬─────────────┘
             │ Supabase Auth
             ↓
┌──────────────────────────────────────┐
│      Supabase Auth Services          │
│  (User signup/login/session/MFA)     │
└────────────┬─────────────────────────┘
             │ Supabase Access Token
             ↓
┌──────────────────────────────────────┐
│         FastAPI Backend              │
│  (Validate JWT, Resolve User,        │
│   Load Roles/Permissions, Authorize) │
└────────────┬─────────────────────────┘
             │ SQL (Validated User)
             ↓
┌──────────────────────────────────────┐
│    PostgreSQL (via Supabase)         │
│  (Profiles, Roles, Permissions,      │
│   Organization Data, Records)        │
└──────────────────────────────────────┘

Storage:
├─ Supabase Auth → User authentication
├─ Supabase Storage → Images, documents
└─ PostgreSQL → All application data
```

### Technology Stack

**Frontend:**
- React 19+ with TypeScript
- Vite (build tool)
- Supabase Auth JS SDK (authentication)
- TanStack Query (data fetching)
- React Router (routing)
- Tailwind CSS (styling)

**Backend:**
- FastAPI (REST API)
- Python 3.9+
- SQLAlchemy (ORM)
- Pydantic (validation)

**Database & Auth:**
- PostgreSQL (via Supabase)
- **Supabase Auth** (authentication provider)
- Supabase Storage (file uploads)

---

## Authentication Flow (Supabase Auth)

### 1. User Signup/Login

```
User (Browser)
    ↓
Click Login/Signup
    ↓
Supabase Auth UI
    ↓
Enter email/password
    ↓
Supabase validates credentials
    ↓
Create auth.users record
    ↓
Return Supabase Access Token (JWT)
    ↓
Frontend stores token
    ↓
Application can now use token
```

### 2. Request Flow with Token

```
React Frontend
    ↓
Fetch with Authorization header:
Bearer <SUPABASE_ACCESS_TOKEN>
    ↓
FastAPI receives request
    ↓
Extract token from header
    ↓
Call Supabase Auth API to verify token
    ↓
Get authenticated user ID (from Supabase)
    ↓
Query profiles table:
    WHERE auth_user_id = :user_id
    ↓
Load user profile
    ↓
Load user_roles (JOIN with roles)
    ↓
Load role_permissions (JOIN with permissions)
    ↓
Build permission set
    ↓
Check if user has required permission
    ↓
If authorized: execute endpoint
If not: return 403 Forbidden
```

### 3. Key Points

- **Supabase Auth owns:** User signup, login, password reset, MFA, sessions
- **Our application owns:** Profiles, roles, permissions, organization membership
- **No custom JWT:** We validate Supabase's JWT
- **No password storage:** Supabase stores passwords securely
- **No custom sessions:** Supabase manages sessions and refresh tokens

---

## Database Models

### Core Structure

```
Supabase auth.users
    (Managed by Supabase Auth)
    ├─ id (UUID)
    ├─ email
    ├─ phone (optional)
    └─ ... (Supabase fields)

PostgreSQL:
    ↓
profiles
    ├─ id (UUID)
    ├─ auth_user_id (FK → auth.users.id)
    ├─ student_id (optional, unique)
    ├─ display_name
    ├─ email (denormalized from auth.users)
    ├─ profile_image_url
    ├─ status (ACTIVE, INACTIVE, SUSPENDED)
    └─ timestamps

user_roles (JOIN TABLE)
    ├─ user_id (FK → profiles.id)
    ├─ role_id (FK → roles.id)
    └─ assigned_at

roles
    ├─ id
    ├─ code (PRESIDENT, SECRETARY, STUDENT, ADMIN)
    ├─ name
    ├─ description
    └─ is_active

role_permissions (JOIN TABLE)
    ├─ role_id (FK → roles.id)
    ├─ permission_id (FK → permissions.id)
    └─ granted_at

permissions
    ├─ id
    ├─ code (organization.view, events.create, etc.)
    ├─ description
    └─ category
```

### Important: What We Do NOT Store

❌ Passwords (Supabase stores these)  
❌ Sessions (Supabase manages these)  
❌ Refresh tokens (Supabase manages these)  
❌ Email verification status (Supabase manages this)  

---

## API Authorization

### Every Protected Endpoint Must:

1. **Receive JWT in Authorization header**
   ```
   Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
   ```

2. **Validate Supabase JWT** (verify signature, expiration)

3. **Extract user_id from JWT claims**

4. **Query profiles table** to get user's auth_user_id

5. **Load user's roles and permissions**

6. **Check if user has required permission**

7. **Execute endpoint OR return 403**

Example:

```python
@router.post("/payments")
async def create_payment(
    payment_data: PaymentSchema,
    authorization: str = Header(None)
):
    # 1. Extract token
    token = authorization.replace("Bearer ", "")
    
    # 2. Validate Supabase JWT
    user_id = validate_supabase_jwt(token)
    
    # 3. Get profile
    profile = db.query(Profile).filter(
        Profile.auth_user_id == user_id
    ).first()
    
    # 4. Load permissions
    permissions = get_user_permissions(profile.id)
    
    # 5. Authorize
    if "payments.create" not in permissions:
        raise ForbiddenException("Permission denied")
    
    # 6. Execute business logic
    payment = create_payment_record(payment_data)
    return payment
```

---

## Major Feature Flows

### 1. Student Account Activation

```
Student (Browser)
    ↓
Visit activation page
    ↓
Sign up with Supabase Auth
    ↓
Enter student ID + last name
    ↓
Submit activation form
    ↓
POST /api/v1/students/activate
    {student_id, email}
    ↓
Backend validates student exists in roster
    ↓
Backend validates last name matches
    ↓
Backend creates profiles record:
    {auth_user_id, student_id, display_name}
    ↓
Backend assigns STUDENT role
    ↓
Redirect to dashboard
```

### 2. Event Registration & QR Attendance

```
Student
    ↓
View event
    ↓
Click "Register"
    ↓
POST /api/v1/events/{id}/register
    (with Supabase JWT)
    ↓
Backend creates registration record
    ↓
Backend returns registration token
    ↓
Frontend generates QR from token
    ↓
Student displays QR at event
    ↓
Officer scans QR
    ↓
Mobile app sends:
    POST /api/v1/attendance/scan
    {qr_payload}
    (with Officer's Supabase JWT)
    ↓
Backend validates registration token
    ↓
Backend prevents duplicate attendance
    ↓
Backend records attendance
```

### 3. Payment Recording

```
Treasurer (Dashboard)
    ↓
Open "Membership Payments"
    ↓
Search student
    ↓
Click "Record Payment"
    ↓
Enter amount, date, method
    ↓
Submit
    ↓
POST /api/v1/payments
    (with Supabase JWT)
    ↓
Backend verifies:
  - User has permissions.create permission
  - Student exists
  - Amount is valid
    ↓
Backend creates payment record
    ↓
Backend updates membership ledger:
    paid_amount = SUM(payments)
    balance = required - paid_amount
    ↓
Audit log created
    ↓
Notification sent to student
```

### 4. Student Roster Import

```
System Admin
    ↓
Go to "Import Students"
    ↓
Select school year
    ↓
Upload Excel file
    ↓
POST /api/v1/students/import/preview
    ↓
Backend:
  - Reads Excel
  - Validates columns
  - Validates rows
  - Detects duplicates
  - Returns preview
    ↓
Frontend shows summary:
  Total: 500
  Valid: 485
  Invalid: 15
  Duplicates: 5
    ↓
Admin reviews errors
    ↓
Admin clicks "Confirm Import"
    ↓
POST /api/v1/students/import/execute
    ↓
Backend (in transaction):
  - Create/update student records
  - Link to school year
  - Create import history
    ↓
Rollback if any error
    ↓
Return import summary
```

---

## Security Considerations

### Authentication

✅ **Supabase Auth** - Industry-standard, managed solution  
✅ **JWT validation** - Backend verifies every token  
✅ **HTTPS only** - All communication encrypted  
✅ **No password storage** - Supabase responsibility  

### Authorization

✅ **Backend authorization** - Every endpoint checks permissions  
✅ **Permission-based** - Not hardcoded role names  
✅ **Explicit permissions** - Each role lists exact permissions  
✅ **Audit logging** - Critical actions logged  

### Data Security

✅ **No hard deletes** - Financial records voided, not deleted  
✅ **Immutable audit logs** - Financial history preserved  
✅ **Foreign key constraints** - Data integrity enforced  
✅ **Transactions** - Atomic operations (especially imports)  

### Infrastructure

✅ **Supabase managed** - PostgreSQL, backups, updates  
✅ **Storage for uploads** - Not in database  
✅ **Connection pooling** - High-traffic support  

---

## Phase 2 Implementation Scope

**DO NOT implement yet. These are corrected specifications ONLY.**

Phase 2 will implement:

1. ✅ Supabase Auth integration (frontend + backend validation)
2. ✅ Profiles model with auth_user_id
3. ✅ RBAC system with permission checks
4. ✅ Student activation flow
5. ✅ Protected API endpoints

---

**Next:** Apply corrections to ERD.md, RBAC.md, and API_SPEC.md before proceeding.

