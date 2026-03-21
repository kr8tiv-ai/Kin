from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

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


def derive_scenarios() -> list[tuple[str, dict]]:
    blocked_lifecycle = derive_concierge_lifecycle(
        claim_id="claim-concierge-blocked",
        claimant_label="demo-owner-blocked",
        claim_submitted=True,
        identity_verified=False,
        device_setup_complete=False,
        owner_confirmation_complete=False,
        support_intervention_required=True,
    )
    ready_lifecycle = derive_concierge_lifecycle(
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

    return [
        (
            "blocked",
            derive_telegram_voice_turn(
                voice_turn_id="tg-turn-blocked-001",
                chat_id="tg-chat-501",
                user_id="tg-user-501",
                voice_message_id="tg-voice-msg-501",
                inbound_voice_note=inbound_voice_note_payload(),
                lifecycle=blocked_lifecycle,
                transcript_summary="Owner asked whether setup can continue today.",
                intent_summary="Check why activation is still blocked.",
                transcript_language="en",
                transcript_confidence="medium",
                continuation_session_reference="tg-session-blocked",
                turns_in_session=1,
            ),
        ),
        (
            "activation_ready",
            derive_telegram_voice_turn(
                voice_turn_id="tg-turn-ready-001",
                chat_id="tg-chat-601",
                user_id="tg-user-601",
                voice_message_id="tg-voice-msg-601",
                inbound_voice_note=inbound_voice_note_payload(),
                lifecycle=ready_lifecycle,
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
            ),
        ),
        (
            "continuity_carryover",
            derive_telegram_voice_turn(
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
                continuation_session_reference="tg-session-carryover",
                turns_in_session=4,
                prior_turn_reference="tg-turn-carryover-003",
                continuity_status="carryover",
                carryover_summary="Carries forward the prior activation timing discussion without replaying transcript history.",
                reply_summary="Restates the activation window options and confirms support can continue from the prior thread.",
                reply_audio_duration_seconds=16,
                contains_action_prompt=True,
            ),
        ),
    ]


def format_voice_turn(name: str, voice_turn: dict) -> str:
    blocked_reason = voice_turn["blocked_reason"] or "none"
    transcript = voice_turn["transcript"]
    reply = voice_turn["reply"]
    continuity = voice_turn["continuity"]

    return "\n".join(
        [
            f"SCENARIO {name}",
            f"  voice_turn_id: {voice_turn['voice_turn_id']}",
            f"  voice_turn_status: {voice_turn['voice_turn_status']}",
            f"  activation_gate_status: {voice_turn['activation_gate_status']}",
            f"  blocked_reason: {blocked_reason}",
            f"  transcript_summary: {transcript['transcript_summary']}",
            f"  intent_summary: {transcript['intent_summary']}",
            f"  reply_status: {reply['reply_status']}",
            f"  reply_summary: {reply['reply_summary']}",
            f"  continuity_status: {continuity['continuity_status']}",
            f"  memory_scope: {continuity['memory_scope']}",
            f"  session_reference: {continuity['session_reference']}",
            f"  turns_in_session: {continuity['turns_in_session']}",
            f"  carryover_summary: {continuity['carryover_summary']}",
            f"  support_safe_status_summary: {voice_turn['support_safe_status_summary']}",
        ]
    )


def main() -> None:
    print("\n".join(format_voice_turn(name, voice_turn) for name, voice_turn in derive_scenarios()))


if __name__ == "__main__":
    main()
