"""Test if app loads correctly."""

import sys
sys.path.insert(0, '/PSITS/psits-portal-v2/backend')

try:
    from app.main import app
    print("✓ App loaded successfully!")
    print("✓ FastAPI application ready")
    print("\nTo start the server, run:")
    print("  uvicorn app.main:app --port 8000")
    print("\nAPI Docs: http://localhost:8000/api/docs")
except Exception as e:
    print(f"✗ Failed to load app: {e}")
    import traceback
    traceback.print_exc()
