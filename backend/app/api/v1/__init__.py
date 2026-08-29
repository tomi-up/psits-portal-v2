"""API v1 routes."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth, student_auth, events_mvp, admin_events, admin_auth, admin_students, admin_excuse_requests,
    balance, admin_payments, news, sanctions, admin_sanctions,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(student_auth.router)
api_router.include_router(events_mvp.router)
api_router.include_router(admin_auth.router)
api_router.include_router(admin_events.router)
api_router.include_router(admin_students.router)
api_router.include_router(admin_excuse_requests.router)
api_router.include_router(balance.router)
api_router.include_router(admin_payments.router)
api_router.include_router(news.router)
api_router.include_router(news.admin_router)
api_router.include_router(sanctions.router)
api_router.include_router(admin_sanctions.router)

__all__ = ["api_router"]
