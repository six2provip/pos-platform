"""Exact monetary and quantity decimal utilities.

Reference:
- DB-ADR-007: Monetary precision (numeric(19,4), never floating-point)
- docs/02-database-schema.md (Section 4.3)
- docs/03-api-specification.md (Section 5.2, 14)
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Union

MONEY_SCALE = Decimal("0.0001")
ZERO_MONEY = Decimal("0.0000")


def to_decimal(value: Union[str, int, Decimal], field_name: str = "amount") -> Decimal:
    """Parse an exact string, int, or Decimal into a 4-decimal quantized Decimal.

    Rejects binary float inputs to prevent accidental floating-point rounding bugs.
    """
    if isinstance(value, float):
        raise ValueError(f"{field_name} must not be a binary float; use a decimal string")
    try:
        dec = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"Invalid decimal value for {field_name}: {value}") from exc
    if not dec.is_finite():
        raise ValueError(f"Non-finite decimal value for {field_name}")
    return dec.quantize(MONEY_SCALE, rounding=ROUND_HALF_UP)


def format_decimal(value: Union[Decimal, int, str]) -> str:
    """Format a Decimal as a canonical 4-decimal string (e.g. '35000.0000')."""
    dec = to_decimal(value)
    return f"{dec:.4f}"

