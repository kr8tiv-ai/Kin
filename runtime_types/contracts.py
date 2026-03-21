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
