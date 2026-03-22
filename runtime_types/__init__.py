from .contracts import (
    AdaptationDecisionSummary,
    BackupState,
    BackupStateStatus,
    BehaviorSignalEntry,
    BehaviorSignalType,
    CipherContinuityRecord,
    CipherContinuitySource,
    CipherContinuityStatus,
    CipherIdentitySafetyStatus,
    CipherPersonaAnchorRecord,
    CipherPersonaMarker,
    CipherPolicyGuardReason,
    CipherSpokenMannerMarker,
    CipherVoiceExpressionRecord,
    ComputerSetupGuidance,
    ComputerSetupGuidanceStatus,
    ConciergeBlockingReason,
    ConciergeClaimLifecycleRecord,
    ConciergeClaimStatus,
    ConciergeGuidanceStatus,
    ConciergeManualCheckpoint,
    ConciergeSetupGuidanceRecord,
    ConciergeSetupStage,
    ConflictStatus,
    DesignResearchSummary,
    DesignTeachingResearchRecord,
    DesignTeachingSummary,
    DestinationScope,
    AdaptationDecisionSummary,
    DisclosureLevel,
    FeedbackLedgerEntry,
    FeedbackPolarity,
    FeedbackSource,
    FeedbackTarget,
    GenesisBloodline,
    GenesisClaimFailureReason,
    GenesisClaimResult,
    GenesisEntitlementRecord,
    GenesisOwnershipRecord,
    GenesisTier,
    InterventionState,
    InterventionStateStatus,
    ManagedServiceOverallPosture,
    ManagedServicePostureRecord,
    ManualCheckpoint,
    OwnerAccessStatus,
    PreferenceRecord,
    PreferenceScope,
    PrivateStateStatus,
    PromotionAnalysisStatus,
    PromotionDecision,
    PromotionDecisionRecord,
    PromotionStatus,
    ProvenanceLevel,
    RebindingLifecycleRecord,
    RebindingStatus,
    RouteMode,
    RoutingProvenanceEvent,
    RuntimeArtifactFeedbackSelection,
    RuntimeArtifactPromotionAnalysis,
    RuntimeArtifactProvenance,
    RuntimeReadinessChecks,
    RuntimeReadinessStatus,
    RuntimeReadinessSummary,
    RuntimeStepArtifacts,
    S07SchemaFamily,
    ScopeRequested,
    SpecPrecedenceSummary,
    SupportReadiness,
    SupportReadinessStatus,
    TasteAdaptationRecord,
    TasteSignalSummary,
    TailscaleAccessStatus,
    TailscaleAccessStatusType,
    TelegramActivationGateStatus,
    TelegramContinuityStatus,
    TelegramInboundVoiceNoteRecord,
    TelegramMemoryScope,
    TelegramReplyDeliveryChannel,
    TelegramReplyStatus,
    TelegramTranscriptConfidence,
    TelegramTranscriptRedactionLevel,
    TelegramTranscriptStatus,
    TelegramVoiceContinuityRecord,
    TelegramVoiceReplyRecord,
    TelegramVoiceStyle,
    TelegramVoiceTranscriptRecord,
    TelegramVoiceTurnRecord,
    TelegramVoiceTurnStatus,
    TruthSurface,
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
from .disclosure import DisclosureResult
from .parsers import (
    load_cipher_continuity_record,
    load_cipher_persona_anchor,
    load_cipher_voice_expression,
    load_concierge_claim_lifecycle,
    load_concierge_setup_guidance,
    load_design_research_summary,
    load_design_teaching_research_record,
    load_design_teaching_summary,
    load_runtime_step_artifacts,
    load_routing_provenance_event,
    load_spec_precedence_summary,
    load_taste_adaptation_record,
    load_taste_signal_summary,
    load_telegram_voice_continuity,
    load_telegram_voice_reply,
    load_telegram_voice_transcript,
    load_telegram_voice_turn,
    load_website_specialist_execution,
    load_website_specialist_harness_record,
    load_website_specialist_request,
    load_tailscale_access_status,
    load_computer_setup_guidance,
    load_backup_state,
    load_intervention_state,
    load_support_readiness,
    load_managed_service_posture_record,
)

__all__ = [
    "BehaviorSignalEntry",
    "BehaviorSignalType",
    "CipherContinuityRecord",
    "CipherContinuitySource",
    "CipherContinuityStatus",
    "CipherIdentitySafetyStatus",
    "CipherPersonaAnchorRecord",
    "CipherPersonaMarker",
    "CipherPolicyGuardReason",
    "CipherSpokenMannerMarker",
    "CipherVoiceExpressionRecord",
    "ConciergeBlockingReason",
    "ConciergeClaimLifecycleRecord",
    "ConciergeClaimStatus",
    "ConciergeGuidanceStatus",
    "ConciergeManualCheckpoint",
    "ConciergeSetupGuidanceRecord",
    "ConciergeSetupStage",
    "ConflictStatus",
    "DesignResearchSummary",
    "DesignTeachingResearchRecord",
    "DesignTeachingSummary",
    "DestinationScope",
    "AdaptationDecisionSummary",
    "DisclosureLevel",
    "DisclosureResult",
    "FeedbackLedgerEntry",
    "FeedbackPolarity",
    "FeedbackSource",
    "FeedbackTarget",
    "GenesisBloodline",
    "SpecPrecedenceSummary",
    "TasteAdaptationRecord",
    "TasteSignalSummary",
    "GenesisClaimFailureReason",
    "GenesisClaimResult",
    "GenesisEntitlementRecord",
    "GenesisOwnershipRecord",
    "GenesisTier",
    "ManualCheckpoint",
    "OwnerAccessStatus",
    "PreferenceRecord",
    "PreferenceScope",
    "PrivateStateStatus",
    "PromotionAnalysisStatus",
    "PromotionDecision",
    "PromotionDecisionRecord",
    "PromotionStatus",
    "ProvenanceLevel",
    "RebindingLifecycleRecord",
    "RebindingStatus",
    "RouteMode",
    "RoutingProvenanceEvent",
    "RuntimeArtifactFeedbackSelection",
    "RuntimeArtifactPromotionAnalysis",
    "RuntimeArtifactProvenance",
    "RuntimeReadinessChecks",
    "RuntimeReadinessStatus",
    "RuntimeReadinessSummary",
    "RuntimeStepArtifacts",
    "ScopeRequested",
    "TelegramActivationGateStatus",
    "TelegramContinuityStatus",
    "TelegramInboundVoiceNoteRecord",
    "TelegramMemoryScope",
    "TelegramReplyDeliveryChannel",
    "TelegramReplyStatus",
    "TelegramTranscriptConfidence",
    "TelegramTranscriptRedactionLevel",
    "TelegramTranscriptStatus",
    "TelegramVoiceContinuityRecord",
    "TelegramVoiceReplyRecord",
    "TelegramVoiceStyle",
    "TelegramVoiceTranscriptRecord",
    "TelegramVoiceTurnRecord",
    "TelegramVoiceTurnStatus",
    "TruthSurface",
    "WebsiteActivationHandoffStatus",
    "WebsiteRequestSource",
    "WebsiteRequestStatus",
    "WebsiteRequestedCapability",
    "WebsiteSpecialistExecutionRecord",
    "WebsiteSpecialistHarnessRecord",
    "WebsiteSpecialistRequestRecord",
    "WebsiteSpecialistStatus",
    "WebsiteTaskPhase",
    # S07 types
    "BackupState",
    "BackupStateStatus",
    "ComputerSetupGuidance",
    "ComputerSetupGuidanceStatus",
    "InterventionState",
    "InterventionStateStatus",
    "ManagedServiceOverallPosture",
    "ManagedServicePostureRecord",
    "S07SchemaFamily",
    "SupportReadiness",
    "SupportReadinessStatus",
    "TailscaleAccessStatus",
    "TailscaleAccessStatusType",
    # S08 types
    "IntegratedHarnessTruthRecord",
    "LocalFirstHonesty",
    "S08SchemaFamily",
    # S07 loaders
    "load_tailscale_access_status",
    "load_computer_setup_guidance",
    "load_backup_state",
    "load_intervention_state",
    "load_support_readiness",
    "load_managed_service_posture_record",
    # S08 loaders
    "load_integrated_harness_truth_record",
    # Derivation helpers
    "format_design_research_disclosure",
    "format_provenance_disclosure",
    "format_promotion_audit",
    "derive_cipher_continuity",
    "derive_concierge_lifecycle",
    "derive_design_teaching_research_record",
    "derive_managed_service_posture_record",
    "derive_taste_adaptation_record",
    "derive_telegram_voice_turn",
    "derive_website_specialist_harness_record",
    "evaluate_feedback_promotion",
    "evaluate_runtime_readiness",
    "normalize_rule_key",
    "resolve_genesis_claim",
    "resolve_precedence",
    "resolve_runtime_step",
    "rule_matches",
    "select_relevant_feedback",
    "start_rebinding",
    "PromotionEvaluationResult",
    "ResolutionResult",
    "ResolutionSource",
    "RuntimeStepResult",
]


def __getattr__(name: str):
    if name in {"format_provenance_disclosure", "format_design_research_disclosure"}:
        from .disclosure import format_design_research_disclosure, format_provenance_disclosure

        mapping = {
            "format_provenance_disclosure": format_provenance_disclosure,
            "format_design_research_disclosure": format_design_research_disclosure,
        }
        return mapping[name]
    if name in {"select_relevant_feedback"}:
        from .feedback_selection import select_relevant_feedback

        return select_relevant_feedback
    if name in {"derive_cipher_continuity"}:
        from .cipher_continuity import derive_cipher_continuity

        return derive_cipher_continuity
    if name in {"derive_concierge_lifecycle"}:
        from .concierge_claims import derive_concierge_lifecycle

        return derive_concierge_lifecycle
    if name in {"resolve_genesis_claim"}:
        from .genesis_claims import resolve_genesis_claim

        return resolve_genesis_claim
    if name in {"derive_design_teaching_research_record"}:
        from .design_teaching_research import derive_design_teaching_research_record

        return derive_design_teaching_research_record
    if name in {"derive_taste_adaptation_record"}:
        from .taste_adaptation_memory_boundary import derive_taste_adaptation_record

        return derive_taste_adaptation_record
    if name in {"derive_telegram_voice_turn"}:
        from .telegram_voice_loop import derive_telegram_voice_turn

        return derive_telegram_voice_turn
    if name in {"derive_website_specialist_harness_record"}:
        from .website_specialist_harness import derive_website_specialist_harness_record

        return derive_website_specialist_harness_record
    if name in {"derive_managed_service_posture_record"}:
        from .managed_service_posture import derive_managed_service_posture_record

        return derive_managed_service_posture_record
    if name in {"derive_integrated_harness_truth"}:
        from .integrated_harness_truth import derive_integrated_harness_truth

        return derive_integrated_harness_truth
    if name in {"resolve_precedence", "ResolutionResult", "ResolutionSource"}:
        from .precedence import ResolutionResult, ResolutionSource, resolve_precedence

        mapping = {
            "resolve_precedence": resolve_precedence,
            "ResolutionResult": ResolutionResult,
            "ResolutionSource": ResolutionSource,
        }
        return mapping[name]
    if name in {"evaluate_feedback_promotion", "PromotionEvaluationResult"}:
        from .promotion import PromotionEvaluationResult, evaluate_feedback_promotion

        mapping = {
            "evaluate_feedback_promotion": evaluate_feedback_promotion,
            "PromotionEvaluationResult": PromotionEvaluationResult,
        }
        return mapping[name]
    if name in {"format_promotion_audit"}:
        from .promotion_audit import format_promotion_audit

        return format_promotion_audit
    if name in {"start_rebinding"}:
        from .rebinding import start_rebinding

        return start_rebinding
    if name in {"normalize_rule_key", "rule_matches"}:
        from .rules import normalize_rule_key, rule_matches

        mapping = {
            "normalize_rule_key": normalize_rule_key,
            "rule_matches": rule_matches,
        }
        return mapping[name]
    if name in {"evaluate_runtime_readiness"}:
        from .runtime_operations import evaluate_runtime_readiness

        return evaluate_runtime_readiness
    if name in {"resolve_runtime_step", "RuntimeStepResult"}:
        from .runtime_step import RuntimeStepResult, resolve_runtime_step

        mapping = {
            "resolve_runtime_step": resolve_runtime_step,
            "RuntimeStepResult": RuntimeStepResult,
        }
        return mapping[name]
    raise AttributeError(f"module 'runtime_types' has no attribute {name!r}")
