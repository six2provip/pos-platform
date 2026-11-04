"""Domain and API exception hierarchy with stable machine-readable error codes.

Reference:
- docs/03-api-specification.md (Section 5.4, 5.5)
"""

from __future__ import annotations

from typing import List, Optional, Dict


class AppError(Exception):
    """Base application exception mapped to the standard ErrorResponse envelope."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[List[Dict[str, Optional[str]]]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or []


class UnauthorizedError(AppError):
    def __init__(self, code: str = "UNAUTHORIZED", message: str = "Authentication required.") -> None:
        super().__init__(code=code, message=message, status_code=401)


class ForbiddenError(AppError):
    def __init__(self, code: str = "FORBIDDEN", message: str = "You do not have permission to perform this action.") -> None:
        super().__init__(code=code, message=message, status_code=403)


class NotFoundError(AppError):
    def __init__(self, code: str = "RESOURCE_NOT_FOUND", message: str = "The requested resource was not found.") -> None:
        super().__init__(code=code, message=message, status_code=404)


class ConflictError(AppError):
    def __init__(
        self,
        code: str = "RESOURCE_CONFLICT",
        message: str = "The request conflicts with the current state of the resource.",
        details: Optional[List[Dict[str, Optional[str]]]] = None,
    ) -> None:
        super().__init__(code=code, message=message, status_code=409, details=details)


class ValidationAppError(AppError):
    def __init__(
        self,
        code: str = "VALIDATION_ERROR",
        message: str = "The request failed business validation.",
        details: Optional[List[Dict[str, Optional[str]]]] = None,
    ) -> None:
        super().__init__(code=code, message=message, status_code=422, details=details)

