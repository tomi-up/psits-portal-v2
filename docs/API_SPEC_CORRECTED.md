# PSITS Portal V2 - API Specification (CORRECTED)

**Status:** Supabase Auth Integration  
**Date:** August 25, 2026  
**Version:** 2.0.0

---

## Critical Changes

✅ **Supabase Auth** - Frontend uses Supabase Auth SDK  
✅ **JWT Validation** - Backend validates Supabase tokens  
✅ **Authorization Header** - Bearer token in request  
✅ **Permission Checks** - Every endpoint checks permissions  
✅ **No custom login** - Supabase Auth handles signup/login  

---

## Architecture

```
┌─────────────────────┐
│   React Frontend    │
│ (Supabase Auth SDK) │
└────────┬────────────┘
         │ 1. User fills login form
         ↓
┌──────────────────────────────────────────┐
│    Supabase Auth Service                 │
│  (signup, login, password reset, MFA)    │
└────────┬─────────────────────────────────┘
         │ 2. Returns Access Token (JWT)
         ↓
┌─────────────────────┐
│   Store token in    │
│   localStorage      │
└────────┬────────────┘
         │ 3. Add Authorization header to requests
         ↓
┌──────────────────────────────────────────┐
│    FastAPI Backend                       │
│  (Validate JWT, Load User, Authorize)    │
└────────┬─────────────────────────────────┘
         │ 4. Verify token with Supabase
         │ 5. Query PostgreSQL for roles
         │ 6. Check permissions
         ↓
┌──────────────────────────────────────────┐
│    PostgreSQL                            │
│  (profiles, roles, permissions, data)    │
└──────────────────────────────────────────┘
```

---

## HTTP Headers

### Authorization Header

**Format:**
```
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

**Example:**
```
GET /api/v1/payments HTTP/1.1
Host: localhost:8000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

### Response Header

**Include in all responses:**
```
Content-Type: application/json
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1693046400
```

---

## Base URL

```
Development:  http://localhost:8000
Production:   https://api.psits.edu.ph
```

### API Version

All endpoints use `/api/v1/` prefix

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Payment Record"
  },
  "message": "Payment recorded successfully",
  "timestamp": "2026-08-25T10:30:00Z"
}
```

### Error Response

```json
{
  "success": false,
  "error": "PERMISSION_DENIED",
  "message": "You do not have permission to create payments",
  "timestamp": "2026-08-25T10:30:00Z"
}
```

### List Response

```json
{
  "success": true,
  "data": [
    { "id": "1", "name": "Item 1" },
    { "id": "2", "name": "Item 2" }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 100,
    "total_pages": 5
  },
  "message": "Success",
  "timestamp": "2026-08-25T10:30:00Z"
}
```

---

## Authentication & Authorization

### JWT Validation Flow

```python
1. Receive Authorization header
   Authorization: Bearer <token>

2. Extract token
   token = authorization.replace("Bearer ", "")

3. Validate with Supabase
   POST https://your-project.supabase.co/auth/v1/verify
   Header: Authorization: Bearer <token>

4. If valid, extract user_id
   user_id = verified_token["sub"]

5. Query profiles table
   SELECT * FROM profiles WHERE auth_user_id = :user_id

6. Load user roles
   SELECT r.* FROM roles r
   JOIN user_roles ur ON r.id = ur.role_id
   WHERE ur.user_id = :profile_id

7. Load permissions
   SELECT p.* FROM permissions p
   JOIN role_permissions rp ON p.id = rp.permission_id
   WHERE rp.role_id IN (:role_ids)

8. Build permission set
   permissions = {p.code for p in permissions}

9. Check endpoint permission
   if required_permission not in permissions:
       return 403 Forbidden

10. Execute endpoint
```

### Dependency Injection Pattern

```python
from fastapi import Depends, Header
from typing import Optional

async def get_current_user(
    authorization: Optional[str] = Header(None)
) -> User:
    """Dependency to get current authenticated user."""
    
    if not authorization:
        raise UnauthorizedException("Missing Authorization header")
    
    try:
        token = authorization.replace("Bearer ", "")
        user_id = validate_supabase_jwt(token)
        
        profile = db.query(Profile).filter(
            Profile.auth_user_id == user_id
        ).first()
        
        if not profile:
            raise UnauthorizedException("User profile not found")
        
        # Load roles and permissions
        profile.roles = get_user_roles(profile.id)
        profile.permissions = get_user_permissions(profile.id)
        
        return profile
        
    except Exception as e:
        raise UnauthorizedException(str(e))
```

### Using the Dependency

```python
from app.core.security import get_current_user, verify_permission

@router.post("/payments")
async def create_payment(
    data: PaymentSchema,
    current_user: User = Depends(get_current_user)
):
    """Create a payment record."""
    
    # Check permission
    verify_permission(current_user, "payments.create")
    
    # Business logic
    payment = Payment(**data.dict())
    db.add(payment)
    db.commit()
    
    return {
        "success": True,
        "data": payment,
        "message": "Payment recorded successfully"
    }
```

---

## Endpoints

### Authentication Endpoints

**Note:** With Supabase Auth, login/signup/logout are handled by Supabase. Our backend only validates tokens.

#### Verify Token

```
POST /api/v1/auth/verify
```

**Request:**
```json
{
  "token": "eyJhbGc..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "email": "student@up.edu.ph"
  },
  "message": "Token valid"
}
```

**Status Codes:**
- `200` - Token valid
- `401` - Token invalid or expired
- `400` - Missing token

---

#### Get Current User

```
GET /api/v1/auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "auth_user_id": "supabase-uuid",
    "display_name": "John Doe",
    "email": "john@up.edu.ph",
    "profile_image_url": "https://...",
    "roles": [
      {
        "id": "uuid",
        "code": "STUDENT",
        "name": "Student"
      }
    ],
    "permissions": [
      "organization.view",
      "events.view",
      "events.register"
    ],
    "created_at": "2026-01-01T00:00:00Z"
  },
  "message": "Success"
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized
- `404` - User not found

---

### Student Activation

#### Activate Student Account

```
POST /api/v1/students/activate
Content-Type: application/json
```

**Request:**
```json
{
  "student_id": "22-12345",
  "last_name": "Doe"
}
```

**Requirements:**
- User must be signed up with Supabase Auth
- Student must exist in roster
- Last name must match roster
- Student not already activated

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "auth_user_id": "supabase-uuid",
    "student_id": "22-12345",
    "display_name": "John Doe",
    "status": "ACTIVE",
    "school_year": "2026-2027",
    "program": "BSCS",
    "year_level": 3
  },
  "message": "Account activated successfully"
}
```

**Status Codes:**
- `201` - Created
- `400` - Invalid student info
- `409` - Already activated
- `404` - Student not found

---

### Events

#### List Events

```
GET /api/v1/events
Authorization: Bearer <token>
```

**Query Parameters:**
```
?page=1&per_page=20&status=PUBLISHED&school_year_id=uuid
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Welcome Assembly",
      "slug": "welcome-assembly",
      "description": "...",
      "venue": "Multipurpose Hall",
      "banner_url": "https://...",
      "starts_at": "2026-09-01T09:00:00Z",
      "ends_at": "2026-09-01T11:00:00Z",
      "registration_open": "2026-08-20T00:00:00Z",
      "registration_close": "2026-08-31T23:59:59Z",
      "capacity": 500,
      "registered_count": 145,
      "is_published": true
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 50,
    "total_pages": 3
  },
  "message": "Success"
}
```

**Status Codes:**
- `200` - Success
- `401` - Unauthorized

---

#### Create Event

```
POST /api/v1/events
Authorization: Bearer <token>
Content-Type: application/json
```

**Required Permission:** `events.create`

**Request:**
```json
{
  "school_year_id": "uuid",
  "title": "Welcome Assembly",
  "slug": "welcome-assembly",
  "description": "Kick-off event for the year",
  "venue": "Multipurpose Hall",
  "banner_url": "https://...",
  "starts_at": "2026-09-01T09:00:00Z",
  "ends_at": "2026-09-01T11:00:00Z",
  "registration_open": "2026-08-20T00:00:00Z",
  "registration_close": "2026-08-31T23:59:59Z",
  "capacity": 500
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Welcome Assembly",
    "created_by": "uuid",
    "is_published": false,
    "created_at": "2026-08-25T10:30:00Z"
  },
  "message": "Event created successfully"
}
```

**Status Codes:**
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `403` - Forbidden

---

#### Register for Event

```
POST /api/v1/events/{event_id}/register
Authorization: Bearer <token>
Content-Type: application/json
```

**Required Permission:** `events.register`

**Request:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registration_id": "uuid",
    "event_id": "uuid",
    "student_id": "uuid",
    "registration_token": "opaque-token-hash",
    "qr_code": "data:image/png;base64,...",
    "registered_at": "2026-08-25T10:30:00Z",
    "status": "ACTIVE"
  },
  "message": "Registered successfully"
}
```

**Status Codes:**
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `409` - Already registered

---

### Attendance

#### Scan QR Code

```
POST /api/v1/attendance/scan
Authorization: Bearer <token>
Content-Type: application/json
```

**Required Permission:** `attendance.scan`

**Request:**
```json
{
  "qr_payload": "registration-token-from-qr",
  "event_id": "uuid",
  "status": "PRESENT"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "attendance_id": "uuid",
    "student_id": "uuid",
    "event_id": "uuid",
    "status": "PRESENT",
    "recorded_by": "uuid",
    "recorded_at": "2026-09-01T09:30:00Z"
  },
  "message": "Attendance recorded"
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid QR payload
- `401` - Unauthorized
- `403` - Forbidden
- `409` - Duplicate attendance

---

#### View Attendance

```
GET /api/v1/attendance
Authorization: Bearer <token>
```

**Query Parameters:**
```
?event_id=uuid&student_id=uuid&status=PRESENT&page=1
```

**Required Permission:** `attendance.view`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "student_id": "uuid",
      "student_name": "John Doe",
      "event_id": "uuid",
      "event_title": "Welcome Assembly",
      "status": "PRESENT",
      "recorded_by": "uuid",
      "recorded_at": "2026-09-01T09:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 145,
    "total_pages": 8
  },
  "message": "Success"
}
```

---

### Payments

#### Create Payment

```
POST /api/v1/payments
Authorization: Bearer <token>
Content-Type: application/json
```

**Required Permission:** `payments.create`

**Request:**
```json
{
  "membership_ledger_id": "uuid",
  "amount": 500,
  "payment_date": "2026-08-25",
  "method": "TRANSFER",
  "reference": "BDO-12345-ABC",
  "notes": "Membership fee payment"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "membership_ledger_id": "uuid",
    "student_name": "John Doe",
    "amount": 500,
    "payment_date": "2026-08-25",
    "method": "TRANSFER",
    "reference": "BDO-12345-ABC",
    "status": "ACTIVE",
    "recorded_by": "uuid",
    "created_at": "2026-08-25T10:30:00Z"
  },
  "message": "Payment recorded successfully"
}
```

**Status Codes:**
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Ledger not found

---

#### Void Payment

```
POST /api/v1/payments/{payment_id}/void
Authorization: Bearer <token>
Content-Type: application/json
```

**Required Permission:** `payments.void`

**Request:**
```json
{
  "reason": "Entry error"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "VOIDED",
    "void_reason": "Entry error",
    "voided_by": "uuid",
    "voided_at": "2026-08-25T11:00:00Z",
    "original_amount": 500
  },
  "message": "Payment voided successfully"
}
```

**Important:**
- ✅ Payment marked as VOIDED
- ✅ Original amount preserved
- ✅ Audit trail maintained
- ❌ NO hard delete
- ❌ Cannot be undone

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Payment not found
- `409` - Payment already voided

---

#### List Payments

```
GET /api/v1/payments
Authorization: Bearer <token>
```

**Query Parameters:**
```
?membership_ledger_id=uuid&status=ACTIVE&method=TRANSFER&page=1
```

**Required Permission:** `payments.view`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "membership_ledger_id": "uuid",
      "student_name": "John Doe",
      "amount": 500,
      "payment_date": "2026-08-25",
      "method": "TRANSFER",
      "status": "ACTIVE",
      "recorded_at": "2026-08-25T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 250,
    "total_pages": 13
  },
  "message": "Success"
}
```

---

### Remittances

#### Create Remittance

```
POST /api/v1/remittances
Authorization: Bearer <token>
Content-Type: application/json
```

**Required Permission:** `remittance.create`

**Request:**
```json
{
  "school_year_id": "uuid",
  "payment_ids": ["uuid", "uuid", "uuid"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "school_year_id": "uuid",
    "total_amount": 5000,
    "payment_count": 10,
    "status": "DRAFT",
    "submitted_by": "uuid",
    "created_at": "2026-08-25T10:30:00Z"
  },
  "message": "Remittance created"
}
```

**Status Codes:**
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `403` - Forbidden

---

#### Approve Remittance

```
POST /api/v1/remittances/{remittance_id}/approve
Authorization: Bearer <token>
Content-Type: application/json
```

**Required Permission:** `remittance.approve`

**Request:**
```json
{
  "notes": "Approved"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "APPROVED",
    "approved_at": "2026-08-25T11:00:00Z"
  },
  "message": "Remittance approved"
}
```

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `401` - Unauthorized
- `403` - Forbidden
- `409` - Invalid state

---

### Students

#### Import Students (Preview)

```
POST /api/v1/students/import/preview
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Required Permission:** `students.import`

**Form Data:**
```
file: (Excel file)
school_year_id: uuid
```

**Response:**
```json
{
  "success": true,
  "data": {
    "import_id": "uuid",
    "total_rows": 500,
    "valid_rows": 485,
    "invalid_rows": 15,
    "duplicate_rows": 5,
    "errors": [
      {
        "row": 3,
        "reason": "Missing last name",
        "data": {"student_id": "22-12345"}
      }
    ],
    "preview": [
      {
        "student_id": "22-12345",
        "first_name": "John",
        "last_name": "Doe",
        "program": "BSCS"
      }
    ]
  },
  "message": "Import preview ready"
}
```

---

#### Import Students (Execute)

```
POST /api/v1/students/import/execute
Authorization: Bearer <token>
Content-Type: application/json
```

**Required Permission:** `students.import`

**Request:**
```json
{
  "import_id": "uuid",
  "confirm": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "import_id": "uuid",
    "school_year_id": "uuid",
    "total_rows": 500,
    "imported_rows": 485,
    "updated_rows": 10,
    "failed_rows": 5,
    "import_status": "COMPLETED",
    "imported_at": "2026-08-25T11:30:00Z",
    "error_log": [
      {
        "student_id": "22-99999",
        "reason": "Duplicate entry"
      }
    ]
  },
  "message": "Import completed"
}
```

**Status Codes:**
- `200` - Success
- `400` - Validation error
- `401` - Unauthorized
- `403` - Forbidden
- `422` - Import failed

---

### Announcements

#### Create Announcement

```
POST /api/v1/announcements
Authorization: Bearer <token>
Content-Type: application/json
```

**Required Permission:** `announcements.create`

**Request:**
```json
{
  "title": "Welcome to PSITS",
  "content": "We are excited to welcome you...",
  "priority": "HIGH",
  "expires_at": "2026-09-01T00:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Welcome to PSITS",
    "status": "DRAFT",
    "created_by": "uuid",
    "created_at": "2026-08-25T10:30:00Z"
  },
  "message": "Announcement created"
}
```

---

#### List Announcements

```
GET /api/v1/announcements
```

**Query Parameters:**
```
?status=PUBLISHED&page=1&per_page=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Welcome to PSITS",
      "content": "We are excited...",
      "priority": "HIGH",
      "status": "PUBLISHED",
      "published_at": "2026-08-25T10:30:00Z",
      "expires_at": "2026-09-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 10,
    "total": 25,
    "total_pages": 3
  },
  "message": "Success"
}
```

---

## Error Codes

| Code | Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource state conflict (e.g., already registered) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

**Limits per minute (per user):**
- Public endpoints: 60 requests
- Protected endpoints: 1000 requests
- Payment endpoints: 100 requests
- Import endpoints: 10 requests

**Response headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1693046460
```

---

## Pagination

**Query parameters:**
```
?page=1&per_page=20
```

**Response:**
```json
{
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

---

## Implementation Notes

### Backend Validation

Every endpoint must:
1. ✅ Validate token in Authorization header
2. ✅ Query Supabase to verify token
3. ✅ Load user profile from database
4. ✅ Load roles and permissions
5. ✅ Check required permission
6. ✅ Execute business logic
7. ✅ Log action in audit trail

### Frontend Usage

```javascript
// 1. User logs in with Supabase Auth
const { data, error } = await supabase.auth.signInWithPassword({
  email: "student@up.edu.ph",
  password: "password"
});

// 2. Store token
const token = data.session.access_token;

// 3. Use token in API calls
const response = await fetch('/api/v1/events', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

---

**Status:** ✅ API Specification Complete  
**Ready for:** Phase 2 Implementation

