# PSITS Scanner

Android attendance scanner for PSITS-USM. This app uses the same FastAPI
scanner session and attendance endpoints as the existing web/iOS scanner.

## Workflow

1. An officer enters the event code and their assigned PIN.
2. The app receives a short-lived scanner token and stores it in Android secure
   storage. The PIN is not stored.
3. The app polls the server every five seconds for the admin-controlled
   checkpoint (`IN`, `MIDDLE`, or `OUT`).
4. Student QR codes are submitted to the server. The app handles successful,
   duplicate, rejected, and cross-section scans.
5. Signing out revokes the server session and removes the local token.

The app never chooses the attendance checkpoint. The backend remains the source
of truth and rejects a scan if the app's displayed checkpoint has gone stale.

## Run on a Physical Device

Connect the Android phone and development computer to the same Wi-Fi network.
Start FastAPI so it listens on every network interface:

```powershell
cd C:\PSITS\psits-portal-v2\backend
$env:DEBUG = "false"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The app currently defaults to this computer's Wi-Fi address,
`http://192.168.1.10:8000/api/v1`. With USB debugging enabled, run:

```powershell
cd C:\PSITS\psits-portal-v2\mobile_app_scanner
flutter run
```

The LAN address can change. Check it with `ipconfig`; when it changes, override
the app's default without editing code:

```powershell
flutter run --dart-define=API_BASE_URL=http://YOUR-LAN-IP:8000/api/v1
```

The debug Android manifest permits HTTP for local development. Release builds
should use the deployed HTTPS backend:

```powershell
flutter build apk --release --dart-define=API_BASE_URL=https://YOUR-BACKEND/api/v1
```

The APK will be written under `build\app\outputs\flutter-apk`.

## Checks

```powershell
flutter analyze
flutter test
```
