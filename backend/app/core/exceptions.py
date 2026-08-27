"""Custom exception classes for the application."""

from fastapi import HTTPException, status
from typing import Optional, Any


class AppException(Exception):
    """Base application exception."""

    def __init__(
        self,
        message: str,
        error_code: str = "INTERNAL_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[dict[str, Any]] = None
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> dict[str, Any]:
        """Convert exception to dictionary for API response."""
        return {
            "success": False,
            "error": self.error_code,
            "message": self.message,
            "details": self.details if self.details else None
        }

    def to_http_exception(self) -> HTTPException:
        """Convert to FastAPI HTTPException."""
        return HTTPException(
            status_code=self.status_code,
            detail=self.to_dict()
        )


class UnauthorizedException(AppException):
    """User is not authenticated."""

    def __init__(self, message: str = "Unauthorized"):
        super().__init__(
            message=message,
            error_code="UNAUTHORIZED",
            status_code=status.HTTP_401_UNAUTHORIZED
        )


class ForbiddenException(AppException):
    """User does not have permission."""

    def __init__(self, message: str = "Permission denied"):
        super().__init__(
            message=message,
            error_code="PERMISSION_DENIED",
            status_code=status.HTTP_403_FORBIDDEN
        )


class NotFoundException(AppException):
    """Resource not found."""

    def __init__(self, resource: str = "Resource", resource_id: Optional[str] = None):
        message = f"{resource} not found"
        if resource_id:
            message += f" (ID: {resource_id})"
        super().__init__(
            message=message,
            error_code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND
        )


class ValidationException(AppException):
    """Validation error."""

    def __init__(self, message: str, field_errors: Optional[dict[str, str]] = None):
        super().__init__(
            message=message,
            error_code="INVALID_INPUT",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"field_errors": field_errors or {}}
        )


class ConflictException(AppException):
    """Resource conflict (duplicate, constraint violation)."""

    def __init__(self, message: str, details: Optional[dict] = None):
        super().__init__(
            message=message,
            error_code="CONFLICT",
            status_code=status.HTTP_409_CONFLICT,
            details=details or {}
        )


class DuplicateException(AppException):
    """Resource already exists."""

    def __init__(self, resource: str, field: str = ""):
        message = f"{resource} already exists"
        if field:
            message += f" ({field})"
        super().__init__(
            message=message,
            error_code="DUPLICATE_ENTRY",
            status_code=status.HTTP_409_CONFLICT
        )


class BadRequestException(AppException):
    """Bad request."""

    def __init__(self, message: str):
        super().__init__(
            message=message,
            error_code="BAD_REQUEST",
            status_code=status.HTTP_400_BAD_REQUEST
        )


class RateLimitException(AppException):
    """Rate limit exceeded."""

    def __init__(self, retry_after: int = 60):
        super().__init__(
            message="Rate limit exceeded",
            error_code="RATE_LIMIT_EXCEEDED",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details={"retry_after": retry_after}
        )
