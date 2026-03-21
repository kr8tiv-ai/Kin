from __future__ import annotations

from typing import Any, cast

from .contracts import (
    BehaviorSignalEntry,
    FeedbackLedgerEntry,
    PreferenceRecord,
    PromotionDecisionRecord,
    RoutingProvenanceEvent,
    TruthSurface,
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
