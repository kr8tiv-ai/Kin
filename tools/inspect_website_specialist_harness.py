#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types import derive_concierge_lifecycle, derive_website_specialist_harness_record
from runtime_types.parsers import (
    load_cipher_continuity_record,
    load_routing_provenance_event,
    load_telegram_voice_turn,
)


def _local_ready_voice_turn() -> dict:
    return load_telegram_voice_turn(
        {
            "voice_turn_id": "tg-turn-ready-001",
            "platform": "telegram",
            "chat_id": "tg-chat-1001",
            "user_id": "tg-user-88",
            "voice_message_id": "tg-voice-msg-42",
            "voice_turn_status": "activation_ready",
            "activation_gate_status": "ready",
            "blocked_reason": None,
            "support_safe_status_summary": "Activation is ready and the owner received a voiced next-step reply.",
            "inbound_voice_note": {
                "telegram_file_id": "file_abc123",
                "telegram_file_unique_id": "unique_abc123",
                "audio_duration_seconds": 21,
                "mime_type": "audio/ogg",
                "message_timestamp": "2026-03-21T12:00:00Z",
                "source": "telegram_voice_note",
            },
            "transcript": {
                "transcript_status": "available",
                "transcript_language": "en",
                "transcript_summary": "Owner asked Cipher to continue with a website update after activation confirmation.",
                "intent_summary": "Continue with a website update once activation is ready.",
                "confidence_label": "high",
                "redaction_level": "support_safe_summary_only",
            },
            "reply": {
                "reply_status": "voiced",
                "delivery_channel": "telegram_voice_note",
                "voice_style": "concierge_warm",
                "reply_summary": "Confirms readiness and continues the support-safe website handoff.",
                "audio_duration_seconds": 18,
                "contains_action_prompt": True,
            },
            "continuity": {
                "continuity_status": "carryover",
                "session_reference": "tg-session-042",
                "turns_in_session": 3,
                "carryover_summary": "Continues the same activation thread from the owner's earlier voice note.",
                "prior_turn_reference": "tg-turn-041",
                "memory_scope": "support_safe_carryover",
            },
        }
    )


def _activation_ready_lifecycle() -> dict:
    return derive_concierge_lifecycle(
        claim_id="claim-concierge-001",
        claimant_label="demo-owner-cipher",
        claim_submitted=True,
        identity_verified=True,
        device_setup_complete=True,
        owner_confirmation_complete=True,
        support_intervention_required=False,
    )


def _carryover_continuity() -> dict:
    return load_cipher_continuity_record(
        {
            "continuity_id": "cipher-continuity-carryover-001",
            "continuity_status": "carryover",
            "continuity_source": "cross_surface_carryover",
            "identity_safety_status": "identity_safe",
            "drift_guard_triggered": False,
            "active_persona_anchor": {
                "anchor_id": "cipher-anchor-001",
                "archetype": "cipher",
                "truth_source": "truth_surface.persona_anchor",
                "mission_control_mode": "governed",
                "default_tone": "calm_precision",
                "persona_markers": [
                    "cipher_bloodline",
                    "mission_control_governed",
                    "support_safe",
                    "owner_guidance",
                    "calm_precision",
                ],
                "policy_focus": [
                    "support_safe_status_only",
                    "carryover_allowed",
                    "bounded_identity_markers",
                ],
                "continuity_notes": "Cipher carryover remains governed and references only support-safe continuity markers.",
            },
            "active_voice_expression": {
                "expression_id": "cipher-expression-carryover-001",
                "source": "cross_surface_inference",
                "voice_style": "concierge_warm",
                "spoken_manner_markers": [
                    "warmth",
                    "measured_pacing",
                    "carryover_callback",
                    "confident_guidance",
                ],
                "pacing_label": "steady",
                "energy_label": "calm",
                "action_prompt_present": False,
                "support_safe_summary": "Steady carryover posture that recalls the prior support-safe thread without exposing transcript detail.",
            },
            "continuity_marker_summary": "Cipher identity carries across surfaces with calm guidance and an explicit bounded callback to prior context.",
            "carryover_source_ref": "tg-session-042",
            "guardrail_reasons": ["none"],
            "policy_summary": "Active policy allows support-safe carryover summaries while keeping transcript and memory detail redacted.",
        }
    )


def _activation_ready_continuity() -> dict:
    return load_cipher_continuity_record(
        {
            "continuity_id": "cipher-continuity-activation-ready-001",
            "continuity_status": "activation_ready",
            "continuity_source": "telegram_voice_turn",
            "identity_safety_status": "identity_safe",
            "drift_guard_triggered": False,
            "active_persona_anchor": {
                "anchor_id": "cipher-anchor-001",
                "archetype": "cipher",
                "truth_source": "truth_surface.persona_anchor",
                "mission_control_mode": "governed",
                "default_tone": "warm_guidance",
                "persona_markers": [
                    "cipher_bloodline",
                    "mission_control_governed",
                    "support_safe",
                    "activation_ready",
                    "owner_guidance",
                ],
                "policy_focus": [
                    "support_safe_status_only",
                    "activation_guidance",
                    "policy_reason_visibility",
                ],
                "continuity_notes": "Cipher is active with Mission Control-governed persona truth and activation-ready guidance.",
            },
            "active_voice_expression": {
                "expression_id": "cipher-expression-activation-ready-001",
                "source": "telegram_voice_reply",
                "voice_style": "concierge_warm",
                "spoken_manner_markers": [
                    "warmth",
                    "measured_pacing",
                    "confident_guidance",
                ],
                "pacing_label": "measured",
                "energy_label": "focused",
                "action_prompt_present": True,
                "support_safe_summary": "Warm, measured activation guidance with a clear next step.",
            },
            "continuity_marker_summary": "Cipher persona markers and spoken manner both align with activation-ready support guidance.",
            "carryover_source_ref": "tg-turn-activation-ready-001",
            "guardrail_reasons": ["none"],
            "policy_summary": "Active policy permits support-safe activation guidance and bounded voice continuity markers.",
        }
    )


def derive_scenarios() -> list[tuple[str, dict]]:
    lifecycle = _activation_ready_lifecycle()
    voice_turn = _local_ready_voice_turn()

    local_route = load_routing_provenance_event(
        {
            "event_id": "route-local-success-001",
            "provider": "local-runtime",
            "model": "llama-local",
            "mode": "local",
            "route_reason": "Local website specialist completed the request without external help.",
            "fallback_used": False,
            "fallback_refused": False,
            "learned_effect_allowed": True,
        }
    )
    hybrid_route = load_routing_provenance_event(
        {
            "event_id": "route-hybrid-escalation-001",
            "provider": "hybrid-runtime",
            "model": "mixtral-support",
            "mode": "hybrid",
            "route_reason": "Local specialist required bounded hybrid help for the diagnostic review.",
            "fallback_used": True,
            "fallback_refused": False,
            "learned_effect_allowed": False,
        }
    )
    refused_route = load_routing_provenance_event(
        {
            "event_id": "route-fallback-refused-001",
            "provider": "local-runtime",
            "model": "llama-local",
            "mode": "local",
            "route_reason": "Local specialist could not expand coverage because external fallback was refused.",
            "fallback_used": False,
            "fallback_refused": True,
            "learned_effect_allowed": False,
        }
    )

    return [
        (
            "local_success",
            derive_website_specialist_harness_record(
                harness_id="ws-harness-local-success-derived-001",
                request_id="ws-request-local-success-derived-001",
                execution_id="ws-execution-local-success-derived-001",
                lifecycle=lifecycle,
                voice_turn=voice_turn,
                continuity=_carryover_continuity(),
                route_event=local_route,
                requested_capability="website_update",
                request_source="telegram_voice_turn",
                support_safe_request_summary="Owner asked Cipher to continue with a website update once activation was confirmed.",
                desired_outcome_summary="Handle the website-specialist step locally while preserving route honesty and bounded continuity markers.",
            ),
        ),
        (
            "hybrid_escalation",
            derive_website_specialist_harness_record(
                harness_id="ws-harness-hybrid-derived-001",
                request_id="ws-request-hybrid-derived-001",
                execution_id="ws-execution-hybrid-derived-001",
                lifecycle=lifecycle,
                voice_turn=voice_turn,
                continuity=_activation_ready_continuity(),
                route_event=hybrid_route,
                requested_capability="diagnostic_review",
                request_source="telegram_voice_turn",
                support_safe_request_summary="Owner requested a website diagnostic review that may need hybrid help to complete safely.",
                desired_outcome_summary="Escalate the specialist route honestly if local-only coverage is insufficient while keeping bounded continuity markers.",
            ),
        ),
        (
            "fallback_refused",
            derive_website_specialist_harness_record(
                harness_id="ws-harness-refused-derived-001",
                request_id="ws-request-refused-derived-001",
                execution_id="ws-execution-refused-derived-001",
                lifecycle=lifecycle,
                voice_turn=voice_turn,
                continuity=_carryover_continuity(),
                route_event=refused_route,
                requested_capability="diagnostic_review",
                request_source="telegram_voice_turn",
                support_safe_request_summary="Owner asked Cipher to keep the website diagnostic local even if fallback would help.",
                desired_outcome_summary="Refuse external fallback honestly and preserve support-safe continuity markers.",
            ),
        ),
    ]


def format_harness(name: str, record: dict) -> str:
    request = record["request"]
    execution = record["execution"]
    route = execution["route"]

    return "\n".join(
        [
            f"SCENARIO {name}",
            f"  harness_id: {record['harness_id']}",
            f"  request_status: {request['request_status']}",
            f"  requested_capability: {request['requested_capability']}",
            f"  activation_handoff_status: {record['activation_handoff_status']}",
            f"  route_mode: {route['mode']}",
            f"  route_reason: {route['route_reason']}",
            f"  disclosure_level: {execution['disclosure_level']}",
            f"  disclosure_text: {execution['disclosure_text']}",
            f"  specialist_status: {execution['specialist_status']}",
            f"  task_phase: {execution['task_phase']}",
            f"  fallback_refused: {'yes' if execution['fallback_refused'] else 'no'}",
            f"  continuity_refs: {', '.join(execution['continuity_carryover_refs'])}",
            f"  persona_markers: {', '.join(execution['persona_markers'])}",
            f"  spoken_manner_markers: {', '.join(execution['spoken_manner_markers'])}",
            f"  support_safe_status_summary: {execution['support_safe_status_summary']}",
            f"  support_safe_outcome_summary: {record['support_safe_outcome_summary']}",
        ]
    )


def main() -> int:
    print("Website specialist harness inspection")
    print("Support-safe restore point for representative local, hybrid, and fallback-refused website-specialist states.")
    print("S02 remains the factual Telegram voice/session seam, S03 remains the Cipher continuity seam, and S04 composes both into route-honest website-specialist execution truth.")
    print("This restore point proves the contract and inspection seam, not a live website execution runtime.")
    print()
    print("\n\n".join(format_harness(name, record) for name, record in derive_scenarios()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
