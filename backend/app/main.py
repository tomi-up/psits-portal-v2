"""PSITS Portal V2 - FastAPI Application Entry Point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from urllib.parse import urlparse
import os
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.rate_limit import limiter
import logging

# Configure logging
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""

    # Startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Database: {settings.database_url.split('@')[1] if '@' in settings.database_url else 'local'}")

    yield

    # Shutdown
    logger.info(f"Shutting down {settings.app_name}")


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="PSITS Organization Portal Backend API",
        docs_url="/api/docs" if settings.debug else None,
        redoc_url="/api/redoc" if settings.debug else None,
        openapi_url="/api/openapi.json" if settings.debug else None,
        lifespan=lifespan
    )

    # Rate limiting (per-IP, see app/core/rate_limit.py for the default window;
    # individual routes like admin login layer on tighter limits)
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

    # Security Middleware. TrustedHostMiddleware checks the bare hostname the
    # REQUEST CLAIMS TO BE SERVED FROM (the Host header) - that's a different
    # thing from CORS_ORIGINS, which is who's allowed to CALL this API (the
    # frontend's domain). Deriving allowed_hosts from CORS_ORIGINS alone left
    # the backend's own domain out entirely, so Render's health checks and
    # every real request 400'd with "Invalid host header" the moment this
    # deployed - add the platform-provided hostname (Render sets
    # RENDER_EXTERNAL_HOSTNAME automatically; harmless no-op anywhere else).
    #
    # TrustedHostMiddleware matches the bare hostname (e.g. "psits.local"),
    # never a full URL - feeding it scheme-prefixed origins (e.g.
    # "https://psits.local") means they can never match, so also strip each
    # CORS origin down to its hostname before using it here.
    cors_hostnames = [urlparse(origin).hostname for origin in settings.cors_origins_list]
    render_hostname = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=(
            ["localhost", "127.0.0.1", "0.0.0.0"]
            + [h for h in cors_hostnames if h]
            + ([render_hostname] if render_hostname else [])
        )
    )

    # CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health check endpoint
    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {
            "status": "healthy",
            "version": settings.app_version,
            "environment": settings.environment
        }

    # Keep-alive target for an external cron/uptime pinger, so a free-tier
    # host (e.g. Render) doesn't spin the instance down from inactivity.
    # Deliberately outside /api/v1 and unauthenticated - it does nothing but
    # respond, so there's nothing here for a public hit to expose.
    @app.get("/ping")
    async def ping():
        return {"pong": True}

    # Root endpoint
    @app.get("/")
    async def root():
        """API root endpoint."""
        return {
            "message": f"Welcome to {settings.app_name}",
            "version": settings.app_version,
            "docs": "/api/docs" if settings.debug else "N/A"
        }

    # Register API routes
    from app.api.v1 import api_router
    app.include_router(api_router)

    # Application exception handler (UnauthorizedException, ForbiddenException, etc.)
    from app.core.exceptions import AppException

    @app.exception_handler(AppException)
    async def app_exception_handler(request, exc: AppException):
        """Convert domain exceptions to their intended HTTP response."""
        content = exc.to_dict()
        content["timestamp"] = __import__("datetime").datetime.utcnow().isoformat()
        return JSONResponse(status_code=exc.status_code, content=content)

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request, exc: RateLimitExceeded):
        """Too many requests from this IP within the current window. This one
        handler serves every rate-limited route, but the frontend pages read
        the error text under two different keys depending on which style of
        backend exception they normally expect: `detail` (FastAPI's default
        HTTPException shape, e.g. student login) or `message` (this app's
        custom AppException shape, e.g. admin login) - send both so a 429
        doesn't silently fall back to a generic "check your credentials"
        toast on either page."""
        text = "Too many requests. Please slow down and try again shortly."
        return JSONResponse(
            status_code=429,
            content={
                "success": False,
                "error": "RATE_LIMITED",
                "detail": text,
                "message": text,
            },
        )

    # Global exception handler (anything unhandled)
    @app.exception_handler(Exception)
    async def global_exception_handler(request, exc):
        """Global exception handler."""
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "timestamp": __import__("datetime").datetime.utcnow().isoformat()
            }
        )

    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )
