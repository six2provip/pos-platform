"""Ed25519 License Signing Service (Cloud Control Plane only).

Reference:
- ADR-009: License Digital Signature
- docs/04-cloud-control-plane.md (Section 13.3)
- docs/07-security-and-licensing.md (Section 10.2, 11.3)
"""

from __future__ import annotations

import base64
from typing import Tuple
from nacl.signing import SigningKey

from licensing.schemas.envelope import LicensePayload, SignedLicenseEnvelope


def generate_ed25519_keypair() -> Tuple[str, str]:
    """Generate a new Ed25519 key pair encoded as base64 strings.

    Returns:
        (private_key_b64, public_key_b64)
    """
    signing_key = SigningKey.generate()
    private_b64 = base64.b64encode(bytes(signing_key)).decode("ascii")
    public_b64 = base64.b64encode(bytes(signing_key.verify_key)).decode("ascii")
    return private_b64, public_b64


class LicenseIssuer:
    """Signs canonical LicensePayload snapshots using a protected Ed25519 signing key."""

    def __init__(self, key_id: str, private_key_b64: str) -> None:
        if not key_id or not key_id.strip():
            raise ValueError("key_id is required")
        self._key_id = key_id.strip()
        raw_seed = base64.b64decode(private_key_b64)
        self._signing_key = SigningKey(raw_seed)

    @property
    def key_id(self) -> str:
        return self._key_id

    @property
    def public_key_b64(self) -> str:
        return base64.b64encode(bytes(self._signing_key.verify_key)).decode("ascii")

    def sign(self, payload: LicensePayload) -> SignedLicenseEnvelope:
        """Sign a LicensePayload and return a verifiable SignedLicenseEnvelope."""
        if payload.key_id != self._key_id:
            raise ValueError(
                f"Payload key_id '{payload.key_id}' does not match issuer key_id '{self._key_id}'"
            )
        canonical_bytes = payload.canonical_bytes()
        signed = self._signing_key.sign(canonical_bytes)
        signature_b64 = base64.b64encode(signed.signature).decode("ascii")
        canonical_b64 = base64.b64encode(canonical_bytes).decode("ascii")
        return SignedLicenseEnvelope(
            algorithm="Ed25519",
            key_id=self._key_id,
            payload=payload,
            canonical_payload_b64=canonical_b64,
            signature_b64=signature_b64,
        )

