from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.cipher_continuity import derive_cipher_continuity
from runtime_types.concierge_claims import derive_concierge_lifecycle
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
            "task_id": "s03-t02",
            "phase": "composition",
            "target_outcome": "Derive Cipher continuity from truth surface and voice turn.",
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


class CipherContinuityCompositionTests(unittest.TestCase):
    maxDiff = None

    def test_activation_ready_voice_turn_composes_identity_safe_continuity(self) -> None:
        truth_surface = load_truth_surface(truth_surface_payload())
        lifecycle = derive_concierge_lifecycle(
            claim_id="claim-concierge-ready",
            claimant_label="demo-owner-ready",
            claim_submitted=True,
            identity_verified=True,
            device_setup_complete=True,
            owner_confirmation_complete=True,
            support_intervention_required=False,
        )
        voice_turn = derive_telegram_voice_turn(
            voice_turn_id="tg-turn-ready-001",
            chat_id="tg-chat-601",
            user_id="tg-user-601",
            voice_message_id="tg-voice-msg-601",
            inbound_voice_note=inbound_voice_note_payload(),
            lifecycle=lifecycle,
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

        result = derive_cipher_continuity(
            truth_surface=truth_surface,
            voice_turn=voice_turn,
            continuity_id="cipher-continuity-activation-ready-001",
            anchor_id="cipher-anchor-001",
            expression_id="cipher-expression-activation-ready-001",
            continuity_notes="Cipher is active with Mission Control-governed persona truth and activation-ready guidance.",
            policy_summary="Active policy permits support-safe activation guidance and bounded voice continuity markers.",
            continuity_marker_summary="Cipher persona markers and spoken manner both align with activation-ready support guidance.",
            support_safe_voice_summary="Warm, measured activation guidance with a clear next step.",
            carryover_source_ref=voice_turn["voice_turn_id"],
        )

        self.assertEqual(result["continuity_status"], "activation_ready")
        self.assertEqual(result["continuity_source"], "telegram_voice_turn")
        self.assertEqual(result["identity_safety_status"], "identity_safe")
        self.assertFalse(result["drift_guard_triggered"])
        self.assertIn("activation_ready", result["active_persona_anchor"]["persona_markers"])
        self.assertIn("warmth", result["active_voice_expression"]["spoken_manner_markers"])
        self.assertIn("confident_guidance", result["active_voice_expression"]["spoken_manner_markers"])
        self.assertEqual(result["carryover_source_ref"], "tg-turn-ready-001")
        self.assertEqual(result["guardrail_reasons"], ["none"])

    def test_carryover_voice_turn_composes_cross_surface_carryover_continuity(self) -> None:
        truth_surface = load_truth_surface(
            truth_surface_payload(style_flags=["bounded_identity_markers"])
        )
        lifecycle = derive_concierge_lifecycle(
            claim_id="claim-concierge-carryover",
            claimant_label="demo-owner-carryover",
            claim_submitted=True,
            identity_verified=True,
            device_setup_complete=True,
            owner_confirmation_complete=True,
            support_intervention_required=False,
        )
        voice_turn = derive_telegram_voice_turn(
            voice_turn_id="tg-turn-carryover-004",
            chat_id="tg-chat-701",
            user_id="tg-user-701",
            voice_message_id="tg-voice-msg-701",
            inbound_voice_note=inbound_voice_note_payload(),
            lifecycle=lifecycle,
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

        result = derive_cipher_continuity(
            truth_surface=truth_surface,
            voice_turn=voice_turn,
            continuity_id="cipher-continuity-carryover-001",
            anchor_id="cipher-anchor-001",
            expression_id="cipher-expression-carryover-001",
            continuity_notes="Cipher carryover remains governed and references only support-safe continuity markers.",
            policy_summary="Active policy allows support-safe carryover summaries while keeping transcript and memory detail redacted.",
            continuity_marker_summary="Cipher identity carries across surfaces with calm guidance and an explicit bounded callback to prior context.",
            support_safe_voice_summary="Steady carryover posture that recalls the prior support-safe thread without exposing transcript detail.",
            carryover_source_ref=voice_turn["continuity"]["session_reference"],
        )

        self.assertEqual(result["continuity_status"], "carryover")
        self.assertEqual(result["continuity_source"], "cross_surface_carryover")
        self.assertEqual(result["identity_safety_status"], "identity_safe")
        self.assertFalse(result["drift_guard_triggered"])
        self.assertIn("carryover_callback", result["active_voice_expression"]["spoken_manner_markers"])
        self.assertEqual(result["active_voice_expression"]["source"], "cross_surface_inference")
        self.assertIn("bounded_identity_markers", result["active_persona_anchor"]["policy_focus"])
        self.assertEqual(result["carryover_source_ref"], "tg-session-042")

    def test_policy_guard_or_drift_signal_forces_guarded_continuity(self) -> None:
        truth_surface = load_truth_surface(
            truth_surface_payload(
                style_flags=["identity_guard_required", "style_restriction_enforced"],
                drift_signals=["generic_assistant_posture"],
            )
        )
        lifecycle = derive_concierge_lifecycle(
            claim_id="claim-concierge-blocked",
            claimant_label="demo-owner-blocked",
            claim_submitted=True,
            identity_verified=False,
            device_setup_complete=False,
            owner_confirmation_complete=False,
            support_intervention_required=True,
        )
        voice_turn = derive_telegram_voice_turn(
            voice_turn_id="tg-turn-blocked-001",
            chat_id="tg-chat-501",
            user_id="tg-user-501",
            voice_message_id="tg-voice-msg-501",
            inbound_voice_note=inbound_voice_note_payload(),
            lifecycle=lifecycle,
            transcript_summary="Owner asked whether setup can continue today.",
            intent_summary="Check why activation is still blocked.",
            transcript_language="en",
            transcript_confidence="medium",
            continuation_session_reference="tg-session-blocked",
            turns_in_session=1,
            voice_style="concierge_brisk",
        )

        result = derive_cipher_continuity(
            truth_surface=truth_surface,
            voice_turn=voice_turn,
            continuity_id="cipher-continuity-drift-guard-001",
            anchor_id="cipher-anchor-001",
            expression_id="cipher-expression-drift-guard-001",
            continuity_notes="Cipher persona remains pinned, but policy guards suppress generic drift and over-broad style carryover.",
            policy_summary="Active policy blocked broader style transfer and required identity-safe guard posture.",
            continuity_marker_summary="Cipher continuity is preserved via explicit guardrails instead of permissive carryover.",
            support_safe_voice_summary="Guarded delivery keeps boundaries explicit because persona continuity was at risk of generic drift.",
        )

        self.assertEqual(result["continuity_status"], "drift_guard")
        self.assertEqual(result["continuity_source"], "truth_surface_only")
        self.assertEqual(result["identity_safety_status"], "guarded")
        self.assertTrue(result["drift_guard_triggered"])
        self.assertIn("guarded_boundaries", result["active_voice_expression"]["spoken_manner_markers"])
        self.assertIn("voice_seam_guard", result["guardrail_reasons"])
        self.assertIn("drift_detected", result["guardrail_reasons"])
        self.assertIn("identity_guard_required", result["active_persona_anchor"]["policy_focus"])

    def test_composed_output_matches_repo_fixture_shape_for_activation_ready(self) -> None:
        fixture_path = ROOT / "schemas" / "examples" / "cipher-continuity-record.activation-ready.example.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

        truth_surface = load_truth_surface(truth_surface_payload())
        lifecycle = derive_concierge_lifecycle(
            claim_id="claim-concierge-ready",
            claimant_label="demo-owner-ready",
            claim_submitted=True,
            identity_verified=True,
            device_setup_complete=True,
            owner_confirmation_complete=True,
            support_intervention_required=False,
        )
        voice_turn = derive_telegram_voice_turn(
            voice_turn_id="tg-turn-activation-ready-001",
            chat_id="tg-chat-601",
            user_id="tg-user-601",
            voice_message_id="tg-voice-msg-601",
            inbound_voice_note=inbound_voice_note_payload(),
            lifecycle=lifecycle,
            transcript_summary="Owner asked whether activation can start after today's support check-in.",
            intent_summary="Confirm activation readiness and next support step.",
            transcript_language="en",
            transcript_confidence="high",
            continuation_session_reference="tg-session-ready",
            turns_in_session=1,
            continuity_status="same_session",
            voice_style="concierge_warm",
            reply_summary="Warm, measured activation guidance with a clear next step.",
            reply_audio_duration_seconds=18,
            contains_action_prompt=True,
        )

        result = derive_cipher_continuity(
            truth_surface=truth_surface,
            voice_turn=voice_turn,
            continuity_id=fixture["continuity_id"],
            anchor_id=fixture["active_persona_anchor"]["anchor_id"],
            expression_id=fixture["active_voice_expression"]["expression_id"],
            continuity_notes=fixture["active_persona_anchor"]["continuity_notes"],
            policy_summary=fixture["policy_summary"],
            continuity_marker_summary=fixture["continuity_marker_summary"],
            support_safe_voice_summary=fixture["active_voice_expression"]["support_safe_summary"],
            carryover_source_ref=fixture["carryover_source_ref"],
        )

        self.assertEqual(result["continuity_status"], fixture["continuity_status"])
        self.assertEqual(result["continuity_source"], fixture["continuity_source"])
        self.assertEqual(result["identity_safety_status"], fixture["identity_safety_status"])
        self.assertEqual(result["active_persona_anchor"]["archetype"], fixture["active_persona_anchor"]["archetype"])
        self.assertEqual(result["active_voice_expression"]["voice_style"], fixture["active_voice_expression"]["voice_style"])
        self.assertNotIn("raw transcript", json.dumps(result).lower())


if __name__ == "__main__":
    unittest.main()
