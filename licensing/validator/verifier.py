"""Ed25519 License Validator for Private Server deployments.

Performs the 10-step verification sequence specified in:
- docs/07-security-and-licensing.md (Section 11.4, 11.6)
- docs/04-cloud-control-plane.md (Section 13.5, 13.6)
"""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey

from licensing.schemas.envelope import (
    GracePolicy,
    LicenseEvaluationResult,
    LicensePayload,
    LicenseValidationError,
    SignedLicenseEnvelope,
    parse_rfc3339_utc,
)


class LicenseValidator:
    """Verifies signed license envelopes using trusted public verification keys only."""

    def __init__(
        self,
        trusted_public_keys: Dict[str, str],
        grace_policies: Optional[Dict[str, GracePolicy]] = None,
        clock_skew_tolerance_seconds: int = 300,
    ) -> None:
        if not trusted_public_keys:
            raise ValueError("At least one trusted public key must be configured")
        self._verify_keys: Dict[str, VerifyKey] = {}
        for k_id, pub_b64 in trusted_public_keys.items():
            self._verify_keys[k_id] = VerifyKey(base64.b64decode(pub_b64))
        self._grace_policies: Dict[str, GracePolicy] = grace_policies or {
            "grace-standard-01": GracePolicy(policy_id="grace-standard-01")
        }
        self._clock_skew = timedelta(seconds=clock_skew_tolerance_seconds)

    def verify_and_evaluate(
        self,
        envelope: SignedLicenseEnvelope,
        expected_deployment_id: str,
        expected_organization_id: str,
        highest_accepted_sequence: int = 0,
        last_validated_at: Optional[datetime] = None,
        is_revoked_snapshot: bool = False,
        now: Optional[datetime] = None,
        allow_recovery_rollback: bool = False,
    ) -> LicenseEvaluationResult:
        """Execute cryptographic signature verification, binding checks, and grace evaluation."""
        eval_time = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)

        # 1. Algorithm & schema check
        if envelope.algorithm != "Ed25519":
            raise LicenseValidationError(
                "UNSUPPORTED_ALGORITHM", f"Unsupported algorithm: {envelope.algorithm}"
            )
        if envelope.payload.schema_version != 1:
            raise LicenseValidationError(
                "UNSUPPORTED_SCHEMA",
                f"Unsupported schema_version: {envelope.payload.schema_version}",
            )

        # 2. Resolve trusted key_id
        if envelope.key_id != envelope.payload.key_id:
            raise LicenseValidationError(
                "KEY_ID_MISMATCH", "Envelope key_id does not match payload key_id"
            )
        verify_key = self._verify_keys.get(envelope.key_id)
        if verify_key is None:
            raise LicenseValidationError(
                "UNTRUSTED_KEY_ID", f"Unknown or retired signing key_id: {envelope.key_id}"
            )

        # 3. Verify canonical payload integrity & Ed25519 signature
        try:
            canonical_bytes = base64.b64decode(envelope.canonical_payload_b64)
            signature_bytes = base64.b64decode(envelope.signature_b64)
        except Exception as exc:
            raise LicenseValidationError(
                "MALFORMED_ENVELOPE_ENCODING", "Invalid base64 encoding in license envelope"
            ) from exc

        expected_canonical = envelope.payload.canonical_bytes()
        if canonical_bytes != expected_canonical:
            raise LicenseValidationError(
                "PAYLOAD_TAMPERED",
                "Parsed payload does not match canonical signed bytes",
            )

        try:
            verify_key.verify(canonical_bytes, signature_bytes)
        except BadSignatureError as exc:
            raise LicenseValidationError(
                "INVALID_SIGNATURE", "Ed25519 cryptographic signature verification failed"
            ) from exc

        # Re-parse from verified canonical bytes as defense in depth
        verified_payload = LicensePayload.model_validate_json(
            canonical_bytes.decode("utf-8")
        )

        # 4. Deployment binding check
        if verified_payload.deployment_id != expected_deployment_id:
            raise LicenseValidationError(
                "DEPLOYMENT_MISMATCH",
                f"License deployment_id '{verified_payload.deployment_id}' "
                f"does not match local deployment '{expected_deployment_id}'",
            )

        # 5. Organization binding check
        if verified_payload.organization_id != expected_organization_id:
            raise LicenseValidationError(
                "ORGANIZATION_MISMATCH",
                f"License organization_id '{verified_payload.organization_id}' "
                f"does not match local organization '{expected_organization_id}'",
            )

        # 6. Clock rollback & not_before check
        if last_validated_at is not None:
            last_val_utc = last_validated_at.astimezone(timezone.utc)
            if eval_time + self._clock_skew < last_val_utc:
                raise LicenseValidationError(
                    "CLOCK_ROLLBACK_DETECTED",
                    "Local clock appears to have rolled back prior to last_validated_at",
                )

        not_before_dt = parse_rfc3339_utc(verified_payload.not_before)
        if eval_time + self._clock_skew < not_before_dt:
            raise LicenseValidationError(
                "LICENSE_NOT_YET_VALID",
                f"License is not valid before {verified_payload.not_before}",
            )

        # 7. Anti-rollback sequence check
        if (
            not allow_recovery_rollback
            and verified_payload.sequence < highest_accepted_sequence
        ):
            raise LicenseValidationError(
                "LICENSE_SEQUENCE_ROLLBACK",
                f"License sequence {verified_payload.sequence} is older than "
                f"highest accepted sequence {highest_accepted_sequence}",
            )

        # 8. Revocation check
        if is_revoked_snapshot:
            return LicenseEvaluationResult(
                valid=False,
                state="revoked",
                allow_pos_sales=False,
                allow_new_device_activation=False,
                allow_new_store_provisioning=False,
                warnings=["License has been explicitly revoked by the provider Control Plane."],
                payload=verified_payload,
                evaluated_at=eval_time,
            )

        # 9. Evaluate expiration and offline connectivity grace policy
        policy = self._grace_policies.get(
            verified_payload.grace_policy_id, GracePolicy()
        )
        expires_dt = parse_rfc3339_utc(verified_payload.expires_at)
        warnings: List[str] = []

        # Check offline connectivity duration since last Control Plane validation
        reference_validation_time = (
            last_validated_at.astimezone(timezone.utc)
            if last_validated_at is not None
            else eval_time
        )
        offline_duration = eval_time - reference_validation_time
        max_grace_duration = timedelta(days=policy.cached_entitlement_grace_days)

        # Check if license has passed expires_at
        if eval_time > expires_dt:
            post_expiry = eval_time - expires_dt
            if post_expiry <= max_grace_duration:
                warnings.append(
                    "License has passed expires_at and is operating within the grace period."
                )
                return LicenseEvaluationResult(
                    valid=True,
                    state="grace_period",
                    allow_pos_sales=True,
                    allow_new_device_activation=False,
                    allow_new_store_provisioning=False,
                    warnings=warnings,
                    payload=verified_payload,
                    evaluated_at=eval_time,
                )
            else:
                warnings.append(
                    "License expiration and grace period have elapsed. "
                    "New device activation and store provisioning are blocked; data is preserved."
                )
                return LicenseEvaluationResult(
                    valid=False,
                    state="expired_restricted",
                    allow_pos_sales=False,
                    allow_new_device_activation=False,
                    allow_new_store_provisioning=False,
                    warnings=warnings,
                    payload=verified_payload,
                    evaluated_at=eval_time,
                )

        # License is not expired; check Control Plane offline duration
        if offline_duration > max_grace_duration:
            warnings.append(
                f"Control Plane unreachable beyond {policy.cached_entitlement_grace_days}-day "
                "cached entitlement grace period. New provisioning and device activations are blocked."
            )
            return LicenseEvaluationResult(
                valid=True,
                state="grace_period",
                allow_pos_sales=True,
                allow_new_device_activation=False,
                allow_new_store_provisioning=False,
                warnings=warnings,
                payload=verified_payload,
                evaluated_at=eval_time,
            )

        state = "active"
        if expires_dt - eval_time <= timedelta(days=policy.expiry_warning_days):
            state = "expiring"
            warnings.append(f"License is approaching expiration ({verified_payload.expires_at}).")

        if offline_duration >= timedelta(hours=policy.escalated_warning_after_offline_hours):
            state = "escalated_offline"
            warnings.append(
                f"No successful Control Plane validation for over "
                f"{policy.escalated_warning_after_offline_hours} hours."
            )
        elif offline_duration >= timedelta(hours=policy.warning_after_offline_hours):
            if state == "active":
                state = "warning_offline"
            warnings.append(
                f"No successful Control Plane validation for over "
                f"{policy.warning_after_offline_hours} hours."
            )

        return LicenseEvaluationResult(
            valid=True,
            state=state,  # type: ignore[arg-type]
            allow_pos_sales=True,
            allow_new_device_activation=True,
            allow_new_store_provisioning=True,
            warnings=warnings,
            payload=verified_payload,
            evaluated_at=eval_time,
        )

