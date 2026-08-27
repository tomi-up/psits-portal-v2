# PSITS Portal V2: Passwordless Student Authentication Design

**Status:** Design Phase - Awaiting Approval  
**Date:** August 26, 2026  
**Decision Required:** Supabase MFA API vs. App-Level TOTP Storage

---

## 1. AUTHENTICATION FLOWS

### 1.1 Student Login Flow (Passwordless)

```
┌─────────────────────────────────────────────────────────────┐
│              STUDENT PASSWORDLESS LOGIN                     │
└─────────────────────────────────────────────────────────────┘

FRONTEND (LoginPage.tsx - NEW STUDENT FLOW)
┌─────────────────────────────────────────────────────────────┐
│ Screen: Student Login                                        │
│                                                               │
│ Fields:                                                      │
│   - Student ID (e.g., 20-12345)                             │
│   - Authenticator Code (6-digit from authenticator app)     │
│                                                               │
│ User enters credentials → Click "Sign In"                   │
│                                                               │
│ JavaScript:                                                  │
│   const response = await api.post('/auth/student-login', {  │
│     student_id: "20-12345",                                │
│     authenticator_code: "123456"                            │
│   });                                                        │
│   // response.access_token used for all subsequent requests│
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP POST
BACKEND (auth endpoints)
┌─────────────────────────────────────────────────────────────┐
│ POST /api/v1/auth/student-login                             │
│                                                               │
│ 1. Validate input                                           │
│    - student_id format valid?                              │
│    - authenticator_code is 6 digits?                       │
│                                                               │
│ 2. Look up student by student_id                           │
│    SELECT * FROM students WHERE student_id = ?;            │
│    Result: student_id, first_name, last_name               │
│                                                               │
│ 3. Get linked profile                                       │
│    SELECT * FROM profiles WHERE student_id_fk = ?;         │
│    Result: auth_user_id, email, status                     │
│                                                               │
│ 4. Get MFA secret                                           │
│    SELECT * FROM student_mfa_secrets WHERE profile_id = ?; │
│    Result: secret_encrypted, is_active                     │
│                                                               │
│ 5. VALIDATE TOTP CODE                                       │
│    [DECISION POINT - See section 2 below]                  │
│                                                               │
│    Option A: Supabase MFA API                              │
│    ──────────────────────────────────────────────────       │
│    - Call Supabase: supabase.rpc('verify_mfa_totp', {...}) │
│    - Supabase validates against their stored secret         │
│    - Limitation: Requires Supabase secret to match          │
│                                                               │
│    Option B: App-Level Validation                          │
│    ──────────────────────────────────────────────────       │
│    - Decrypt secret_encrypted using app key                │
│    - Use pyotp library to validate code                     │
│    - Check time window (±1 period = ±30 seconds)           │
│    - Check against used_codes (replay prevention)          │
│                                                               │
│ 6. If TOTP valid:                                           │
│    - Create Supabase session using Service Role Key         │
│    - Query: POST /auth/v1/user/sessions                     │
│      (admin endpoint, requires service_role_key)            │
│    - Return: { access_token, expires_in }                  │
│                                                               │
│ 7. If TOTP invalid:                                         │
│    - Increment failed_attempts counter                      │
│    - If failed_attempts >= 5:                              │
│      Lock account for 15 minutes                            │
│    - Return: 401 Unauthorized                               │
│                                                               │
│ 8. Log audit event (no PII)                                 │
│    INSERT INTO audit_logs (...)                             │
│    Values: action='student_login_success',                 │
│           entity_id=<profile_id>,                          │
│           timestamp=now()                                   │
│                                                               │
│ Response: { access_token, expires_in, user: {...} }        │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP 200
FRONTEND
┌─────────────────────────────────────────────────────────────┐
│ Store access_token in Zustand authStore                     │
│   useAuthStore.setState({ session: { access_token } })     │
│                                                               │
│ Fetch authenticated user data                               │
│   GET /api/v1/auth/me                                       │
│   (Backend validates access_token)                          │
│                                                               │
│ Redirect to /dashboard/student                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Officer/Admin Login Flow (Existing)

```
┌─────────────────────────────────────────────────────────────┐
│              OFFICER/ADMIN EMAIL-BASED LOGIN                │
└─────────────────────────────────────────────────────────────┘

FRONTEND
┌─────────────────────────────────────────────────────────────┐
│ Screen: Login (unchanged from current V2)                   │
│                                                               │
│ Fields:                                                      │
│   - Email                                                    │
│   - Password                                                │
│                                                               │
│ JavaScript:                                                  │
│   const { data, error } = await supabase.auth              │
│     .signInWithPassword({                                  │
│       email: "officer@example.com",                        │
│       password: "..."                                      │
│     });                                                      │
│                                                               │
│ Supabase returns: { session, user }                        │
│ Frontend stores token & redirects                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
BACKEND
┌─────────────────────────────────────────────────────────────┐
│ No backend involvement for sign-in                          │
│ (Supabase handles entirely)                                 │
│                                                               │
│ Later requests:                                             │
│   GET /api/v1/auth/me                                       │
│   Backend validates access_token via Supabase              │
│   Returns profile + roles + permissions                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. DECISION: TOTP STORAGE & VALIDATION

### 2.1 Option A: Supabase Native MFA

**How it works:**
- Supabase Auth has built-in MFA support
- TOTP secrets stored in Supabase (encrypted at rest)
- Supabase provides admin API to manage MFA

**Supabase MFA Flow:**
```
1. During enrollment: Call Supabase to generate TOTP secret
   POST /auth/v1/user/mfa_factors
   { type: "totp" }
   → Supabase returns: { id, secret, qr_code }

2. Verify during setup: Call Supabase to confirm TOTP
   POST /auth/v1/user/mfa_factors/<factor_id>/challenges
   Request: { code: "123456" }

3. During login: Can't use Supabase's standard password flow
   (Would still require password as 1st factor)
   → Must build custom endpoint that validates student_id + TOTP

4. Custom endpoint validates TOTP using Supabase API:
   POST /auth/v1/user/mfa_factors/<factor_id>/challenges
   { code: "123456" }
   If valid: Create session via Supabase Admin API
```

**Advantages:**
- ✅ Secrets never stored in app database
- ✅ Supabase handles encryption/rotation
- ✅ Backup codes managed by Supabase
- ✅ MFA recovery flows built-in
- ✅ Audit logs in Supabase

**Disadvantages:**
- ❌ Requires two Supabase API calls per login (factor challenge + session create)
- ❌ Student ID not part of Supabase user identity
- ❌ Would need to map student_id → auth.users.id first
- ❌ More complex setup code

**Implementation:**
```python
# Supabase native MFA approach
async def student_login_supabase_mfa(student_id: str, code: str):
    # 1. Look up student → get profile.auth_user_id
    student = db.query(Student).filter(...).first()
    profile = db.query(Profile).filter(...).first()
    
    # 2. Get MFA factor from Supabase
    # (Would need to store factor_id mapping in app or query it)
    
    # 3. Verify TOTP via Supabase
    response = await supabase.post(
        f"/auth/v1/mfa/authenticate",
        {
            "credential_id": "<factor_id>",
            "code": code
        },
        headers={"Apikey": settings.supabase_key}
    )
    
    if not response.ok:
        return 401  # Invalid TOTP
    
    # 4. Create session
    session_response = await supabase_admin.post(
        f"/auth/v1/users/{profile.auth_user_id}/session",
        headers={"Authorization": f"Bearer {service_role_key}"}
    )
    
    return session_response["access_token"]
```

---

### 2.2 Option B: App-Level TOTP Storage

**How it works:**
- TOTP secret generated by app (using pyotp library)
- Secret encrypted with AES-256 before storing in app database
- TOTP validation performed by app
- Backup codes generated & stored in app
- Supabase Auth still manages Supabase users, but no MFA integration

**Encryption Strategy:**
```python
from cryptography.fernet import Fernet

# In settings/env:
TOTP_ENCRYPTION_KEY = Fernet.generate_key()  # Must be stored securely

# During enrollment:
def encrypt_totp_secret(plaintext_secret: str) -> str:
    cipher = Fernet(TOTP_ENCRYPTION_KEY)
    return cipher.encrypt(plaintext_secret.encode()).decode()

# During login:
def decrypt_totp_secret(encrypted_secret: str) -> str:
    cipher = Fernet(TOTP_ENCRYPTION_KEY)
    return cipher.decrypt(encrypted_secret.encode()).decode()

# Validation:
import pyotp

def validate_totp(encrypted_secret: str, code: str) -> bool:
    secret = decrypt_totp_secret(encrypted_secret)
    totp = pyotp.TOTP(secret)
    
    # Allow ±1 time window (current ± 1 x 30-second period)
    return totp.verify(code, valid_window=1)
```

**Advantages:**
- ✅ Full control over TOTP validation
- ✅ Can customize validation rules (time windows, etc.)
- ✅ Simpler login flow (only 1 Supabase API call)
- ✅ Backup codes fully customizable
- ✅ Audit logs in app database

**Disadvantages:**
- ❌ Must manage encryption key securely (rotation, storage)
- ❌ Secrets stored in app database (additional attack surface)
- ❌ Backup codes stored in app database
- ❌ No automatic recovery flows
- ❌ Must implement MFA reset logic

**Implementation:**
```python
# App-level TOTP approach
async def student_login_app_totp(student_id: str, code: str):
    # 1. Look up student → profile
    student = db.query(Student).filter(...).first()
    profile = db.query(Profile).filter(...).first()
    
    # 2. Get encrypted TOTP secret
    mfa_secret = db.query(StudentMfaSecret).filter(...).first()
    
    # 3. Validate TOTP
    if not validate_totp(mfa_secret.secret_encrypted, code):
        # Handle rate limiting
        return 401
    
    # 4. Create Supabase session
    session = await create_supabase_session(profile.auth_user_id)
    
    return session["access_token"]

def create_supabase_session(auth_user_id: str) -> dict:
    """
    Create a Supabase session for given user.
    Uses service_role_key to create session on behalf of user.
    """
    response = supabase_admin.post(
        f"/auth/v1/users/{auth_user_id}/session",
        headers={"Authorization": f"Bearer {service_role_key}"}
    )
    return response
```

---

### 2.3 RECOMMENDATION

**Use Option B: App-Level TOTP Storage**

**Rationale:**
1. **Simpler integration** with student-id-based login
   - Supabase MFA is built around email/password login
   - Student ID is not native to Supabase Auth
   - Using app-level TOTP avoids impedance mismatch

2. **Full control** over student activation flow
   - Can show QR codes during enrollment
   - Can generate & show backup codes (one-time)
   - Can implement MFA reset securely

3. **Existing Supabase patterns** still in use
   - Supabase Auth still manages user accounts
   - Supabase JWT tokens still used
   - Backend still validates tokens via Supabase

4. **Encryption is manageable**
   - AES-256 is industry standard
   - Key stored in `.env` (same as database credentials)
   - Key rotation can be implemented later

5. **Lower complexity** than Supabase MFA API
   - One less external API call per login
   - Fewer failure modes
   - Easier to test & debug

---

## 3. IMPLEMENTATION SUMMARY

### 3.1 Student Activation

```
1. Identity Verification
   POST /auth/v1/auth/student-activate/verify
   Request: { student_id, last_name }
   Response: { activation_token }
   Status: 200 | 404 | 409

2. Generate TOTP Secret
   POST /api/v1/auth/student-activate/generate-mfa
   Request: { activation_token }
   Response: { qr_code_data, manual_entry_key, setup_token }
   
   Backend:
   - Generate 32-byte secret using secrets.token_bytes()
   - Create TOTP URL for QR code
   - Encrypt secret (don't save yet)
   - Return setup_token (for next step verification)

3. Verify TOTP Code
   POST /api/v1/auth/student-activate/verify-mfa
   Request: { setup_token, totp_code }
   Response: { backup_codes }  # SHOWN ONLY ONCE
   
   Backend:
   - Decrypt secret from session
   - Validate 6-digit code via pyotp
   - Generate 10 backup codes
   - Encrypt & save both secret + backup codes
   - Create Supabase Auth user (or use existing)
   - Create profile linked to student
   - Set account status to ACTIVE

4. First Login
   POST /api/v1/auth/student-login
   Request: { student_id, authenticator_code }
   Response: { access_token, user }
   
   Backend:
   - Look up student → profile → MFA secret
   - Decrypt secret & validate TOTP code
   - Create Supabase session (admin API)
   - Return access_token
```

### 3.2 Login Endpoint

**POST /api/v1/auth/student-login**

```python
@router.post("/student-login", response_model=LoginResponse)
async def student_login(
    request: StudentLoginRequest,  # { student_id, authenticator_code }
    db: Session = Depends(get_db),
):
    """
    Passwordless student login using Student ID + authenticator code.
    """
    # 1. Validate input
    if not request.student_id or len(request.authenticator_code) != 6:
        raise UnauthorizedException("Invalid credentials")
    
    # 2. Look up student
    student = db.query(Student).filter(
        Student.student_id == request.student_id
    ).first()
    if not student:
        raise UnauthorizedException("Student not found")
    
    # 3. Get profile
    profile = db.query(Profile).filter(
        Profile.student_id_fk == student.id
    ).first()
    if not profile or profile.status != AccountStatus.ACTIVE:
        raise UnauthorizedException("Account not active")
    
    # 4. Check rate limiting
    if is_account_locked(profile.id):
        raise TooManyAttemptsException("Account locked for 15 minutes")
    
    # 5. Get & decrypt TOTP secret
    mfa_secret = db.query(StudentMfaSecret).filter(
        StudentMfaSecret.profile_id == profile.id
    ).first()
    if not mfa_secret or not mfa_secret.is_active:
        raise UnauthorizedException("MFA not enrolled")
    
    try:
        decrypted = decrypt_totp_secret(mfa_secret.secret_encrypted)
    except Exception:
        raise UnauthorizedException("Cannot decrypt secret")
    
    # 6. Validate TOTP code
    import pyotp
    totp = pyotp.TOTP(decrypted)
    
    if not totp.verify(request.authenticator_code, valid_window=1):
        record_failed_attempt(profile.id)
        raise UnauthorizedException("Invalid code")
    
    # 7. Create Supabase session
    try:
        access_token = create_supabase_session(
            profile.auth_user_id,
            settings.supabase_service_role_key
        )
    except Exception as e:
        logger.error(f"Failed to create Supabase session: {e}")
        raise InternalServerException("Cannot create session")
    
    # 8. Update last login
    profile.last_login_at = func.now()
    db.commit()
    
    # 9. Log audit (no PII)
    log_audit(
        action="student_login_success",
        user_id=profile.id,
        entity_type="profile",
        entity_id=profile.id
    )
    
    # 10. Return token
    return LoginResponse(
        access_token=access_token,
        expires_in=3600,  # 1 hour
        user={
            "id": profile.id,
            "student_id": student.student_id,
            "display_name": profile.display_name,
            "email": profile.email
        }
    )
```

### 3.3 MFA Reset (Admin)

```python
@router.post("/admin/reset-student-mfa")
async def reset_student_mfa(
    student_id: str,
    admin_user = Depends(require_permission("admin.reset_mfa")),
    db: Session = Depends(get_db),
):
    """
    Reset student's MFA enrollment.
    Admin must verify student identity through external process first.
    """
    student = db.query(Student).filter(
        Student.student_id == student_id
    ).first()
    if not student:
        raise NotFound("Student not found")
    
    profile = db.query(Profile).filter(
        Profile.student_id_fk == student.id
    ).first()
    if not profile:
        raise NotFound("No profile linked")
    
    # Delete old MFA secret
    db.query(StudentMfaSecret).filter(
        StudentMfaSecret.profile_id == profile.id
    ).delete()
    
    # Delete pending activation tokens
    db.query(StudentActivationToken).filter(
        StudentActivationToken.student_id == student.id
    ).delete()
    
    # Reset profile status
    profile.activation_status = "PENDING"
    profile.mfa_enrolled_at = None
    
    db.commit()
    
    # Log audit
    log_audit(
        action="mfa_reset",
        user_id=admin_user.id,
        entity_type="student",
        entity_id=student.id,
        details={"reason": "Admin reset", "verified": True}
    )
    
    return {"status": "MFA reset. Student must re-enroll."}
```

---

## 4. SECURITY CONSIDERATIONS

### 4.1 Encryption Key Management

**Current plan:**
```
TOTP_ENCRYPTION_KEY=<base64-encoded-key> → .env (development)
```

**Production best practices:**
- Store key in AWS Secrets Manager (or equivalent)
- Rotate key annually
- Never log key value
- Different keys for different environments

**Key rotation procedure:**
```python
# Phase 1: Read with old & new key
def get_current_key() -> bytes:
    return settings.TOTP_ENCRYPTION_KEY  # New key

def get_legacy_key() -> bytes:
    return settings.LEGACY_TOTP_ENCRYPTION_KEY  # Old key (if exists)

def decrypt_totp_secret(encrypted: str) -> str:
    try:
        return decrypt_with_key(encrypted, get_current_key())
    except:
        return decrypt_with_key(encrypted, get_legacy_key())

# Phase 2: Re-encrypt old secrets with new key
# Batch job that reads old→decrypts→encrypts with new key→saves

# Phase 3: Remove legacy key from code
```

### 4.2 Rate Limiting & Account Lockout

```python
# Failed login attempts
FAILED_ATTEMPT_THRESHOLD = 5
LOCKOUT_DURATION = 15 * 60  # 15 minutes

def record_failed_attempt(profile_id: str):
    cache.increment(f"failed_login_{profile_id}", 1)
    cache.expire(f"failed_login_{profile_id}", LOCKOUT_DURATION)

def is_account_locked(profile_id: str) -> bool:
    attempts = cache.get(f"failed_login_{profile_id}") or 0
    return attempts >= FAILED_ATTEMPT_THRESHOLD

def clear_failed_attempts(profile_id: str):
    cache.delete(f"failed_login_{profile_id}")
```

### 4.3 Audit Logging (No PII)

```python
def log_audit(action: str, user_id: str, details: dict = None):
    """
    Log security event without PII.
    """
    import hashlib
    
    audit_record = {
        "action": action,
        "user_id_hash": hashlib.sha256(user_id.encode()).hexdigest(),
        "timestamp": datetime.utcnow().isoformat(),
        "ip_address": request.client.host,
        "user_agent": request.headers.get("User-Agent"),
    }
    
    if details:
        audit_record["details"] = {
            k: v for k, v in details.items()
            if k not in ["password", "code", "secret", "backup_codes"]
        }
    
    # Log to database audit_logs table
    # Log to external audit trail (CloudTrail, etc.)
```

---

## 5. TESTING STRATEGY

### 5.1 Unit Tests

```python
def test_validate_totp_with_valid_code():
    secret = "JBSWY3DPEBLW64TMMQ======"  # Known test secret
    totp = TOTP(secret)
    code = totp.now()
    assert validate_totp(secret, code) == True

def test_validate_totp_with_invalid_code():
    secret = "JBSWY3DPEBLW64TMMQ======"
    assert validate_totp(secret, "000000") == False

def test_totp_secret_encryption():
    plaintext = "JBSWY3DPEBLW64TMMQ======"
    encrypted = encrypt_totp_secret(plaintext)
    decrypted = decrypt_totp_secret(encrypted)
    assert decrypted == plaintext
    assert encrypted != plaintext  # Should be different

def test_backup_code_generation():
    codes = generate_backup_codes(count=10)
    assert len(codes) == 10
    assert all(len(code) == 8 for code in codes)
    assert len(set(codes)) == 10  # All unique
```

### 5.2 Integration Tests

```python
async def test_student_activation_flow(client):
    # 1. Verify identity
    resp = client.post("/auth/student-activate/verify", json={
        "student_id": "20-12345",
        "last_name": "Santos"
    })
    assert resp.status_code == 200
    activation_token = resp.json()["activation_token"]
    
    # 2. Generate MFA
    resp = client.post(
        "/auth/student-activate/generate-mfa",
        headers={"Authorization": f"Bearer {activation_token}"},
        json={}
    )
    assert resp.status_code == 200
    setup_token = resp.json()["setup_token"]
    qr_code = resp.json()["qr_code_data"]
    assert qr_code.startswith("otpauth://")
    
    # 3. Extract secret from QR for testing
    # (In real app, user scans; in test, we parse QR)
    secret = extract_secret_from_qr(qr_code)
    
    # 4. Generate valid code
    totp = TOTP(secret)
    code = totp.now()
    
    # 5. Verify MFA
    resp = client.post(
        "/auth/student-activate/verify-mfa",
        headers={"Authorization": f"Bearer {activation_token}"},
        json={"setup_token": setup_token, "totp_code": code}
    )
    assert resp.status_code == 201
    backup_codes = resp.json()["backup_codes"]
    assert len(backup_codes) == 10

async def test_student_login(client):
    # Setup: Student already activated
    student = create_test_student("20-12345", "Santos", "Juan")
    profile = create_test_profile(student)
    mfa = enroll_test_mfa(profile, "JBSWY3DPEBLW64TMMQ======")
    
    # Login
    totp = TOTP("JBSWY3DPEBLW64TMMQ======")
    code = totp.now()
    
    resp = client.post("/auth/student-login", json={
        "student_id": "20-12345",
        "authenticator_code": code
    })
    
    assert resp.status_code == 200
    assert "access_token" in resp.json()
    
    # Verify token works
    token = resp.json()["access_token"]
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["student_id"] == "20-12345"
```

---

## 6. DEPLOYMENT CHECKLIST

Before deploying to production:

- [ ] TOTP encryption key generated & stored securely
- [ ] Rate limiting configured (Redis or similar)
- [ ] Supabase service_role_key stored in backend .env
- [ ] MFA reset procedure documented & trained for admins
- [ ] Backup codes storage tested
- [ ] TOTP validation tested with multiple authenticator apps
- [ ] Audit logs verified (no PII leakage)
- [ ] Account lockout tested
- [ ] MFA re-enrollment tested
- [ ] Timezone handling checked (TOTP is time-sensitive)
- [ ] Load test: 100 concurrent logins
- [ ] Security review passed
- [ ] Disaster recovery plan (key compromise, DB corruption)

---

## 7. FUTURE ENHANCEMENTS

1. **Hardware security keys** (FIDO2/WebAuthn)
   - Alternative to authenticator apps
   - More secure but more complex

2. **SMS/Email backup codes**
   - If authenticator device is lost
   - Requires additional infrastructure

3. **Passwordless for officers too**
   - Eliminate password entirely
   - Use email magic links instead

4. **Single Sign-On (SSO)**
   - Integration with university/school system
   - SAML or OAuth2

5. **Anomaly detection**
   - Unusual login locations/times
   - Require additional verification

---

## SIGN-OFF

**This design is ready for:**

- [ ] Architecture review
- [ ] Security review
- [ ] Implementation planning

**Once approved, proceed with:**

1. Create database schema (Alembic migrations)
2. Implement authentication endpoints
3. Test with sample data (NO real students yet)
4. Perform penetration testing
5. Train operations team
6. Import real student roster

