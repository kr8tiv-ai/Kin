"""S08 integrated harness truth derivation helper.

Composes all upstream canonical records (S01-S07) into one integrated truth surface
that proves onboarding, voice, specialist routing, teaching, adaptation, and
managed-service honesty work together without overclaiming capability.
"""

from __future__ import annotations

from typing import Any

from .contracts import (
    CipherContinuityRecord,
    ConciergeClaimLifecycleRecord,
    DesignTeachingResearchRecord,
    IntegratedHarnessTruthRecord,
    LocalFirstHonesty,
    ManagedServicePostureRecord,
    TasteAdaptationRecord,
    TelegramVoiceTurnRecord,
    WebsiteSpecialistHarnessRecord,
)
from .parsers import load_integrated_harness_truth_record


def derive_integrated_harness_truth(
    record_id: str,
    concierge_lifecycle: ConciergeClaimLifecycleRecord,
    telegram_voice_turn: TelegramVoiceTurnRecord,
    cipher_continuity: CipherContinuityRecord,
    website_specialist_harness: WebsiteSpecialistHarnessRecord,
    design_teaching_research: DesignTeachingResearchRecord,
    taste_adaptation: TasteAdaptationRecord,
    managed_service_posture: ManagedServicePostureRecord,
) -> IntegratedHarnessTruthRecord:
    """Derive the canonical S08 integrated harness truth record.

    Composes all upstream canonical records into one integrated truth surface
    that proves onboarding, voice, specialist routing, teaching, adaptation,
    and managed-service honesty work together without overclaiming capability.

    Args:
        record_id: Unique identifier for this record.
        concierge_lifecycle: Canonical S01 record.
        telegram_voice_turn: Canonical S02 record.
        cipher_continuity: Canonical S03 record.
        website_specialist_harness: Canonical S04 record.
        design_teaching_research: Canonical S05 record.
        taste_adaptation: Canonical S06 record.
        managed_service_posture: Canonical S07 record.

    Returns:
        IntegratedHarnessTruthRecord validated through the parser seam.
    """
    local_first_honesty = _compute_local_first_honesty(
        concierge_lifecycle,
        telegram_voice_turn,
        website_specialist_harness,
        design_teaching_research,
        taste_adaptation,
        managed_service_posture,
    )

    support_safe_summary = _build_support_safe_summary(
        concierge_lifecycle,
        telegram_voice_turn,
        cipher_continuity,
        website_specialist_harness,
        design_teaching_research,
        taste_adaptation,
        managed_service_posture,
        local_first_honesty,
    )

    record: dict[str, Any] = {
        "record_id": record_id,
        "schema_family": "s08_integrated_harness_truth",
        "concierge_lifecycle": concierge_lifecycle,
        "telegram_voice_turn": telegram_voice_turn,
        "cipher_continuity": cipher_continuity,
        "website_specialist_harness": website_specialist_harness,
        "design_teaching_research": design_teaching_research,
        "taste_adaptation": taste_adaptation,
        "managed_service_posture": managed_service_posture,
        "local_first_honesty": local_first_honesty,
        "support_safe_summary": support_safe_summary,
    }

    return load_integrated_harness_truth_record(record)


def _compute_local_first_honesty(
    concierge_lifecycle: ConciergeClaimLifecycleRecord,
    telegram_voice_turn: TelegramVoiceTurnRecord,
    website_specialist_harness: WebsiteSpecialistHarnessRecord,
    design_teaching_research: DesignTeachingResearchRecord,
    taste_adaptation: TasteAdaptationRecord,
    managed_service_posture: ManagedServicePostureRecord,
) -> LocalFirstHonesty:
    """Compute local-first honesty flags from upstream records."""
    # Onboarding honesty: claim is activation_ready
    onboarding_honest = concierge_lifecycle.get("claim_status") == "activation_ready"

    # Voice loop honesty: voice turn is activation_ready
    voice_loop_honest = telegram_voice_turn.get("voice_turn_status") == "activation_ready"

    # Specialist local ratio: computed from harness execution provenance
    specialist_local_ratio = _compute_local_ratio(website_specialist_harness)

    # Teaching active: teaching_status is "teaching"
    teaching = design_teaching_research.get("teaching", {})
    teaching_active = teaching.get("teaching_status") == "teaching"

    # Adaptation bounded: has suppressed signals (spec-over-habit enforcement)
    suppressed = taste_adaptation.get("suppressed_taste_signals", [])
    adaptation_bounded = len(suppressed) > 0 if suppressed else False

    # Managed service visible: posture is healthy or recovering
    posture = managed_service_posture.get("overall_posture", "")
    managed_service_visible = posture in ("healthy", "recovering")

    return {
        "onboarding_honest": onboarding_honest,
        "voice_loop_honest": voice_loop_honest,
        "specialist_local_ratio": specialist_local_ratio,
        "teaching_active": teaching_active,
        "adaptation_bounded": adaptation_bounded,
        "managed_service_visible": managed_service_visible,
    }


def _compute_local_ratio(harness: WebsiteSpecialistHarnessRecord) -> float:
    """Compute local-first ratio from harness execution provenance."""
    execution = harness.get("execution", {})
    route = execution.get("route", {}) if execution else {}
    provenance_level = route.get("provenance_level", "not-yet-proven") if route else "not-yet-proven"

    if provenance_level == "local-proven":
        return 1.0
    elif provenance_level == "hybrid-proven":
        return 0.5
    else:
        return 0.0


def _build_support_safe_summary(
    concierge_lifecycle: ConciergeClaimLifecycleRecord,
    telegram_voice_turn: TelegramVoiceTurnRecord,
    cipher_continuity: CipherContinuityRecord,
    website_specialist_harness: WebsiteSpecialistHarnessRecord,
    design_teaching_research: DesignTeachingResearchRecord,
    taste_adaptation: TasteAdaptationRecord,
    managed_service_posture: ManagedServicePostureRecord,
    local_first_honesty: LocalFirstHonesty,
) -> str:
    """Build support-safe summary without exposing secrets."""
    parts = []

    # Onboarding status
    claim_status = concierge_lifecycle.get("claim_status", "unknown")
    if claim_status == "activation_ready":
        parts.append("Onboarding complete")
    elif claim_status == "blocked":
        parts.append("Onboarding blocked")
    else:
        parts.append("Onboarding in progress")

    # Voice loop status
    voice_status = telegram_voice_turn.get("voice_turn_status", "unknown")
    if voice_status == "activation_ready":
        parts.append("voice loop active")
    else:
        parts.append("voice loop pending")

    # Specialist routing
    local_ratio = local_first_honesty["specialist_local_ratio"]
    if local_ratio >= 0.8:
        parts.append("specialist mostly local")
    elif local_ratio >= 0.3:
        parts.append("specialist hybrid")
    else:
        parts.append("specialist external")

    # Teaching status
    teaching_status = design_teaching_research.get("teaching", {}).get("teaching_status", "unknown")
    if teaching_status == "teaching":
        parts.append("teaching active")
    else:
        parts.append("teaching minimal")

    # Adaptation status
    suppressed_count = len(taste_adaptation.get("suppressed_taste_signals", []))
    if suppressed_count > 0:
        parts.append(f"{suppressed_count} adaptation signal{'s' if suppressed_count > 1 else ''} suppressed")
    else:
        parts.append("adaptation unbounded")

    # Managed service status
    posture = managed_service_posture.get("overall_posture", "unknown")
    if posture == "healthy":
        parts.append("managed service healthy")
    elif posture == "recovering":
        parts.append("managed service recovering")
    else:
        parts.append("managed service needs attention")

    return ". ".join(parts) + "."
