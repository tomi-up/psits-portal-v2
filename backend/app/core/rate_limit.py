"""Shared slowapi Limiter instance.

Split into its own module so both `main.py` (which wires it into the app)
and individual endpoint modules (which decorate specific routes with
tighter limits) can import it without a circular import.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.rate_limit_requests}/{settings.rate_limit_window}second"],
)
