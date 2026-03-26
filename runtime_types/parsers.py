from __future__ import annotations

from typing import Any, cast

from .contracts import (
    AdaptationDecisionSummary,
    BackupState,
    BehaviorSignalEntry,
    CipherContinuityRecord,
    CipherPersonaAnchorRecord,
    CipherVoiceExpressionRecord,
    ComputerSetupGuidance,
    ConciergeClaimLifecycleRecord,
    ConciergeSetupGuidanceRecord,
    DesignResearchSummary,
    DesignTeachingResearchRecord,
    DesignTeachingSummary,
    FeedbackLedgerEntry,
    IntegratedHarnessTruthRecord,
    InterventionState,
    ManagedServicePostureRecord,
    PreferenceRecord,
    PromotionDecisionRecord,
    RoutingProvenanceEvent,
    RuntimeStepArtifacts,
    SpecPrecedenceSummary,
    SupportReadiness,
    TasteAdaptationRecord,
    TasteSignalSummary,
    TailscaleAccessStatus,
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


def load_design_teaching_summary(data: object) -> DesignTeachingSummary:
    return cast(
        DesignTeachingSummary,
        _load("design-teaching-summary.schema.json", data, "DesignTeachingSummary"),
    )


def load_design_research_summary(data: object) -> DesignResearchSummary:
    return cast(
        DesignResearchSummary,
        _load("design-research-summary.schema.json", data, "DesignResearchSummary"),
    )


def load_design_teaching_research_record(data: object) -> DesignTeachingResearchRecord:
    return cast(
        DesignTeachingResearchRecord,
        _load("design-teaching-research-record.schema.json", data, "DesignTeachingResearchRecord"),
    )


def load_taste_signal_summary(data: object) -> TasteSignalSummary:
    return cast(
        TasteSignalSummary,
        _load("taste-signal-summary.schema.json", data, "TasteSignalSummary"),
    )


def load_adaptation_decision_summary(data: object) -> AdaptationDecisionSummary:
    return cast(
        AdaptationDecisionSummary,
        _load("adaptation-decision-summary.schema.json", data, "AdaptationDecisionSummary"),
    )


def load_spec_precedence_summary(data: object) -> SpecPrecedenceSummary:
    return cast(
        SpecPrecedenceSummary,
        _load("spec-precedence-summary.schema.json", data, "SpecPrecedenceSummary"),
    )


def load_taste_adaptation_record(data: object) -> TasteAdaptationRecord:
    return cast(
        TasteAdaptationRecord,
        _load("taste-adaptation-record.schema.json", data, "TasteAdaptationRecord"),
    )


def load_tailscale_access_status(data: object) -> TailscaleAccessStatus:
    return cast(
        TailscaleAccessStatus,
        _load("tailscale-access-status.schema.json", data, "TailscaleAccessStatus"),
    )


def load_computer_setup_guidance(data: object) -> ComputerSetupGuidance:
    return cast(
        ComputerSetupGuidance,
        _load("computer-setup-guidance.schema.json", data, "ComputerSetupGuidance"),
    )


def load_backup_state(data: object) -> BackupState:
    return cast(
        BackupState,
        _load("backup-state.schema.json", data, "BackupState"),
    )


def load_intervention_state(data: object) -> InterventionState:
    return cast(
        InterventionState,
        _load("intervention-state.schema.json", data, "InterventionState"),
    )


def load_support_readiness(data: object) -> SupportReadiness:
    return cast(
        SupportReadiness,
        _load("support-readiness.schema.json", data, "SupportReadiness"),
    )


def load_managed_service_posture_record(data: object) -> ManagedServicePostureRecord:
    return cast(
        ManagedServicePostureRecord,
        _load("managed-service-posture-record.schema.json", data, "ManagedServicePostureRecord"),
    )


def load_integrated_harness_truth_record(data: object) -> IntegratedHarnessTruthRecord:
    return cast(
        IntegratedHarnessTruthRecord,
        _load("integrated-harness-truth-record.schema.json", data, "IntegratedHarnessTruthRecord"),
    )
