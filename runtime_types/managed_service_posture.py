"""S07 managed-service posture derivation helper.

Consumes canonical S01 ConciergeClaimLifecycleRecord and optional S04 WebsiteSpecialistHarnessRecord
to expose Tailscale access status, computer-setup guidance, backup state, intervention state,
and support readiness markers in a support-safe record without leaking infrastructure credentials.
"""

from __future__ import annotations

from typing import Any

from .contracts import (
    BackupState,
    ComputerSetupGuidance,
    ConciergeClaimLifecycleRecord,
    InterventionState,
    ManagedServicePostureRecord,
    SupportReadiness,
    TailscaleAccessStatus,
    WebsiteSpecialistHarnessRecord,
)
from .parsers import load_managed_service_posture_record


def derive_managed_service_posture_record(
    record_id: str,
    concierge_lifecycle: ConciergeClaimLifecycleRecord,
    *,
    website_specialist_harness: WebsiteSpecialistHarnessRecord | None = None,
    tailscale_access: TailscaleAccessStatus,
    computer_setup_guidance: ComputerSetupGuidance,
    backup_state: BackupState,
    intervention_state: InterventionState,
    support_readiness: SupportReadiness,
    overall_posture: str,
    support_safe_summary: str,
) -> ManagedServicePostureRecord:
    """Derive a canonical S07 managed-service posture record.

    Composes canonical S01 onboarding truth and optional S04 harness inputs
    to expose inspectable managed-service posture without rebuilding onboarding
    or specialist-work facts.

    Args:
        record_id: Unique identifier for this record.
        concierge_lifecycle: Canonical S01 ConciergeClaimLifecycleRecord.
        website_specialist_harness: Optional S04 WebsiteSpecialistHarnessRecord.
        tailscale_access: Tailscale connection status (no auth keys).
        computer_setup_guidance: Non-technical setup steps for owners.
        backup_state: Backup health and recency.
        intervention_state: Whether managed service needs operator attention.
        support_readiness: Support availability and known limitations.
        overall_posture: "healthy", "needs_attention", or "recovering".
        support_safe_summary: Support-safe summary without infrastructure detail.

    Returns:
        ManagedServicePostureRecord validated through the parser seam.

    Raises:
        ValueError: If validation fails or invalid posture value.
    """
    if overall_posture not in ("healthy", "needs_attention", "recovering"):
        raise ValueError(
            f"Invalid overall_posture: {overall_posture!r}. "
            "Must be 'healthy', 'needs_attention', or 'recovering'."
        )

    record: dict[str, Any] = {
        "record_id": record_id,
        "schema_family": "s07_managed_service_posture",
        "concierge_lifecycle": concierge_lifecycle,
        "website_specialist_harness": website_specialist_harness,
        "tailscale_access": tailscale_access,
        "computer_setup_guidance": computer_setup_guidance,
        "backup_state": backup_state,
        "intervention_state": intervention_state,
        "support_readiness": support_readiness,
        "overall_posture": overall_posture,
        "support_safe_summary": support_safe_summary,
    }

    # Revalidate through parser seam
    return load_managed_service_posture_record(record)
