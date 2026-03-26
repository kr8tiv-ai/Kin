from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

from runtime_types import derive_concierge_lifecycle
from runtime_types.telegram_voice_loop import derive_telegram_voice_turn


def inbound_voice_note_payload() -> dict:
    return {
        "telegram_file_id": "file_voice_9001",
        "telegram_file_unique_id": "unique_voice_9001",
        "audio_duration_seconds": 19,
        "mime_type": "audio/ogg",
        "message_timestamp": "2026-03-21T13:05:00Z",
        "source": "telegram_voice_note",
    }


class TelegramVoiceLoopDerivationTests(unittest.TestCase):
    maxDiff = None

    def test_blocked_lifecycle_derives_blocked_voice_turn_without_voiced_reply(self) -> None:
        lifecycle = derive_concierge_lifecycle(
            claim_id="claim-concierge-blocked",
            claimant_label="demo-owner-blocked",
            claim_submitted=True,
            identity_verified=False,
            device_setup_complete=False,
            owner_confirmation_complete=False,
            support_intervention_required=True,
        )

        result = derive_telegram_voice_turn(
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
        )

        self.assertEqual(result["voice_turn_status"], "blocked")
        self.assertEqual(result["activation_gate_status"], "blocked")
        self.assertEqual(result["blocked_reason"], "identity_verification_pending")
        self.assertEqual(result["reply"]["reply_status"], "not_sent")
        self.assertEqual(result["reply"]["audio_duration_seconds"], 0)
        self.assertFalse(result["reply"]["contains_action_prompt"])
        self.assertEqual(result["continuity"]["continuity_status"], "new_session")
        self.assertEqual(result["continuity"]["memory_scope"], "none")
        self.assertIn("blocked", result["support_safe_status_summary"].lower())

    def test_activation_ready_lifecycle_derives_voiced_reply_and_continuity(self) -> None:
        lifecycle = derive_concierge_lifecycle(
            claim_id="claim-concierge-ready",
            claimant_label="demo-owner-ready",
            claim_submitted=True,
            identity_verified=True,
            device_setup_complete=True,
            owner_confirmation_complete=True,
            support_intervention_required=False,
        )

        result = derive_telegram_voice_turn(
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

        self.assertEqual(result["voice_turn_status"], "activation_ready")
        self.assertEqual(result["activation_gate_status"], "ready")
        self.assertIsNone(result["blocked_reason"])
        self.assertEqual(result["reply"]["reply_status"], "voiced")
        self.assertEqual(result["reply"]["voice_style"], "concierge_warm")
        self.assertTrue(result["reply"]["contains_action_prompt"])
        self.assertEqual(result["continuity"]["continuity_status"], "same_session")
        self.assertEqual(result["continuity"]["memory_scope"], "session_only")
        self.assertEqual(result["continuity"]["prior_turn_reference"], "tg-turn-ready-000")
        self.assertIn("activation is ready", result["support_safe_status_summary"].lower())

    def test_carryover_session_derives_machine_readable_continuity_for_future_slices(self) -> None:
        lifecycle = derive_concierge_lifecycle(
            claim_id="claim-concierge-carryover",
            claimant_label="demo-owner-carryover",
            claim_submitted=True,
            identity_verified=True,
            device_setup_complete=True,
            owner_confirmation_complete=True,
            support_intervention_required=False,
        )

        result = derive_telegram_voice_turn(
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
            continuation_session_reference="tg-session-carryover",
            turns_in_session=4,
            prior_turn_reference="tg-turn-carryover-003",
            continuity_status="carryover",
            carryover_summary="Carries forward the prior activation timing discussion without replaying transcript history.",
            reply_summary="Restates the activation window options and confirms support can continue from the prior thread.",
            reply_audio_duration_seconds=16,
            contains_action_prompt=True,
        )

        self.assertEqual(result["continuity"]["continuity_status"], "carryover")
        self.assertEqual(result["continuity"]["session_reference"], "tg-session-carryover")
        self.assertEqual(result["continuity"]["turns_in_session"], 4)
        self.assertEqual(result["continuity"]["prior_turn_reference"], "tg-turn-carryover-003")
        self.assertEqual(result["continuity"]["memory_scope"], "support_safe_carryover")
        self.assertNotIn("raw", result["continuity"]["carryover_summary"].lower())
        self.assertEqual(result["reply"]["reply_status"], "voiced")

    def test_cli_restore_point_prints_stable_support_safe_summary(self) -> None:
        script_path = Path(__file__).resolve().parent.parent / "tools" / "inspect_telegram_voice_loop.py"

        completed = subprocess.run(
            [sys.executable, str(script_path)],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(completed.returncode, 0, msg=completed.stderr)
        self.assertEqual(
            completed.stdout,
            "\n".join(
                [
                    "SCENARIO blocked",
                    "  voice_turn_id: tg-turn-blocked-001",
                    "  voice_turn_status: blocked",
                    "  activation_gate_status: blocked",
                    "  blocked_reason: identity_verification_pending",
                    "  transcript_summary: Owner asked whether setup can continue today.",
                    "  intent_summary: Check why activation is still blocked.",
                    "  reply_status: not_sent",
                    "  reply_summary: No activation reply is sent because onboarding is still blocked pending identity verification pending.",
                    "  continuity_status: new_session",
                    "  memory_scope: none",
                    "  session_reference: tg-session-blocked",
                    "  turns_in_session: 1",
                    "  carryover_summary: No prior voice context is carried because this is the first blocked turn in the session.",
                    "  support_safe_status_summary: Voice note received, but activation stays blocked until identity verification pending.",
                    "SCENARIO activation_ready",
                    "  voice_turn_id: tg-turn-ready-001",
                    "  voice_turn_status: activation_ready",
                    "  activation_gate_status: ready",
                    "  blocked_reason: none",
                    "  transcript_summary: Owner asked to confirm activation scheduling after support cleared the checklist.",
                    "  intent_summary: Schedule activation handoff.",
                    "  reply_status: voiced",
                    "  reply_summary: Confirms activation is ready and asks the owner to reply with a preferred handoff time.",
                    "  continuity_status: same_session",
                    "  memory_scope: session_only",
                    "  session_reference: tg-session-ready",
                    "  turns_in_session: 2",
                    "  carryover_summary: Continues the same support-cleared activation scheduling thread.",
                    "  support_safe_status_summary: Activation is ready and the owner received a voiced next-step reply.",
                    "SCENARIO continuity_carryover",
                    "  voice_turn_id: tg-turn-carryover-004",
                    "  voice_turn_status: activation_ready",
                    "  activation_gate_status: ready",
                    "  blocked_reason: none",
                    "  transcript_summary: Owner followed up on the previously discussed activation handoff window.",
                    "  intent_summary: Continue activation scheduling context.",
                    "  reply_status: voiced",
                    "  reply_summary: Restates the activation window options and confirms support can continue from the prior thread.",
                    "  continuity_status: carryover",
                    "  memory_scope: support_safe_carryover",
                    "  session_reference: tg-session-carryover",
                    "  turns_in_session: 4",
                    "  carryover_summary: Carries forward the prior activation timing discussion without replaying transcript history.",
                    "  support_safe_status_summary: Activation remains ready and the voiced reply carries forward the prior support-safe context.",
                    "",
                ]
            ),
        )
        self.assertNotIn("raw transcript", completed.stdout.lower())
        self.assertNotIn("private memory", completed.stdout.lower())


if __name__ == "__main__":
    unittest.main()
