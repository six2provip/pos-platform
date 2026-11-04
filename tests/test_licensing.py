"""Unit & security tests for Ed25519 License Signing and Local Offline Verification.

Reference:
- ADR-004: Mandatory Cloud Control Plane Connection
- ADR-009: License Digital Signature
- docs/04-cloud-control-plane.md (Section 13)
- docs/07-security-and-licensing.md (Sections 10, 11, 12)
"""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone

import pytest

from licensing.issuer.signer import LicenseIssuer, generate_ed25519_keypair
from licensing.schemas.envelope import (
    LicenseLimits,
    LicensePayload,
    LicenseValidationError,
    SignedLicenseEnvelope,
    format_rfc3339_utc,
)
from licensing.validator.verifier import LicenseValidator


def _make_sample_payload(
    key_id: str = "cp-ed25519-2026-01",
    sequence: int = 3,
    now: datetime | None = None,
    expires_in_days: int = 30,
) -> LicensePayload:
    ref = now or datetime.now(timezone.utc)
    return LicensePayload(
        schema_version=1,
        license_id="lic_001",
        customer_id="cust_001",
        deployment_id="dep_priv_001",
        organization_id="org_priv_001",
        edition="enterprise",
        features=["pos", "inventory", "reports"],
        limits=LicenseLimits(max_stores=3, max_devices=15),
        sequence=sequence,
        issued_at=format_rfc3339_utc(ref),
        not_before=format_rfc3339_utc(ref - timedelta(minutes=1)),
        expires_at=format_rfc3339_utc(ref + timedelta(days=expires_in_days)),
        grace_policy_id="grace-standard-01",
        key_id=key_id,
    )


def test_ed25519_sign_and_verify_active_license():
    priv_b64, pub_b64 = generate_ed25519_keypair()
    issuer = LicenseIssuer(key_id="cp-ed25519-2026-01", private_key_b64=priv_b64)
    validator = LicenseValidator(trusted_public_keys={"cp-ed25519-2026-01": pub_b64})

    now = datetime.now(timezone.utc)
    payload = _make_sample_payload(now=now)
    envelope = issuer.sign(payload)

    res = validator.verify_and_evaluate(
        envelope=envelope,
        expected_deployment_id="dep_priv_001",
        expected_organization_id="org_priv_001",
        highest_accepted_sequence=2,
        last_validated_at=now,
        now=now,
    )
    assert res.valid is True
    assert res.state == "active"
    assert res.allow_pos_sales is True
    assert res.allow_new_device_activation is True
    assert res.allow_new_store_provisioning is True
    assert res.payload.limits.max_stores == 3
    assert res.payload.limits.max_devices == 15


def test_tampered_payload_or_signature_is_rejected():
    priv_b64, pub_b64 = generate_ed25519_keypair()
    issuer = LicenseIssuer(key_id="cp-ed25519-2026-01", private_key_b64=priv_b64)
    validator = LicenseValidator(trusted_public_keys={"cp-ed25519-2026-01": pub_b64})

    now = datetime.now(timezone.utc)
    envelope = issuer.sign(_make_sample_payload(now=now))

    # Tamper with max_stores in payload while keeping original signature
    tampered_payload = envelope.payload.model_copy(
        update={"limits": LicenseLimits(max_stores=999, max_devices=999)}
    )
    tampered_env = SignedLicenseEnvelope(
        algorithm="Ed25519",
        key_id=envelope.key_id,
        payload=tampered_payload,
        canonical_payload_b64=base64.b64encode(
            tampered_payload.canonical_bytes()
        ).decode("ascii"),
        signature_b64=envelope.signature_b64,
    )

    with pytest.raises(LicenseValidationError) as exc_info:
        validator.verify_and_evaluate(
            envelope=tampered_env,
            expected_deployment_id="dep_priv_001",
            expected_organization_id="org_priv_001",
            highest_accepted_sequence=1,
            now=now,
        )
    assert exc_info.value.code == "INVALID_SIGNATURE"


def test_deployment_and_organization_binding_and_anti_rollback():
    priv_b64, pub_b64 = generate_ed25519_keypair()
    issuer = LicenseIssuer(key_id="cp-ed25519-2026-01", private_key_b64=priv_b64)
    validator = LicenseValidator(trusted_public_keys={"cp-ed25519-2026-01": pub_b64})

    now = datetime.now(timezone.utc)
    envelope = issuer.sign(_make_sample_payload(sequence=3, now=now))

    # Wrong deployment_id
    with pytest.raises(LicenseValidationError) as exc_dep:
        validator.verify_and_evaluate(
            envelope=envelope,
            expected_deployment_id="dep_other_999",
            expected_organization_id="org_priv_001",
            highest_accepted_sequence=3,
            now=now,
        )
    assert exc_dep.value.code == "DEPLOYMENT_MISMATCH"

    # Wrong organization_id
    with pytest.raises(LicenseValidationError) as exc_org:
        validator.verify_and_evaluate(
            envelope=envelope,
            expected_deployment_id="dep_priv_001",
            expected_organization_id="org_other_999",
            highest_accepted_sequence=3,
            now=now,
        )
    assert exc_org.value.code == "ORGANIZATION_MISMATCH"

    # Anti-rollback: sequence=3 < highest_accepted_sequence=5
    with pytest.raises(LicenseValidationError) as exc_seq:
        validator.verify_and_evaluate(
            envelope=envelope,
            expected_deployment_id="dep_priv_001",
            expected_organization_id="org_priv_001",
            highest_accepted_sequence=5,
            now=now,
        )
    assert exc_seq.value.code == "LICENSE_SEQUENCE_ROLLBACK"


def test_offline_grace_and_post_expiry_behavior():
    priv_b64, pub_b64 = generate_ed25519_keypair()
    issuer = LicenseIssuer(key_id="cp-ed25519-2026-01", private_key_b64=priv_b64)
    validator = LicenseValidator(trusted_public_keys={"cp-ed25519-2026-01": pub_b64})

    issued_time = datetime.now(timezone.utc)
    envelope = issuer.sign(
        _make_sample_payload(sequence=4, now=issued_time, expires_in_days=30)
    )

    # 1. Offline for 30 hours (>24h warning_offline), still before expires_at -> POS sales allowed
    eval_30h = validator.verify_and_evaluate(
        envelope=envelope,
        expected_deployment_id="dep_priv_001",
        expected_organization_id="org_priv_001",
        highest_accepted_sequence=4,
        last_validated_at=issued_time,
        now=issued_time + timedelta(hours=30),
    )
    assert eval_30h.state == "warning_offline"
    assert eval_30h.allow_pos_sales is True

    # 2. 3 days after expires_at (within 7-day cached_entitlement_grace_days) -> grace_period, POS sales still allowed!
    eval_grace = validator.verify_and_evaluate(
        envelope=envelope,
        expected_deployment_id="dep_priv_001",
        expected_organization_id="org_priv_001",
        highest_accepted_sequence=4,
        last_validated_at=issued_time + timedelta(days=29),
        now=issued_time + timedelta(days=33),
    )
    assert eval_grace.state == "grace_period"
    assert eval_grace.allow_pos_sales is True
    assert eval_grace.allow_new_store_provisioning is False

    # 3. 20 days after expires_at (beyond 7-day grace) -> expired_restricted
    eval_expired = validator.verify_and_evaluate(
        envelope=envelope,
        expected_deployment_id="dep_priv_001",
        expected_organization_id="org_priv_001",
        highest_accepted_sequence=4,
        last_validated_at=issued_time + timedelta(days=29),
        now=issued_time + timedelta(days=50),
    )
    assert eval_expired.state == "expired_restricted"
    assert eval_expired.allow_new_device_activation is False
    assert eval_expired.allow_new_store_provisioning is False
