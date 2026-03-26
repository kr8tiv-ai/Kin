from __future__ import annotations

from typing import NotRequired, TypedDict

from .contracts import (
    RoutingProvenanceEvent,
    RuntimeArtifactFeedbackSelection,
    RuntimeArtifactPromotionAnalysis,
    RuntimeArtifactProvenance,
    RuntimeStepArtifacts,
    TruthSurface,
)
from .disclosure import DisclosureResult, format_provenance_disclosure
from .feedback_selection import select_relevant_feedback
from .precedence import ResolutionResult, resolve_precedence
from .promotion import PromotionEvaluationResult, evaluate_feedback_promotion
from .promotion_audit import format_promotion_audit


class RuntimeStepResult(TypedDict):
    precedence: ResolutionResult
    artifacts: RuntimeStepArtifacts
    disclosure: NotRequired[DisclosureResult]
    promotion: NotRequired[PromotionEvaluationResult]


def _default_provenance() -> RuntimeArtifactProvenance:
    return {
        "route_mode": "local",
        "route_reason": "local path satisfied the request",
        "fallback_used": False,
        "fallback_refused": False,
        "disclosure_level": "brief",
        "disclosure_text": "This step ran on the local path.",
        "mention_external_help": False,
    }


def _build_provenance_artifact(
    route_event: RoutingProvenanceEvent | None,
    disclosure: DisclosureResult | None,
) -> RuntimeArtifactProvenance:
    if route_event is None:
        return _default_provenance()

    disclosure_result = disclosure or format_provenance_disclosure(route_event)
    return {
        "route_mode": route_event["mode"],
        "route_reason": route_event["route_reason"],
        "fallback_used": route_event["fallback_used"],
        "fallback_refused": route_event["fallback_refused"],
        "disclosure_level": disclosure_result["level"],
        "disclosure_text": disclosure_result["text"],
        "mention_external_help": disclosure_result["mention_external_help"],
    }


def _build_feedback_selection_artifact(
    feedback: dict[str, object] | None,
) -> RuntimeArtifactFeedbackSelection:
    if feedback is None:
        return {
            "selected": False,
            "selected_feedback_id": None,
            "scope_requested": None,
            "target": None,
            "selection_reason": "No relevant explicit feedback matched the key for this step.",
        }

    return {
        "selected": True,
        "selected_feedback_id": str(feedback["feedback_id"]),
        "scope_requested": feedback.get("scope_requested"),
        "target": feedback.get("target"),
        "selection_reason": "Selected the most relevant explicit feedback for this step using scope and recency ordering.",
    }


def _build_promotion_analysis_artifact(
    promotion: PromotionEvaluationResult | None,
) -> RuntimeArtifactPromotionAnalysis:
    if promotion is None:
        reason = "No relevant feedback was available to evaluate for promotion."
        return {
            "evaluated": False,
            "status": "not-evaluated",
            "decision": None,
            "reason": reason,
            "provenance_warning": False,
            "blocking_signal_type": None,
            "supporting_signal_used": False,
            "audit_summary": f"decision=not-evaluated; signal=no_behavioral_signal; provenance=provenance_clear; reason={reason}",
        }

    return {
        "evaluated": True,
        "status": "evaluated",
        "decision": promotion["decision"],
        "reason": promotion["reason"],
        "provenance_warning": promotion["provenance_warning"],
        "blocking_signal_type": promotion["blocking_signal_type"],
        "supporting_signal_used": promotion["supporting_signal_used"],
        "audit_summary": format_promotion_audit(promotion),
    }


def resolve_runtime_step(
    key: str,
    truth_surface: TruthSurface,
    *,
    route_event: RoutingProvenanceEvent | None = None,
    default: object | None = None,
    evaluate_promotion: bool = False,
    project_repeat_count: int = 0,
    cross_project_repeat_count: int = 0,
    explicit_durable: bool = False,
    safe_to_learn: bool = True,
) -> RuntimeStepResult:
    result: RuntimeStepResult = {
        "precedence": resolve_precedence(key, truth_surface, default),
        "artifacts": {
            "provenance": _default_provenance(),
            "feedback_selection": _build_feedback_selection_artifact(None),
            "promotion_analysis": _build_promotion_analysis_artifact(None),
        },
    }

    disclosure: DisclosureResult | None = None
    if route_event is not None:
        disclosure = format_provenance_disclosure(route_event)
        result["disclosure"] = disclosure

    feedback = select_relevant_feedback(key, truth_surface) if evaluate_promotion else None
    promotion: PromotionEvaluationResult | None = None
    if evaluate_promotion and feedback is not None:
        promotion = evaluate_feedback_promotion(
            feedback,
            project_repeat_count=project_repeat_count,
            cross_project_repeat_count=cross_project_repeat_count,
            explicit_durable=explicit_durable,
            safe_to_learn=safe_to_learn,
            behavior_signals=truth_surface.get("recent_behavior_signals", []),
        )
        result["promotion"] = promotion

    result["artifacts"] = {
        "provenance": _build_provenance_artifact(route_event, disclosure),
        "feedback_selection": _build_feedback_selection_artifact(feedback),
        "promotion_analysis": _build_promotion_analysis_artifact(promotion),
    }

    return result
