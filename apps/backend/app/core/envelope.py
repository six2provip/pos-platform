"""Standard API response and error envelopes.

Reference:
- docs/03-api-specification.md (Section 5.3, 5.4)
"""

from __future__ import annotations

from typing import Any, Dict, Generic, List, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class ErrorDetail(BaseModel):
    field: Optional[str] = None
    reason: str


class ErrorBody(BaseModel):
    code: str
    details: List[ErrorDetail] = []


class PaginationMeta(BaseModel):
    page_size: int
    next_cursor: Optional[str] = None
    has_more: bool = False


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    data: Optional[T] = None
    message: Optional[str] = None
    error: Optional[ErrorBody] = None
    request_id: str
    meta: Optional[PaginationMeta] = None


def ok_response(
    data: Any,
    request_id: str,
    message: Optional[str] = None,
    meta: Optional[PaginationMeta] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "success": True,
        "data": data,
        "message": message,
        "error": None,
        "request_id": request_id,
    }
    if meta is not None:
        payload["meta"] = meta.model_dump(mode="json")
    return payload


def error_response(
    code: str,
    message: str,
    request_id: str,
    details: Optional[List[Dict[str, Optional[str]]]] = None,
) -> Dict[str, Any]:
    return {
        "success": False,
        "data": None,
        "message": message,
        "error": {
            "code": code,
            "details": details or [],
        },
        "request_id": request_id,
    }

