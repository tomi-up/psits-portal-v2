# Database Initialization Script for PSITS Portal V2

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "PSITS Portal V2 - Database Initialization" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Navigate to backend directory
Set-Location c:\PSITS\psits-portal-v2\backend

# Activate virtual environment
Write-Host "`n[1/4] Activating virtual environment..." -ForegroundColor Yellow
.\venv\Scripts\Activate.ps1

# Test connection
Write-Host "`n[2/4] Testing database connection..." -ForegroundColor Yellow
.\venv\Scripts\python.exe test_connection.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✗ Connection failed. Check your DATABASE_URL in .env" -ForegroundColor Red
    exit 1
}

# Initialize database
Write-Host "`n[3/4] Creating database tables and initializing roles/permissions..." -ForegroundColor Yellow
.\venv\Scripts\python.exe -m app.scripts.init_roles_permissions

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✗ Initialization failed" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "`n[4/4] Setup complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✓ Database initialized successfully" -ForegroundColor Green
Write-Host "✓ 11 tables created" -ForegroundColor Green
Write-Host "✓ 13 roles configured" -ForegroundColor Green
Write-Host "✓ 40+ permissions assigned" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan

Write-Host "`nNext step: Start the backend server" -ForegroundColor Yellow
Write-Host "  .\venv\Scripts\python.exe -m uvicorn app.main:app --reload" -ForegroundColor Cyan
Write-Host "`nThen visit: http://localhost:8000/api/docs" -ForegroundColor Cyan
