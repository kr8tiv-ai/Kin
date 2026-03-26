#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types import derive_cipher_continuity, derive_concierge_lifecycle
from runtime_types.parsers import load_truth_surface
from runtime_types.telegram_voice_loop import derive_telegram_voice_turn


def inbound_voice_note_payload() -> dict:
    return {
        "telegram_file_id": "file_voice_cipher_001",
        "telegram_file_unique_id": "unique_voice_cipher_001",
        "audio_duration_seconds": 19,
        "mime_type": "audio/ogg",
        "message_timestamp": "2026-03-21T13:05:00Z",
        "source": "telegram_voice_note",
    }


def truth_surface_payload(*, style_flags: list[str] | None = None, drift_signals: list[str] | None = None) -> dict:
    return {
        "active_spec": {
            "milestone": "M006-2wq6ae",
            "slice": "S03",
        },
        "active_policy": {
            "policy_focus": ["support_safe_status_only", "activation_guidance"],
            "style_flags": style_flags or [],
        },
        "current_task": {
            "task_id": "s03-t03",
            "phase": "restore-point",
            "target_outcome": "Inspect Cipher continuity from truth surface and voice turn.",
        },
        "persona_anchor": {
            "companion": "Cipher",
            "tone": "warm, calm, precise",
            "generic_drift_signals": drift_signals or [],
        },
        "routing_policy": {},
        "fallback_policy": {},
        "critique_policy": {},
        "revision_budget": {},
        "active_project_preferences": [],
        "active_owner_preferences": [],
        "recent_explicit_feedback": [],
        "recent_behavior_signals": [],
        "disclosure_state": {},
    }


def derive_scenarios() -> list[tuple[str, dict]]:
    activation_truth_surface = load_truth_surface(truth_surface_payload())
    carryover_truth_surface = load_truth_surface(
        truth_surface_payload(style_flags=["bounded_identity_markers"])
    )
    drift_guard_truth_surface = load_truth_surface(
        truth_surface_payload(
            style_flags=["identity_guard_required", "style_restriction_enforced"],
            drift_signals=["generic_assistant_posture"],
        )
    )

    activation_lifecycle = derive_concierge_lifecycle(
        claim_id="claim-concierge-ready",
        claimant_label="demo-owner-ready",
        claim_submitted=True,
        identity_verified=True,
        device_setup_complete=True,
        owner_confirmation_complete=True,
        support_intervention_required=False,
    )
    carryover_lifecycle = derive_concierge_lifecycle(
        claim_id="claim-concierge-carryover",
        claimant_label="demo-owner-carryover",
        claim_submitted=True,
        identity_verified=True,
        device_setup_complete=True,
        owner_confirmation_complete=True,
        support_intervention_required=False,
    )
    drift_guard_lifecycle = derive_concierge_lifecycle(
        claim_id="claim-concierge-blocked",
        claimant_label="demo-owner-blocked",
        claim_submitted=True,
        identity_verified=False,
        device_setup_complete=False,
        owner_confirmation_complete=False,
        support_intervention_required=True,
    )

    activation_voice_turn = derive_telegram_voice_turn(
        voice_turn_id="tg-turn-ready-001",
        chat_id="tg-chat-601",
        user_id="tg-user-601",
        voice_message_id="tg-voice-msg-601",
        inbound_voice_note=inbound_voice_note_payload(),
        lifecycle=activation_lifecycle,
        transcript_summary="Owner asked to confirm activation scheduling after support cleared the checklist.",
        intent_summary="Schedule activation handoff.",
        transcript_language="en",
        transcript_confidence="high",
        continuation_session_reference="tg-session-ready",
        turns_in_session=2,
        prior_turn_reference="tg-turn-ready-000",
        continuity_status="same_session",
        carryover_summary="Continues the same support-cleared activation scheduling thread.",
        voice_style="concierge_warm",
        reply_summary="Confirms activation is ready and asks the owner to reply with a preferred handoff time.",
        reply_audio_duration_seconds=17,
        contains_action_prompt=True,
    )
    carryover_voice_turn = derive_telegram_voice_turn(
        voice_turn_id="tg-turn-carryover-004",
        chat_id="tg-chat-701",
        user_id="tg-user-701",
        voice_message_id="tg-voice-msg-701",
        inbound_voice_note=inbound_voice_note_payload(),
        lifecycle=carryover_lifecycle,
        transcript_summary="Owner followed up on the previously discussed activation handoff window.",
        intent_summary="Continue activation scheduling context.",
        transcript_language="en",
        transcript_confidence="high",
        continuation_session_reference="tg-session-042",
        turns_in_session=4,
        prior_turn_reference="tg-turn-carryover-003",
        continuity_status="carryover",
        carryover_summary="Carries forward the prior activation timing discussion without replaying transcript history.",
        reply_summary="Restates the activation window options and confirms support can continue from the prior thread.",
        reply_audio_duration_seconds=16,
        contains_action_prompt=False,
    )
    drift_guard_voice_turn = derive_telegram_voice_turn(
        voice_turn_id="tg-turn-blocked-001",
        chat_id="tg-chat-501",
        user_id="tg-user-501",
        voice_message_id="tg-voice-msg-501",
        inbound_voice_note=inbound_voice_note_payload(),
        lifecycle=drift_guard_lifecycle,
        transcript_summary="Owner asked whether setup can continue today.",
        intent_summary="Check why activation is still blocked.",
        transcript_language="en",
        transcript_confidence="medium",
        continuation_session_reference="tg-session-blocked",
        turns_in_session=1,
        voice_style="concierge_brisk",
    )

    return [
        (
            "activation_ready",
            derive_cipher_continuity(
                truth_surface=activation_truth_surface,
                voice_turn=activation_voice_turn,
                continuity_id="cipher-continuity-activation-ready-001",
                anchor_id="cipher-anchor-001",
                expression_id="cipher-expression-activation-ready-001",
                continuity_notes="Cipher is active with Mission Control-governed persona truth and activation-ready guidance.",
                policy_summary="Active policy permits support-safe activation guidance and bounded voice continuity markers.",
                continuity_marker_summary="Cipher persona markers and spoken manner both align with activation-ready support guidance.",
                support_safe_voice_summary="Warm, measured activation guidance with a clear next step.",
                carryover_source_ref=activation_voice_turn["voice_turn_id"],
            ),
        ),
        (
            "carryover",
            derive_cipher_continuity(
                truth_surface=carryover_truth_surface,
                voice_turn=carryover_voice_turn,
                continuity_id="cipher-continuity-carryover-001",
                anchor_id="cipher-anchor-001",
                expression_id="cipher-expression-carryover-001",
                continuity_notes="Cipher carryover remains governed and references only support-safe continuity markers.",
                policy_summary="Active policy allows support-safe carryover summaries while keeping transcript and memory detail redacted.",
                continuity_marker_summary="Cipher identity carries across surfaces with calm guidance and an explicit bounded callback to prior context.",
                support_safe_voice_summary="Steady carryover posture that recalls the prior support-safe thread without exposing transcript detail.",
                carryover_source_ref=carryover_voice_turn["continuity"]["session_reference"],
            ),
        ),
        (
            "drift_guard",
            derive_cipher_continuity(
                truth_surface=drift_guard_truth_surface,
                voice_turn=drift_guard_voice_turn,
                continuity_id="cipher-continuity-drift-guard-001",
                anchor_id="cipher-anchor-001",
                expression_id="cipher-expression-drift-guard-001",
                continuity_notes="Cipher persona remains pinned, but policy guards suppress generic drift and over-broad style carryover.",
                policy_summary="Active policy blocked broader style transfer and required identity-safe guard posture.",
                continuity_marker_summary="Cipher continuity is preserved via explicit guardrails instead of permissive carryover.",
                support_safe_voice_summary="Guarded delivery keeps boundaries explicit because persona continuity was at risk of generic drift.",
            ),
        ),
    ]


def format_continuity(name: str, record: dict) -> str:
    persona_anchor = record["active_persona_anchor"]
    voice_expression = record["active_voice_expression"]

    return "\n".join(
        [
            f"SCENARIO {name}",
            f"  continuity_id: {record['continuity_id']}",
            f"  continuity_status: {record['continuity_status']}",
            f"  continuity_source: {record['continuity_source']}",
            f"  identity_safety_status: {record['identity_safety_status']}",
            f"  drift_guard_triggered: {'yes' if record['drift_guard_triggered'] else 'no'}",
            f"  persona_markers: {', '.join(persona_anchor['persona_markers'])}",
            f"  spoken_manner_markers: {', '.join(voice_expression['spoken_manner_markers'])}",
            f"  carryover_source_ref: {record['carryover_source_ref'] or 'none'}",
            f"  guardrail_reasons: {', '.join(record['guardrail_reasons'])}",
            f"  policy_summary: {record['policy_summary']}",
            f"  continuity_marker_summary: {record['continuity_marker_summary']}",
            f"  support_safe_voice_summary: {voice_expression['support_safe_summary']}",
        ]
    )


def main() -> int:
    print("Cipher continuity inspection")
    print("Support-safe restore point for representative multi-surface identity continuity states.")
    print("S02 remains the factual Telegram voice/session seam; this S03 surface layers identity continuity on top.")
    print()
    print("\n\n".join(format_continuity(name, record) for name, record in derive_scenarios()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
