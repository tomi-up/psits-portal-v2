# PSITS Portal V2 - RBAC System (CORRECTED)

**Status:** Architecture Corrections Applied  
**Date:** August 25, 2026  
**Authorization Model:** Permission-Based (not role-based)

---

## Core Principle

### Permission-Based Authorization

✅ **CORRECT:**
```python
if "payments.create" in current_user.permissions:
    allow_action()
```

❌ **WRONG:**
```python
if current_user.role == "Treasurer":
    allow_action()
```

**Why:** Roles are templates. Permissions are facts. A user may inherit permissions from multiple roles or have exceptions. Always check the permission, not the role name.

---

## Role Hierarchy

```
┌─────────────────────────────────────┐
│     SYSTEM ADMIN                    │
│  (separate from organization)       │
├─────────────────────────────────────┤
│ users.manage                        │
│ roles.manage                        │
│ permissions.manage                  │
│ school_years.manage                 │
│ students.import                     │
│ audit_logs.view                     │
│ system_settings.manage              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  EXECUTIVE (Full Org Access)        │
│  President, VP Internal, VP External│
├─────────────────────────────────────┤
│ Inherits: ALL permissions           │
│ Audit: ALL actions logged           │
│ Can: Manage all organization areas  │
└─────────────────────────────────────┘
  └─ Specialized Roles
     ├─ President (+ ceremonial)
     ├─ VP Internal (+ operations)
     └─ VP External (+ external relations)

┌─────────────────────────────────────┐
│  OPERATIONS Roles                   │
│  Secretary, Events, PIO, M&W        │
├─────────────────────────────────────┤
│ organization.view                   │
│ events.view, events.create/update   │
│ attendance.view, attendance.scan    │
│ announcements.view                  │
│ + role-specific permissions         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  FINANCE Roles                      │
│  Treasurer, Asst Treasurer, Finance │
├─────────────────────────────────────┤
│ payments.view, payments.create      │
│ payments.void (NOT delete)          │
│ remittance.view, remittance.create  │
│ reports.view                        │
├─────────────────────────────────────┤
│ Finance Committee: view/report only │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  STUDENT                            │
│  (Limited personal access)          │
├─────────────────────────────────────┤
│ organization.view                   │
│ events.view, events.register        │
│ attendance.view (own)               │
│ membership.view (own)               │
│ profile.view (own), profile.update  │
└─────────────────────────────────────┘
```

---

## Permission Categories

### 1. User & Access Management

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View users | `users.view` | List all users, view profiles | ADMIN, Executives |
| Create users | `users.create` | Add new users (activate students) | ADMIN |
| Update users | `users.update` | Edit user profiles | ADMIN, Executives |
| Manage users | `users.manage` | Full user lifecycle (suspend, delete) | ADMIN only |
| View roles | `roles.view` | List roles | ADMIN, Executives |
| Manage roles | `roles.manage` | Create, edit, delete roles | ADMIN only |
| Manage permissions | `permissions.manage` | Create, edit role-permission links | ADMIN only |

### 2. Organization Management

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View org | `organization.view` | View org profile, history | All logged-in users |
| Update org | `organization.update` | Edit profile, vision, mission | Executives, Secretary |
| View directory | `directory.view` | View org officers & committees | All logged-in users |
| Update directory | `directory.update` | Manage positions, committee members | PIO, Secretary, Executives |
| View committees | `committees.view` | View committee info | All logged-in users |
| Manage committees | `committees.manage` | Create/edit committees | ADMIN, Executives |

### 3. Event Management

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View events | `events.view` | List published events | All logged-in users |
| Create events | `events.create` | Add new events | Secretary, Events & Logistics, Executives |
| Update events | `events.update` | Edit event details | Secretary, Events & Logistics, Executives |
| Publish events | `events.publish` | Mark event as public | Events & Logistics, Executives |
| Delete events | `events.delete` | Remove events (draft only) | Events & Logistics, Executives |

### 4. Event Registration & Attendance

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View registrations | `event_registrations.view` | See event registrations | Secretary, Events & Logistics, Executives |
| Manage registrations | `event_registrations.manage` | Accept/reject/cancel | Secretary, Events & Logistics, Executives |
| View attendance | `attendance.view` | View attendance records | Secretary, Events & Logistics, M&W, Executives |
| Scan attendance | `attendance.scan` | Mark present via QR/manual | Secretary, Events & Logistics, Officers |
| Record attendance | `attendance.record` | Manually add attendance | Secretary, Officers |

### 5. Membership Management

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View membership | `membership.view` | View membership requirements, ledgers | M&W, Finance roles, Executives |
| Manage membership | `membership.manage` | Set fees, view detailed ledger | M&W Committee, Treasurer, Executives |
| View membership fees | `membership_fees.view` | See fee schedule | All logged-in users |

### 6. Financial Management

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View payments | `payments.view` | See payment history | Treasurer, Asst Treasurer, Finance Committee, Executives |
| Create payments | `payments.create` | Record new payments | Treasurer, Asst Treasurer, Executives |
| Update payments | `payments.update` | Correct payment details | Treasurer, Executives |
| Void payments | `payments.void` | Mark payment as voided (NOT delete) | Treasurer, Executives |
| View remittances | `remittance.view` | See remittance history | Finance roles, Executives |
| Create remittances | `remittance.create` | Submit new remittance | Treasurer, Executives |
| Update remittances | `remittance.update` | Modify remittance details | Treasurer, Executives |
| Approve remittances | `remittance.approve` | Approve submitted remittance | Finance Committee, Executives |

### 7. Inventory Management

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View inventory | `inventory.view` | See asset list | Treasurer, All Finance roles, Executives |
| Manage inventory | `inventory.manage` | Add/edit/remove assets | Treasurer, Executives |
| Borrow assets | `inventory.borrow` | Request/return asset | All members (if policy allows) |

### 8. Sanctions & Fines

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View sanctions | `sanctions.view` | See active sanctions | M&W, Executives |
| Create sanctions | `sanctions.create` | Issue sanctions/fines | M&W, Executives |
| Update sanctions | `sanctions.update` | Modify sanctions | M&W, Executives |
| Settle sanctions | `sanctions.settle` | Mark sanctions as paid | M&W, Treasurer, Executives |

### 9. Content & Communications

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View announcements | `announcements.view` | See published announcements | All logged-in users |
| Create announcements | `announcements.create` | Post new announcement | PIO, Executives |
| Update announcements | `announcements.update` | Edit/archive announcements | PIO, Executives |
| Manage featured content | `content.manage` | Edit homepage featured items | PIO, Executives |
| Manage landing page | `content.landing` | Control landing page layout | PIO, Executives |

### 10. Student Management

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View students | `students.view` | List students, see enrollment | ADMIN, M&W, Executives |
| Create students | `students.create` | Manually add students | ADMIN, Executives |
| Update students | `students.update` | Edit student records | ADMIN, Executives |
| Import students | `students.import` | Bulk import from Excel | ADMIN only |
| Export students | `students.export` | Download student lists | ADMIN, Executives |

### 11. School Year Management

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View school years | `school_years.view` | See active/past years | ADMIN, Executives |
| Manage school years | `school_years.manage` | Create/activate/deactivate years | ADMIN only |

### 12. Reporting & Analytics

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View reports | `reports.view` | Access reporting dashboard | Finance roles, Executives, M&W |
| Generate reports | `reports.generate` | Export data reports | Finance roles, Executives |
| View audit logs | `audit_logs.view` | See audit trail | ADMIN, Executives |

### 13. System Settings

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View settings | `settings.view` | See system configuration | ADMIN |
| Manage settings | `settings.manage` | Edit configuration, email templates | ADMIN only |

### 14. QR & Personal Access

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View QR | `qr.view` | See own QR code | Students, All members |
| Generate QR | `qr.generate` | Create QR for event | Students, All members |
| Scan QR | `qr.scan` | Use scanner app | Officers, staff |

### 15. Personal Profile

| Permission | Code | Description | Who Gets It |
|---|---|---|---|
| View own profile | `profile.view` | See personal info | All logged-in users |
| Update own profile | `profile.update` | Edit personal info | All logged-in users |

---

## Role Definitions

### SYSTEM ADMIN

**Category:** System  
**Access Level:** Full system control (NOT organization control)  
**Typical Users:** Department IT staff, portal administrator

**Permissions Assigned:**
- `users.manage` - Full user lifecycle
- `roles.manage` - Manage role definitions
- `permissions.manage` - Manage permission matrix
- `school_years.manage` - Create/manage academic years
- `students.view` - View all students
- `students.import` - Bulk import students
- `students.export` - Export student data
- `audit_logs.view` - View audit trail
- `settings.manage` - System configuration

**Data Access:**
- All user accounts
- All students
- All roles/permissions
- All audit records
- System configuration

**Restrictions:**
- Cannot create events
- Cannot record payments
- Cannot manage memberships
- Cannot assume officer roles
- Full audit logging

---

### PRESIDENT

**Category:** Executive  
**Access Level:** Full organization control  
**Typical Users:** Organization president

**Permissions Assigned:**
- ALL permissions
- (Inherits executive permissions)

**Additional:**
- Sign-off authority for official documents
- Ceremonial leader
- Reports to faculty advisor

**Data Access:**
- All organization data
- All member data
- All financial records

**Audit Logging:**
- Every action logged

---

### VP INTERNAL

**Category:** Executive  
**Access Level:** Full organization control + Internal operations  
**Typical Users:** VP Internal

**Permissions Assigned:**
- ALL permissions
- (Inherits executive permissions)

**Additional:**
- Primary point for internal coordination
- Manages day-to-day operations
- Coordinates between departments

**Data Access:**
- Same as President

---

### VP EXTERNAL

**Category:** Executive  
**Access Level:** Full organization control + External relations  
**Typical Users:** VP External

**Permissions Assigned:**
- ALL permissions
- (Inherits executive permissions)

**Additional:**
- Liaison with external partners
- Represents organization publicly
- Manages partnerships

**Data Access:**
- Same as President

---

### SECRETARY

**Category:** Operations  
**Access Level:** Event & meeting coordination  
**Typical Users:** Organization secretary

**Permissions Assigned:**
- `organization.view` - View org info
- `organization.update` - Edit org profile
- `events.view` - See all events
- `events.create` - Add new events
- `events.update` - Edit event details
- `event_registrations.view` - See registrations
- `event_registrations.manage` - Accept/reject/cancel
- `attendance.view` - View attendance
- `attendance.scan` - Mark attendance
- `attendance.record` - Manual entry
- `announcements.view` - See announcements
- `directory.view` - See officers
- `directory.update` - Manage positions
- `reports.view` - Access reports

**Data Access:**
- Event records
- Attendance records
- Organization directory
- Reports (events, attendance)

**Audit Logging:**
- All actions logged

---

### ASSISTANT SECRETARY

**Category:** Operations  
**Access Level:** Event & meeting coordination (limited)  
**Typical Users:** Assistant secretary

**Permissions Assigned:**
- `organization.view`
- `events.view`
- `events.update` - (no create)
- `event_registrations.view` - (no manage)
- `attendance.view`
- `attendance.scan`
- `announcements.view`
- `directory.view`
- `reports.view`

**Restrictions:**
- Cannot create new events
- Cannot manage event registrations
- No attendance editing
- View-only mode

---

### M&W COMMITTEE

**Category:** Operations  
**Access Level:** Membership management  
**Typical Users:** Membership & Welfare committee chair, members

**Permissions Assigned:**
- `organization.view`
- `membership.view` - View requirements
- `membership.manage` - Full membership control
- `membership_fees.view`
- `students.view` - View roster
- `sanctions.view` - See sanctions
- `sanctions.create` - Issue sanctions
- `sanctions.update` - Modify sanctions
- `attendance.view` - Track attendance
- `directory.view`
- `reports.view`

**Data Access:**
- Membership ledgers
- Student roster
- Sanctions & fines
- Attendance records

---

### EVENTS & LOGISTICS

**Category:** Operations  
**Access Level:** Event logistics  
**Typical Users:** Events & Logistics committee, coordinators

**Permissions Assigned:**
- `organization.view`
- `events.view`
- `events.create`
- `events.update`
- `events.publish` - Publish events publicly
- `event_registrations.view`
- `event_registrations.manage`
- `attendance.view`
- `attendance.scan`
- `attendance.record`
- `announcements.view`
- `directory.view`
- `reports.view`

**Data Access:**
- Event records
- Registrations
- Attendance
- Event reports

---

### PIO (Public Information Officer)

**Category:** Operations  
**Access Level:** Communications  
**Typical Users:** PIO, media coordinator

**Permissions Assigned:**
- `organization.view`
- `announcements.view`
- `announcements.create` - Post announcements
- `announcements.update` - Edit/archive
- `content.manage` - Featured content
- `content.landing` - Landing page
- `events.view`
- `directory.view`
- `directory.update` - Update org directory
- `profile.view`

**Data Access:**
- Announcement content
- Featured content
- Organization directory
- Organization profile

---

### TREASURER

**Category:** Finance  
**Access Level:** Full financial control  
**Typical Users:** Organization treasurer

**Permissions Assigned:**
- `organization.view`
- `payments.view` - See all payments
- `payments.create` - Record payments
- `payments.update` - Correct entries
- `payments.void` - **NOT delete** ❌ NO hard delete
- `remittance.view`
- `remittance.create` - Submit remittances
- `remittance.update` - Edit remittances
- `remittance.approve` - Approve (if also Finance Committee)
- `inventory.view`
- `inventory.manage` - Add/edit assets
- `membership.view`
- `membership.manage`
- `reports.view` - Financial reports
- `reports.generate` - Export data
- `audit_logs.view` - View audit trail

**Data Access:**
- All payment records
- Remittances
- Inventory
- Membership ledgers
- Financial reports

**Critical Constraints:**
- ✅ Can VOID payments (preserve audit trail)
- ❌ CANNOT delete payments (no hard delete)
- All changes logged in audit trail

---

### ASSISTANT TREASURER

**Category:** Finance  
**Access Level:** Financial records (limited)  
**Typical Users:** Assistant treasurer

**Permissions Assigned:**
- `organization.view`
- `payments.view` - See payments
- `payments.create` - Record payments
- `payments.update` - Correct entries
- (NO void access - Treasurer only)
- `remittance.view`
- `remittance.create` - Submit
- (NO remittance.update - Treasurer only)
- `inventory.view` - (no manage)
- `membership.view`
- `reports.view`

**Restrictions:**
- Cannot void payments
- Cannot edit remittances
- Cannot manage inventory
- Limited editing rights

---

### FINANCE COMMITTEE

**Category:** Finance  
**Access Level:** Financial oversight  
**Typical Users:** Finance Committee members

**Permissions Assigned:**
- `organization.view`
- `payments.view` - View only
- `remittance.view` - View only
- `reports.view` - View/generate
- `reports.generate`
- `audit_logs.view`

**Restrictions:**
- View/report only
- No create/edit/delete
- No payment void
- No inventory management

---

### STUDENT

**Category:** Member  
**Access Level:** Personal access only  
**Typical Users:** Student members

**Permissions Assigned:**
- `organization.view` - See org info
- `events.view` - See published events
- `events.register` - Register for events
- `event_registrations.view` - See own registrations
- `attendance.view` - See own attendance
- `membership.view` - See own membership status
- `membership_fees.view` - See fee requirements
- `announcements.view` - See announcements
- `directory.view` - See org directory
- `profile.view` - See own profile
- `profile.update` - Edit own profile
- `qr.view` - See own QR code
- `qr.generate` - Generate QR for events
- `qr.scan` - Use QR scanner app

**Data Access:**
- Own profile only
- Own registrations
- Own attendance records
- Own membership ledger
- Published content only

**Restrictions:**
- Cannot see other students' data
- Cannot create/edit/delete anything
- Cannot access admin/financial features
- Cannot access officer features

---

## Permission Inheritance Matrix

### Executives (President, VP Internal, VP External)

| Category | Permission | Granted |
|---|---|---|
| Users | users.manage | ✓ |
| | roles.manage | ✓ |
| | permissions.manage | ✓ |
| Organization | organization.* | ✓ |
| Events | events.* | ✓ |
| Registrations | event_registrations.* | ✓ |
| Attendance | attendance.* | ✓ |
| Membership | membership.* | ✓ |
| Finance | payments.* (including void) | ✓ |
| | remittance.* | ✓ |
| Inventory | inventory.* | ✓ |
| Students | students.* | ✓ |
| Content | announcements.* | ✓ |
| | content.* | ✓ |
| System | school_years.manage | ✓ |
| | audit_logs.view | ✓ |

**Audit:** Every action logged

---

### Operations Roles

| Permission | Secretary | Asst Sec | M&W | Events | PIO |
|---|---|---|---|---|---|
| organization.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| organization.update | ✓ | | | | |
| events.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| events.create | ✓ | | | ✓ | |
| events.update | ✓ | ✓ | | ✓ | |
| events.publish | | | | ✓ | |
| event_registrations | ✓ | ✗ | | ✓ | |
| attendance | ✓ | ✓ | ✓ | ✓ | |
| membership | | | ✓ | | |
| sanctions | | | ✓ | | |
| announcements | ✓ | | | ✓ | ✓ |
| content.manage | | | | | ✓ |
| directory | ✓ | ✓ | ✓ | ✓ | ✓ |

---

### Finance Roles

| Permission | Treasurer | Asst Treasurer | Finance Committee |
|---|---|---|---|
| payments.view | ✓ | ✓ | ✓ |
| payments.create | ✓ | ✓ | ✗ |
| payments.update | ✓ | ✓ | ✗ |
| payments.void | ✓ | ✗ | ✗ |
| remittance.view | ✓ | ✓ | ✓ |
| remittance.create | ✓ | ✓ | ✗ |
| remittance.update | ✓ | ✗ | ✗ |
| remittance.approve | ✓ | ✗ | ✓ |
| reports | ✓ | ✓ | ✓ |
| audit_logs.view | ✓ | ✗ | ✗ |

**Key Rule:**
- ✅ payments.void (leaves audit trail)
- ❌ NO payments.delete (no hard delete)

---

## Authorization Checks in Code

### Pattern 1: Simple Permission Check

```python
@router.post("/payments")
async def create_payment(
    data: PaymentSchema,
    current_user: User = Depends(get_current_user)
):
    # Check permission
    if "payments.create" not in current_user.permissions:
        raise ForbiddenException("Permission denied")
    
    # Execute
    payment = create_payment_record(data)
    return payment
```

### Pattern 2: Multiple Permissions (ANY)

```python
@router.get("/reports")
async def view_reports(
    current_user: User = Depends(get_current_user)
):
    # Check if user has ANY report permission
    required = {"reports.view", "reports.generate"}
    if not required.intersection(current_user.permissions):
        raise ForbiddenException("Permission denied")
    
    # Execute
    reports = generate_reports()
    return reports
```

### Pattern 3: Multiple Permissions (ALL)

```python
@router.post("/remittance/approve")
async def approve_remittance(
    remittance_id: str,
    current_user: User = Depends(get_current_user)
):
    # Check all permissions
    required = {"remittance.view", "remittance.approve"}
    if not required.issubset(current_user.permissions):
        raise ForbiddenException("Permission denied")
    
    # Execute
    remittance = approve_remittance_record(remittance_id)
    return remittance
```

### Pattern 4: Role-Based Check (Use Sparingly)

```python
# Only when specifically needed (rare cases)
@router.get("/org/settings")
async def org_settings(
    current_user: User = Depends(get_current_user)
):
    # Rare case: only executives can access
    if "executives" not in current_user.roles:
        raise ForbiddenException("Permission denied")
    
    # Execute
    settings = get_org_settings()
    return settings
```

### Pattern 5: Owner Check + Permission

```python
@router.get("/profile/{user_id}")
async def get_profile(
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    # Check permission
    if "users.view" not in current_user.permissions:
        # Allow viewing own profile
        if current_user.id != user_id:
            raise ForbiddenException("Permission denied")
    
    # Execute
    profile = get_user_profile(user_id)
    return profile
```

---

## Special Cases

### Void vs Delete

**Payments MUST be voided, not deleted:**

```python
@router.post("/payments/{id}/void")
async def void_payment(
    payment_id: str,
    reason: str,
    current_user: User = Depends(get_current_user)
):
    # Check permission
    if "payments.void" not in current_user.permissions:
        raise ForbiddenException("Permission denied")
    
    # Execute void (NOT delete)
    payment = db.query(Payment).get(payment_id)
    payment.status = PaymentStatus.VOIDED
    payment.void_reason = reason
    payment.voided_by = current_user.id
    payment.voided_at = datetime.utcnow()
    db.commit()
    
    # Audit logged automatically
    return payment
```

### Personal Data Access

**Users can always access their own data:**

```python
@router.get("/profile/me")
async def get_my_profile(
    current_user: User = Depends(get_current_user)
):
    # No permission check needed - always allow own profile
    return current_user.profile
```

### Audit-Logged Actions

**All role/permission changes are logged:**

```python
# These actions are ALWAYS audited:
- users.manage (create/edit/delete user)
- roles.manage (create/edit/delete role)
- permissions.manage (change role permissions)
- payments.void (void any payment)
- remittance.approve (approve remittance)
- sanctions.create (create sanction)
- school_years.manage (activate/deactivate year)
```

---

## Migration Guide (Old → New)

### From Role-Based Check

```python
# OLD (WRONG)
if current_user.role in ["Treasurer", "President", "VP Internal"]:
    allow_payment()

# NEW (CORRECT)
if "payments.create" in current_user.permissions:
    allow_payment()
```

### From Multiple Role Checks

```python
# OLD (WRONG)
if current_user.role in ["Secretary", "Events & Logistics"]:
    allow_event_creation()

# NEW (CORRECT)
if "events.create" in current_user.permissions:
    allow_event_creation()
```

### From Named Permissions

```python
# OLD (WRONG)
if "admin" in current_user.roles:
    allow_action()

# NEW (CORRECT)
if "users.manage" in current_user.permissions:
    allow_action()
```

---

## Audit Logging

### Logged Actions

Every action with these permissions is logged:

```
- users.manage (any user change)
- roles.manage (any role change)
- permissions.manage (any permission change)
- payments.void (every void)
- payments.create (every payment)
- remittance.* (all remittance actions)
- sanctions.* (all sanctions)
- school_years.manage (all year changes)
- audit_logs.view (who accessed logs)
- settings.manage (all config changes)
```

### Audit Log Entry

```json
{
  "user_id": "uuid",
  "action": "payment_voided",
  "entity_type": "payment",
  "entity_id": "uuid",
  "old_values": {
    "status": "ACTIVE",
    "amount": 500
  },
  "new_values": {
    "status": "VOIDED",
    "void_reason": "Entry error",
    "voided_by": "uuid",
    "voided_at": "2026-08-25T10:30:00Z"
  },
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "created_at": "2026-08-25T10:30:00Z"
}
```

---

**Status:** ✅ RBAC Architecture Corrected  
**Ready for:** Phase 2 Implementation

