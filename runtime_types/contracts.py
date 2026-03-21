from __future__ import annotations

from typing import Literal, TypedDict, TypeAlias

ScopeRequested: TypeAlias = Literal["turn", "project", "owner", "unspecified"]
FeedbackTarget: TypeAlias = Literal["output", "tone", "design", "workflow", "routing", "teaching", "other"]
FeedbackPolarity: TypeAlias = Literal["positive", "negative", "correction"]
FeedbackSource: TypeAlias = Literal["user", "reviewer", "system"]
PromotionStatus: TypeAlias = Literal["local-only", "promoted", "rejected", "expired"]
ProvenanceLevel: TypeAlias = Literal["local-proven", "hybrid-proven", "external-only", "not-yet-proven"]
PreferenceScope: TypeAlias = Literal["project", "owner"]
ConflictStatus: TypeAlias = Literal["active", "superseded", "contradicted", "paused"]
RouteMode: TypeAlias = Literal["local", "hybrid", "external"]
DestinationScope: TypeAlias = Literal["project", "owner"]
BehaviorSignalType: TypeAlias = Literal[
    "suggestion_not_adopted",
    "user_repair",
    "repeated_manual_fix",
    "proposal_reverted",
    "accepted_without_edit",
]
DisclosureLevel: TypeAlias = Literal["none", "brief", "explicit"]
PromotionDecision: TypeAlias = Literal["local-only", "project", "owner", "reject"]
PromotionAnalysisStatus: TypeAlias = Literal["evaluated", "not-evaluated"]
RuntimeReadinessStatus: TypeAlias = Literal["ready", "not-ready"]
GenesisTier: TypeAlias = Literal["Egg", "Hatchling", "Elder"]
GenesisBloodline: TypeAlias = Literal["Mischief", "Vortex", "Forge", "Aether", "Catalyst", "Cipher"]
GenesisClaimFailureReason: TypeAlias = Literal[
    "not_genesis_collection",
    "unresolvable_metadata",
]
RebindingStatus: TypeAlias = Literal["pending_onboarding", "blocked"]
OwnerAccessStatus: TypeAlias = Literal["revoked"]
PrivateStateStatus: TypeAlias = Literal["detached"]
ManualCheckpoint: TypeAlias = Literal["await_rebinding_fee", "await_new_owner_onboarding"]
ConciergeClaimStatus: TypeAlias = Literal["claimed", "blocked", "activation_ready"]
ConciergeSetupStage: TypeAlias = Literal[
    "awaiting_device_setup",
    "awaiting_owner_confirmation",
    "support_followup_required",
    "setup_complete",
]
ConciergeBlockingReason: TypeAlias = Literal[
    "identity_verification_pending",
    "device_setup_incomplete",
    "owner_confirmation_pending",
    "support_followup_required",
]
ConciergeManualCheckpoint: TypeAlias = Literal[
    "await_support_followup",
    "await_identity_review",
    "await_device_setup_confirmation",
    "await_owner_confirmation",
]
ConciergeGuidanceStatus: TypeAlias = Literal["needs_user_action", "blocked", "ready"]
TelegramVoiceTurnStatus: TypeAlias = Literal["blocked", "activation_ready"]
TelegramActivationGateStatus: TypeAlias = Literal["blocked", "ready"]
TelegramTranscriptStatus: TypeAlias = Literal["available", "redacted", "not_available"]
TelegramTranscriptConfidence: TypeAlias = Literal["high", "medium", "low"]
TelegramTranscriptRedactionLevel: TypeAlias = Literal["support_safe_summary_only"]
TelegramReplyStatus: TypeAlias = Literal["not_sent", "voiced"]
TelegramReplyDeliveryChannel: TypeAlias = Literal["telegram_voice_note"]
TelegramVoiceStyle: TypeAlias = Literal["concierge_warm", "concierge_brisk"]
TelegramContinuityStatus: TypeAlias = Literal["new_session", "same_session", "carryover"]
TelegramMemoryScope: TypeAlias = Literal["none", "session_only", "support_safe_carryover"]
CipherContinuityStatus: TypeAlias = Literal["activation_ready", "carryover", "drift_guard"]
CipherContinuitySource: TypeAlias = Literal["truth_surface_only", "telegram_voice_turn", "cross_surface_carryover"]
CipherIdentitySafetyStatus: TypeAlias = Literal["identity_safe", "guarded", "drifting_generic"]
CipherPolicyGuardReason: TypeAlias = Literal[
    "none",
    "policy_style_restriction",
    "identity_marker_conflict",
    "voice_seam_guard",
    "drift_detected",
]
CipherPersonaMarker: TypeAlias = Literal[
    "cipher_bloodline",
    "mission_control_governed",
    "support_safe",
    "activation_ready",
    "owner_guidance",
    "calm_precision",
]
CipherSpokenMannerMarker: TypeAlias = Literal[
    "warmth",
    "briskness",
    "measured_pacing",
    "confident_guidance",
    "guarded_boundaries",
    "carryover_callback",
]
WebsiteRequestSource: TypeAlias = Literal["telegram_voice_turn", "operator_restore", "system_handoff"]
WebsiteRequestStatus: TypeAlias = Literal["activation_ready", "blocked", "needs_route_decision"]
WebsiteRequestedCapability: TypeAlias = Literal[
    "website_update",
    "landing_page",
    "diagnostic_review",
    "content_refresh",
]
WebsiteSpecialistStatus: TypeAlias = Literal["pending", "in_progress", "completed", "escalated", "refused_fallback"]
WebsiteTaskPhase: TypeAlias = Literal["intake", "routing", "handoff", "fulfilled", "blocked"]
WebsiteActivationHandoffStatus: TypeAlias = Literal["activation_ready", "blocked", "handoff_complete"]


class FeedbackLedgerEntry(TypedDict):
    feedback_id: str
    feedback_text: str
    timestamp: str
    scope_requested: ScopeRequested
    target: FeedbackTarget
    polarity: FeedbackPolarity
    source: FeedbackSource
    applied_to: str
    promotion_status: PromotionStatus
    provenance: ProvenanceLevel


class BehaviorSignalEntry(TypedDict):
    signal_id: str
    timestamp: str
    target: FeedbackTarget
    signal_type: BehaviorSignalType
    strength: float
    applied_to: str
    source_route: RouteMode
    notes: str


class PreferenceRecord(TypedDict):
    preference_id: str
    rule: str
    scope: PreferenceScope
    confidence: float
    evidence_count: int
    last_confirmed_at: str
    conflict_status: ConflictStatus
    origin_feedback_ids: list[str]
    provenance_level: Literal["local-proven", "hybrid-proven", "external-only"]


class RoutingProvenanceEvent(TypedDict):
    event_id: str
    provider: str
    model: str
    mode: RouteMode
    route_reason: str
    fallback_used: bool
    fallback_refused: bool
    learned_effect_allowed: bool


class PromotionDecisionRecord(TypedDict):
    decision_id: str
    promoted_rule: str
    source_feedback_ids: list[str]
    destination_scope: DestinationScope
    evidence_summary: str
    override_conditions: str
    decision_timestamp: str


class TruthSurface(TypedDict):
    active_spec: dict[str, object]
    active_policy: dict[str, object]
    current_task: dict[str, object]
    persona_anchor: dict[str, object]
    routing_policy: dict[str, object]
    fallback_policy: dict[str, object]
    critique_policy: dict[str, object]
    revision_budget: dict[str, object]
    active_project_preferences: list[PreferenceRecord]
    active_owner_preferences: list[PreferenceRecord]
    recent_explicit_feedback: list[FeedbackLedgerEntry]
    recent_behavior_signals: list[BehaviorSignalEntry]
    disclosure_state: dict[str, object]


class RuntimeArtifactProvenance(TypedDict):
    route_mode: RouteMode
    route_reason: str
    fallback_used: bool
    fallback_refused: bool
    disclosure_level: DisclosureLevel
    disclosure_text: str
    mention_external_help: bool


class RuntimeArtifactFeedbackSelection(TypedDict):
    selected: bool
    selected_feedback_id: str | None
    scope_requested: ScopeRequested | None
    target: FeedbackTarget | None
    selection_reason: str


class RuntimeArtifactPromotionAnalysis(TypedDict):
    evaluated: bool
    status: PromotionAnalysisStatus
    decision: PromotionDecision | None
    reason: str
    provenance_warning: bool
    blocking_signal_type: BehaviorSignalType | None
    supporting_signal_used: bool
    audit_summary: str


class RuntimeStepArtifacts(TypedDict):
    provenance: RuntimeArtifactProvenance
    feedback_selection: RuntimeArtifactFeedbackSelection
    promotion_analysis: RuntimeArtifactPromotionAnalysis


class RuntimeReadinessChecks(TypedDict):
    artifact_present: bool
    disclosure_matches_provenance: bool
    promotion_matches_artifact: bool


class RuntimeReadinessSummary(TypedDict):
    status: RuntimeReadinessStatus
    checks: RuntimeReadinessChecks
    failed_checks: list[str]
    mismatches: list[str]


class GenesisOwnershipRecord(TypedDict):
    asset_id: str
    collection: str
    owner_wallet: str
    bloodline: GenesisBloodline


class GenesisEntitlementRecord(TypedDict):
    tier: GenesisTier
    included_months: int
    lifetime_discount_percent: int
    solana_rewards_percent: int


class GenesisClaimResult(TypedDict):
    eligible: bool
    failure_reason: GenesisClaimFailureReason | None
    ownership: GenesisOwnershipRecord | None
    entitlement: GenesisEntitlementRecord | None


class RebindingLifecycleRecord(TypedDict):
    asset_id: str
    previous_owner_wallet: str
    current_owner_wallet: str
    transferable_state_ref: str
    private_state_ref: str
    private_state_status: PrivateStateStatus
    old_owner_access_status: OwnerAccessStatus
    status: RebindingStatus
    blocking_reason: str | None
    manual_checkpoint: ManualCheckpoint


class ConciergeSetupGuidanceRecord(TypedDict):
    guidance_id: str
    guidance_status: ConciergeGuidanceStatus
    plain_language_summary: str
    next_user_step: str
    blocking_reason: ConciergeBlockingReason | None
    manual_checkpoint: ConciergeManualCheckpoint | None
    support_safe_notes: str


class ConciergeClaimLifecycleRecord(TypedDict):
    claim_id: str
    claimant_label: str
    claim_status: ConciergeClaimStatus
    setup_stage: ConciergeSetupStage
    blocking_reason: ConciergeBlockingReason | None
    manual_checkpoint: ConciergeManualCheckpoint | None
    activation_ready: bool
    next_user_step: str
    setup_guidance: ConciergeSetupGuidanceRecord


class TelegramInboundVoiceNoteRecord(TypedDict):
    telegram_file_id: str
    telegram_file_unique_id: str
    audio_duration_seconds: int
    mime_type: str
    message_timestamp: str
    source: TelegramReplyDeliveryChannel


class TelegramVoiceTranscriptRecord(TypedDict):
    transcript_status: TelegramTranscriptStatus
    transcript_language: str
    transcript_summary: str
    intent_summary: str
    confidence_label: TelegramTranscriptConfidence
    redaction_level: TelegramTranscriptRedactionLevel


class TelegramVoiceReplyRecord(TypedDict):
    reply_status: TelegramReplyStatus
    delivery_channel: TelegramReplyDeliveryChannel
    voice_style: TelegramVoiceStyle
    reply_summary: str
    audio_duration_seconds: int
    contains_action_prompt: bool


class TelegramVoiceContinuityRecord(TypedDict):
    continuity_status: TelegramContinuityStatus
    session_reference: str
    turns_in_session: int
    carryover_summary: str
    prior_turn_reference: str | None
    memory_scope: TelegramMemoryScope


class TelegramVoiceTurnRecord(TypedDict):
    voice_turn_id: str
    platform: Literal["telegram"]
    chat_id: str
    user_id: str
    voice_message_id: str
    voice_turn_status: TelegramVoiceTurnStatus
    activation_gate_status: TelegramActivationGateStatus
    blocked_reason: ConciergeBlockingReason | None
    support_safe_status_summary: str
    inbound_voice_note: TelegramInboundVoiceNoteRecord
    transcript: TelegramVoiceTranscriptRecord
    reply: TelegramVoiceReplyRecord
    continuity: TelegramVoiceContinuityRecord


class CipherPersonaAnchorRecord(TypedDict):
    anchor_id: str
    archetype: Literal["cipher"]
    truth_source: Literal["truth_surface.persona_anchor"]
    mission_control_mode: Literal["governed"]
    default_tone: Literal["calm_precision", "warm_guidance", "brisk_guidance"]
    persona_markers: list[CipherPersonaMarker]
    policy_focus: list[str]
    continuity_notes: str


class CipherVoiceExpressionRecord(TypedDict):
    expression_id: str
    source: Literal["telegram_voice_reply", "cross_surface_inference"]
    voice_style: TelegramVoiceStyle
    spoken_manner_markers: list[CipherSpokenMannerMarker]
    pacing_label: Literal["measured", "steady", "brisk"]
    energy_label: Literal["calm", "focused", "elevated"]
    action_prompt_present: bool
    support_safe_summary: str


class CipherContinuityRecord(TypedDict):
    continuity_id: str
    continuity_status: CipherContinuityStatus
    continuity_source: CipherContinuitySource
    identity_safety_status: CipherIdentitySafetyStatus
    drift_guard_triggered: bool
    active_persona_anchor: CipherPersonaAnchorRecord
    active_voice_expression: CipherVoiceExpressionRecord
    continuity_marker_summary: str
    carryover_source_ref: str | None
    guardrail_reasons: list[CipherPolicyGuardReason]
    policy_summary: str


class WebsiteSpecialistRequestRecord(TypedDict):
    request_id: str
    request_source: WebsiteRequestSource
    request_status: WebsiteRequestStatus
    support_safe_request_summary: str
    desired_outcome_summary: str
    activation_ready: bool
    activation_ref: str
    voice_turn_ref: str | None
    continuity_ref: str | None
    requested_capability: WebsiteRequestedCapability


class WebsiteSpecialistExecutionRecord(TypedDict):
    execution_id: str
    specialist_status: WebsiteSpecialistStatus
    task_phase: WebsiteTaskPhase
    route: RoutingProvenanceEvent
    disclosure_level: DisclosureLevel
    disclosure_text: str
    support_safe_status_summary: str
    continuity_carryover_refs: list[str]
    persona_markers: list[CipherPersonaMarker]
    spoken_manner_markers: list[CipherSpokenMannerMarker]
    fallback_refused: bool


class WebsiteSpecialistHarnessRecord(TypedDict):
    harness_id: str
    request: WebsiteSpecialistRequestRecord
    execution: WebsiteSpecialistExecutionRecord
    support_safe_outcome_summary: str
    activation_handoff_status: WebsiteActivationHandoffStatus
