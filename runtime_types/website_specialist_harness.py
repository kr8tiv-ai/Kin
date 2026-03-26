from __future__ import annotations

from .contracts import (
    CipherContinuityRecord,
    ConciergeClaimLifecycleRecord,
    RoutingProvenanceEvent,
    TelegramVoiceTurnRecord,
    WebsiteActivationHandoffStatus,
    WebsiteRequestSource,
    WebsiteRequestStatus,
    WebsiteRequestedCapability,
    WebsiteSpecialistExecutionRecord,
    WebsiteSpecialistHarnessRecord,
    WebsiteSpecialistRequestRecord,
    WebsiteSpecialistStatus,
    WebsiteTaskPhase,
)
from .disclosure import format_provenance_disclosure
from .parsers import (
    load_cipher_continuity_record,
    load_concierge_claim_lifecycle,
    load_routing_provenance_event,
    load_telegram_voice_turn,
    load_website_specialist_execution,
    load_website_specialist_harness_record,
    load_website_specialist_request,
)


def _derive_request_status(
    *,
    lifecycle: ConciergeClaimLifecycleRecord,
    route_event: RoutingProvenanceEvent,
) -> WebsiteRequestStatus:
    if lifecycle["claim_status"] != "activation_ready" or not lifecycle["activation_ready"]:
        return "blocked"
    if route_event["mode"] == "hybrid" or route_event["fallback_used"]:
        return "needs_route_decision"
    return "activation_ready"


def _derive_specialist_outcome(
    *,
    activation_ready: bool,
    route_event: RoutingProvenanceEvent,
) -> tuple[WebsiteSpecialistStatus, WebsiteTaskPhase, WebsiteActivationHandoffStatus]:
    if not activation_ready:
        return "pending", "blocked", "blocked"
    if route_event["fallback_refused"]:
        return "refused_fallback", "blocked", "activation_ready"
    if route_event["mode"] == "hybrid" or route_event["fallback_used"]:
        return "escalated", "routing", "activation_ready"
    return "completed", "fulfilled", "handoff_complete"


def _build_continuity_refs(
    *,
    voice_turn: TelegramVoiceTurnRecord,
    continuity: CipherContinuityRecord,
) -> list[str]:
    refs: list[str] = []
    session_reference = voice_turn["continuity"]["session_reference"]
    if session_reference:
        refs.append(session_reference)
    continuity_id = continuity["continuity_id"]
    if continuity_id not in refs:
        refs.append(continuity_id)
    carryover_source_ref = continuity["carryover_source_ref"]
    if carryover_source_ref and carryover_source_ref not in refs:
        refs.append(carryover_source_ref)
    return refs


def _build_execution_summary(
    *,
    specialist_status: WebsiteSpecialistStatus,
    route_event: RoutingProvenanceEvent,
    continuity: CipherContinuityRecord,
) -> str:
    if specialist_status == "pending":
        return (
            "Website-specialist execution remains blocked until activation handoff is ready; "
            "continuity markers are preserved without starting specialist work."
        )
    if specialist_status == "refused_fallback":
        return (
            "Website-specialist work stayed within the allowed local route because external fallback was refused, "
            "and bounded continuity markers were preserved."
        )
    if route_event["mode"] == "hybrid" or route_event["fallback_used"]:
        return (
            "Website-specialist work escalated through a hybrid route and disclosed that choice explicitly while "
            "preserving bounded continuity markers."
        )
    if continuity["continuity_status"] == "carryover":
        return "Website-specialist work completed locally with bounded Cipher continuity markers preserved."
    return "Website-specialist work completed locally with activation-ready Cipher continuity markers preserved."


def _build_outcome_summary(
    *,
    specialist_status: WebsiteSpecialistStatus,
    request_status: WebsiteRequestStatus,
    activation_handoff_status: WebsiteActivationHandoffStatus,
    route_event: RoutingProvenanceEvent,
) -> str:
    if request_status == "blocked":
        return (
            "Website-specialist execution stayed blocked because activation handoff was not ready, "
            "so no fake local-success outcome was produced."
        )
    if specialist_status == "refused_fallback":
        return (
            "Cipher preserved website-specialist continuity truth and clearly reported that external fallback was refused."
        )
    if route_event["mode"] == "hybrid" or route_event["fallback_used"]:
        return (
            "Cipher preserved activation-ready continuity markers while honestly disclosing a hybrid website-specialist escalation."
        )
    if activation_handoff_status == "handoff_complete":
        return "Cipher completed the website-specialist step locally and preserved support-safe continuity truth."
    return "Cipher kept the website-specialist request support-safe and ready for the next routed step."


def derive_website_specialist_harness_record(
    *,
    harness_id: str,
    request_id: str,
    execution_id: str,
    lifecycle: ConciergeClaimLifecycleRecord,
    voice_turn: TelegramVoiceTurnRecord,
    continuity: CipherContinuityRecord,
    route_event: RoutingProvenanceEvent,
    requested_capability: WebsiteRequestedCapability,
    request_source: WebsiteRequestSource,
    support_safe_request_summary: str,
    desired_outcome_summary: str,
) -> WebsiteSpecialistHarnessRecord:
    """Compose a schema-valid S04 website-specialist harness record from canonical upstream seams."""

    validated_lifecycle = load_concierge_claim_lifecycle(lifecycle)
    validated_voice_turn = load_telegram_voice_turn(voice_turn)
    validated_continuity = load_cipher_continuity_record(continuity)
    validated_route_event = load_routing_provenance_event(route_event)

    activation_ready = (
        validated_lifecycle["claim_status"] == "activation_ready"
        and validated_lifecycle["activation_ready"]
        and validated_voice_turn["activation_gate_status"] == "ready"
        and validated_voice_turn["voice_turn_status"] == "activation_ready"
    )

    request_status = _derive_request_status(
        lifecycle=validated_lifecycle,
        route_event=validated_route_event,
    )
    specialist_status, task_phase, activation_handoff_status = _derive_specialist_outcome(
        activation_ready=activation_ready,
        route_event=validated_route_event,
    )
    disclosure = format_provenance_disclosure(validated_route_event)
    continuity_carryover_refs = _build_continuity_refs(
        voice_turn=validated_voice_turn,
        continuity=validated_continuity,
    )

    request: WebsiteSpecialistRequestRecord = load_website_specialist_request(
        {
            "request_id": request_id,
            "request_source": request_source,
            "request_status": request_status,
            "support_safe_request_summary": support_safe_request_summary,
            "desired_outcome_summary": desired_outcome_summary,
            "activation_ready": activation_ready,
            "activation_ref": validated_lifecycle["claim_id"],
            "voice_turn_ref": validated_voice_turn["voice_turn_id"],
            "continuity_ref": validated_continuity["continuity_id"],
            "requested_capability": requested_capability,
        }
    )

    execution: WebsiteSpecialistExecutionRecord = load_website_specialist_execution(
        {
            "execution_id": execution_id,
            "specialist_status": specialist_status,
            "task_phase": task_phase,
            "route": validated_route_event,
            "disclosure_level": disclosure["level"],
            "disclosure_text": disclosure["text"],
            "support_safe_status_summary": _build_execution_summary(
                specialist_status=specialist_status,
                route_event=validated_route_event,
                continuity=validated_continuity,
            ),
            "continuity_carryover_refs": continuity_carryover_refs,
            "persona_markers": validated_continuity["active_persona_anchor"]["persona_markers"],
            "spoken_manner_markers": validated_continuity["active_voice_expression"]["spoken_manner_markers"],
            "fallback_refused": validated_route_event["fallback_refused"],
        }
    )

    return load_website_specialist_harness_record(
        {
            "harness_id": harness_id,
            "request": request,
            "execution": execution,
            "support_safe_outcome_summary": _build_outcome_summary(
                specialist_status=specialist_status,
                request_status=request_status,
                activation_handoff_status=activation_handoff_status,
                route_event=validated_route_event,
            ),
            "activation_handoff_status": activation_handoff_status,
        }
    )
