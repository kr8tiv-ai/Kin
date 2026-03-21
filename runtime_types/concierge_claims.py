from __future__ import annotations

from .contracts import (
    ConciergeBlockingReason,
    ConciergeClaimLifecycleRecord,
    ConciergeClaimStatus,
    ConciergeManualCheckpoint,
    ConciergeSetupGuidanceRecord,
    ConciergeSetupStage,
)
from .parsers import load_concierge_claim_lifecycle, load_concierge_setup_guidance


def _build_setup_guidance(
    *,
    claim_id: str,
    guidance_status: str,
    plain_language_summary: str,
    next_user_step: str,
    blocking_reason: ConciergeBlockingReason | None,
    manual_checkpoint: ConciergeManualCheckpoint | None,
    support_safe_notes: str,
) -> ConciergeSetupGuidanceRecord:
    return load_concierge_setup_guidance(
        {
            "guidance_id": claim_id.replace("claim-", "guide-", 1),
            "guidance_status": guidance_status,
            "plain_language_summary": plain_language_summary,
            "next_user_step": next_user_step,
            "blocking_reason": blocking_reason,
            "manual_checkpoint": manual_checkpoint,
            "support_safe_notes": support_safe_notes,
        }
    )


def derive_concierge_lifecycle(
    *,
    claim_id: str,
    claimant_label: str,
    claim_submitted: bool,
    identity_verified: bool,
    device_setup_complete: bool,
    owner_confirmation_complete: bool,
    support_intervention_required: bool,
) -> ConciergeClaimLifecycleRecord:
    if not claim_submitted:
        raise ValueError("Cannot derive concierge lifecycle without a submitted claim.")

    claim_status: ConciergeClaimStatus
    setup_stage: ConciergeSetupStage
    blocking_reason: ConciergeBlockingReason | None
    manual_checkpoint: ConciergeManualCheckpoint | None
    activation_ready: bool
    next_user_step: str
    setup_guidance: ConciergeSetupGuidanceRecord

    if support_intervention_required and not identity_verified:
        claim_status = "blocked"
        setup_stage = "support_followup_required"
        blocking_reason = "identity_verification_pending"
        manual_checkpoint = "await_support_followup"
        activation_ready = False
        next_user_step = "Wait for support to confirm your identity and next steps."
        setup_guidance = _build_setup_guidance(
            claim_id=claim_id,
            guidance_status="blocked",
            plain_language_summary="Support still needs to verify your identity before setup can continue.",
            next_user_step=next_user_step,
            blocking_reason=blocking_reason,
            manual_checkpoint=manual_checkpoint,
            support_safe_notes="Do not continue setup until support confirms the checkpoint is cleared.",
        )
    elif not identity_verified:
        claim_status = "blocked"
        setup_stage = "support_followup_required"
        blocking_reason = "identity_verification_pending"
        manual_checkpoint = "await_identity_review"
        activation_ready = False
        next_user_step = "Wait for support to finish identity review before setup continues."
        setup_guidance = _build_setup_guidance(
            claim_id=claim_id,
            guidance_status="blocked",
            plain_language_summary="Support is reviewing your identity before setup can continue.",
            next_user_step=next_user_step,
            blocking_reason=blocking_reason,
            manual_checkpoint=manual_checkpoint,
            support_safe_notes="Support will contact you after the identity review checkpoint is cleared.",
        )
    elif not device_setup_complete:
        claim_status = "claimed"
        setup_stage = "awaiting_device_setup"
        blocking_reason = None
        manual_checkpoint = None
        activation_ready = False
        next_user_step = "Complete the device setup steps sent by support."
        setup_guidance = _build_setup_guidance(
            claim_id=claim_id,
            guidance_status="needs_user_action",
            plain_language_summary="Your claim is approved and the next step is device setup with support.",
            next_user_step=next_user_step,
            blocking_reason=blocking_reason,
            manual_checkpoint=manual_checkpoint,
            support_safe_notes="Support is waiting for device setup confirmation before activation.",
        )
    elif not owner_confirmation_complete:
        claim_status = "claimed"
        setup_stage = "awaiting_owner_confirmation"
        blocking_reason = None
        manual_checkpoint = None
        activation_ready = False
        next_user_step = "Confirm with support that your setup steps are complete."
        setup_guidance = _build_setup_guidance(
            claim_id=claim_id,
            guidance_status="needs_user_action",
            plain_language_summary="Your device setup is complete and support now needs your final confirmation.",
            next_user_step=next_user_step,
            blocking_reason=blocking_reason,
            manual_checkpoint=manual_checkpoint,
            support_safe_notes="Support is waiting for your confirmation before activation scheduling.",
        )
    else:
        claim_status = "activation_ready"
        setup_stage = "setup_complete"
        blocking_reason = None
        manual_checkpoint = None
        activation_ready = True
        next_user_step = "Reply to support to schedule activation."
        setup_guidance = _build_setup_guidance(
            claim_id=claim_id,
            guidance_status="ready",
            plain_language_summary="Everything is complete and you are ready to schedule activation.",
            next_user_step=next_user_step,
            blocking_reason=blocking_reason,
            manual_checkpoint=manual_checkpoint,
            support_safe_notes="Support can now schedule the activation handoff.",
        )

    return load_concierge_claim_lifecycle(
        {
            "claim_id": claim_id,
            "claimant_label": claimant_label,
            "claim_status": claim_status,
            "setup_stage": setup_stage,
            "blocking_reason": blocking_reason,
            "manual_checkpoint": manual_checkpoint,
            "activation_ready": activation_ready,
            "next_user_step": next_user_step,
            "setup_guidance": setup_guidance,
        }
    )
