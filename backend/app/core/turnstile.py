"""Cloudflare Turnstile verification (bot check in front of student-auth's
own custom endpoints, which - unlike Google's sign-in button - have no
bot protection of their own)."""

import httpx

from app.core.config import settings

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_turnstile(token: str, remote_ip: str | None = None) -> bool:
    """Synchronous by design - called from student_auth.py's sync route
    handlers, which run on FastAPI's worker thread pool rather than the
    event loop, so a blocking HTTP call here is safe."""
    if not settings.turnstile_secret_key:
        # Not configured (e.g. local dev without a Cloudflare site set up) -
        # fail open rather than lock everyone out.
        return True

    payload = {"secret": settings.turnstile_secret_key, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    with httpx.Client(timeout=10.0) as client:
        response = client.post(VERIFY_URL, data=payload)

    if response.status_code != 200:
        return False

    return bool(response.json().get("success"))
