from __future__ import annotations

from typing import Any, cast

from .contracts import (
    BehaviorSignalEntry,
    CipherContinuityRecord,
    CipherPersonaAnchorRecord,
    CipherVoiceExpressionRecord,
    ConciergeClaimLifecycleRecord,
    ConciergeSetupGuidanceRecord,
    FeedbackLedgerEntry,
    PreferenceRecord,
    PromotionDecisionRecord,
    RoutingProvenanceEvent,
    RuntimeStepArtifacts,
    TelegramVoiceContinuityRecord,
    TelegramVoiceReplyRecord,
    TelegramVoiceTranscriptRecord,
    TelegramVoiceTurnRecord,
    TruthSurface,
    WebsiteSpecialistExecutionRecord,
    WebsiteSpecialistHarnessRecord,
    WebsiteSpecialistRequestRecord,
)
from .schema_validation import validate_against_schema_name


def _load(schema_name: str, data: object, type_name: str) -> Any:
    errors = validate_against_schema_name(schema_name, data)
    if errors:
        raise ValueError(f"Invalid {type_name}: " + "; ".join(errors))
    return data


def load_truth_surface(data: object) -> TruthSurface:
    return cast(TruthSurface, _load("truth-surface.schema.json", data, "TruthSurface"))


def load_behavior_signal_entry(data: object) -> BehaviorSignalEntry:
    return cast(
        BehaviorSignalEntry,
        _load("behavior-signal-entry.schema.json", data, "BehaviorSignalEntry"),
    )


def load_feedback_ledger_entry(data: object) -> FeedbackLedgerEntry:
    return cast(
        FeedbackLedgerEntry,
        _load("feedback-ledger-entry.schema.json", data, "FeedbackLedgerEntry"),
    )


def load_preference_record(data: object) -> PreferenceRecord:
    return cast(PreferenceRecord, _load("preference-record.schema.json", data, "PreferenceRecord"))


def load_routing_provenance_event(data: object) -> RoutingProvenanceEvent:
    return cast(
        RoutingProvenanceEvent,
        _load("routing-provenance-event.schema.json", data, "RoutingProvenanceEvent"),
    )


def load_promotion_decision_record(data: object) -> PromotionDecisionRecord:
    return cast(
        PromotionDecisionRecord,
        _load("promotion-decision-record.schema.json", data, "PromotionDecisionRecord"),
    )


def load_runtime_step_artifacts(data: object) -> RuntimeStepArtifacts:
    return cast(
        RuntimeStepArtifacts,
        _load("runtime-step-artifacts.schema.json", data, "RuntimeStepArtifacts"),
    )


def load_concierge_claim_lifecycle(data: object) -> ConciergeClaimLifecycleRecord:
    return cast(
        ConciergeClaimLifecycleRecord,
        _load("concierge-claim-lifecycle.schema.json", data, "ConciergeClaimLifecycleRecord"),
    )


def load_concierge_setup_guidance(data: object) -> ConciergeSetupGuidanceRecord:
    return cast(
        ConciergeSetupGuidanceRecord,
        _load("concierge-setup-guidance.schema.json", data, "ConciergeSetupGuidanceRecord"),
    )


def load_telegram_voice_transcript(data: object) -> TelegramVoiceTranscriptRecord:
    return cast(
        TelegramVoiceTranscriptRecord,
        _load("telegram-voice-transcript.schema.json", data, "TelegramVoiceTranscriptRecord"),
    )


def load_telegram_voice_reply(data: object) -> TelegramVoiceReplyRecord:
    return cast(
        TelegramVoiceReplyRecord,
        _load("telegram-voice-reply.schema.json", data, "TelegramVoiceReplyRecord"),
    )


def load_telegram_voice_continuity(data: object) -> TelegramVoiceContinuityRecord:
    return cast(
        TelegramVoiceContinuityRecord,
        _load("telegram-voice-continuity.schema.json", data, "TelegramVoiceContinuityRecord"),
    )


def load_telegram_voice_turn(data: object) -> TelegramVoiceTurnRecord:
    return cast(
        TelegramVoiceTurnRecord,
        _load("telegram-voice-turn.schema.json", data, "TelegramVoiceTurnRecord"),
    )


def load_cipher_persona_anchor(data: object) -> CipherPersonaAnchorRecord:
    return cast(
        CipherPersonaAnchorRecord,
        _load("cipher-persona-anchor.schema.json", data, "CipherPersonaAnchorRecord"),
    )


def load_cipher_voice_expression(data: object) -> CipherVoiceExpressionRecord:
    return cast(
        CipherVoiceExpressionRecord,
        _load("cipher-voice-expression.schema.json", data, "CipherVoiceExpressionRecord"),
    )


def load_cipher_continuity_record(data: object) -> CipherContinuityRecord:
    return cast(
        CipherContinuityRecord,
        _load("cipher-continuity-record.schema.json", data, "CipherContinuityRecord"),
    )


def load_website_specialist_request(data: object) -> WebsiteSpecialistRequestRecord:
    return cast(
        WebsiteSpecialistRequestRecord,
        _load("website-specialist-request.schema.json", data, "WebsiteSpecialistRequestRecord"),
    )


def load_website_specialist_execution(data: object) -> WebsiteSpecialistExecutionRecord:
    return cast(
        WebsiteSpecialistExecutionRecord,
        _load("website-specialist-execution.schema.json", data, "WebsiteSpecialistExecutionRecord"),
    )


def load_website_specialist_harness_record(data: object) -> WebsiteSpecialistHarnessRecord:
    return cast(
        WebsiteSpecialistHarnessRecord,
        _load("website-specialist-harness-record.schema.json", data, "WebsiteSpecialistHarnessRecord"),
    )
