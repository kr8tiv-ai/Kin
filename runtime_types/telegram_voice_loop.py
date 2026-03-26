from __future__ import annotations

from .contracts import (
    ConciergeClaimLifecycleRecord,
    TelegramContinuityStatus,
    TelegramReplyDeliveryChannel,
    TelegramTranscriptConfidence,
    TelegramVoiceStyle,
    TelegramInboundVoiceNoteRecord,
    TelegramVoiceTurnRecord,
)
from .parsers import (
    load_telegram_voice_continuity,
    load_telegram_voice_reply,
    load_telegram_voice_transcript,
    load_telegram_voice_turn,
)


def derive_telegram_voice_turn(
    *,
    voice_turn_id: str,
    chat_id: str,
    user_id: str,
    voice_message_id: str,
    inbound_voice_note: TelegramInboundVoiceNoteRecord,
    lifecycle: ConciergeClaimLifecycleRecord,
    transcript_summary: str,
    intent_summary: str,
    transcript_language: str,
    transcript_confidence: TelegramTranscriptConfidence,
    continuation_session_reference: str,
    turns_in_session: int,
    prior_turn_reference: str | None = None,
    continuity_status: TelegramContinuityStatus | None = None,
    carryover_summary: str | None = None,
    voice_style: TelegramVoiceStyle = "concierge_warm",
    reply_summary: str | None = None,
    reply_audio_duration_seconds: int = 0,
    contains_action_prompt: bool = False,
    delivery_channel: TelegramReplyDeliveryChannel = "telegram_voice_note",
) -> TelegramVoiceTurnRecord:
    activation_ready = lifecycle["claim_status"] == "activation_ready" and lifecycle["activation_ready"]

    derived_continuity_status = continuity_status or (
        "carryover"
        if prior_turn_reference and turns_in_session > 2
        else "same_session"
        if prior_turn_reference
        else "new_session"
    )

    if activation_ready:
        voice_turn_status = "activation_ready"
        activation_gate_status = "ready"
        blocked_reason = None
        support_safe_status_summary = (
            "Activation remains ready and the voiced reply carries forward the prior support-safe context."
            if derived_continuity_status == "carryover"
            else "Activation is ready and the owner received a voiced next-step reply."
        )
        continuity_memory_scope = (
            "support_safe_carryover" if derived_continuity_status == "carryover" else "session_only"
        )
        continuity_carryover_summary = carryover_summary or (
            "Carries forward the previous activation-ready checkpoint and support-safe session context."
            if derived_continuity_status == "carryover"
            else "Continues the same activation thread after support confirmed the final checkpoint."
            if derived_continuity_status == "same_session"
            else "No prior voice context is required because activation is ready from the first session turn."
        )
        derived_reply_summary = reply_summary or "Confirms readiness and asks the owner to reply to support to schedule activation."
        derived_reply_duration = reply_audio_duration_seconds
        derived_action_prompt = contains_action_prompt
        reply_status = "voiced"
    else:
        voice_turn_status = "blocked"
        activation_gate_status = "blocked"
        blocked_reason = lifecycle["blocking_reason"] or "owner_confirmation_pending"
        support_safe_status_summary = (
            f"Voice note received, but activation stays blocked until {blocked_reason.replace('_', ' ')}."
        )
        continuity_memory_scope = "none"
        continuity_carryover_summary = carryover_summary or (
            "No prior voice context is carried because this is the first blocked turn in the session."
            if derived_continuity_status == "new_session"
            else "Only the current blocked onboarding state is carried forward in support-safe form."
        )
        derived_reply_summary = reply_summary or (
            f"No activation reply is sent because onboarding is still blocked pending {blocked_reason.replace('_', ' ')}."
        )
        derived_reply_duration = 0
        derived_action_prompt = False
        reply_status = "not_sent"

    transcript = load_telegram_voice_transcript(
        {
            "transcript_status": "available",
            "transcript_language": transcript_language,
            "transcript_summary": transcript_summary,
            "intent_summary": intent_summary,
            "confidence_label": transcript_confidence,
            "redaction_level": "support_safe_summary_only",
        }
    )
    reply = load_telegram_voice_reply(
        {
            "reply_status": reply_status,
            "delivery_channel": delivery_channel,
            "voice_style": voice_style,
            "reply_summary": derived_reply_summary,
            "audio_duration_seconds": derived_reply_duration,
            "contains_action_prompt": derived_action_prompt,
        }
    )
    continuity = load_telegram_voice_continuity(
        {
            "continuity_status": derived_continuity_status,
            "session_reference": continuation_session_reference,
            "turns_in_session": turns_in_session,
            "carryover_summary": continuity_carryover_summary,
            "prior_turn_reference": prior_turn_reference,
            "memory_scope": continuity_memory_scope,
        }
    )

    return load_telegram_voice_turn(
        {
            "voice_turn_id": voice_turn_id,
            "platform": "telegram",
            "chat_id": chat_id,
            "user_id": user_id,
            "voice_message_id": voice_message_id,
            "voice_turn_status": voice_turn_status,
            "activation_gate_status": activation_gate_status,
            "blocked_reason": blocked_reason,
            "support_safe_status_summary": support_safe_status_summary,
            "inbound_voice_note": inbound_voice_note,
            "transcript": transcript,
            "reply": reply,
            "continuity": continuity,
        }
    )
