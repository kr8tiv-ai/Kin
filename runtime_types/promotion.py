from __future__ import annotations

from typing import Literal, TypedDict

from .behavior_signals import summarize_behavior_signals
from .contracts import BehaviorSignalEntry, BehaviorSignalType, FeedbackLedgerEntry

PromotionDecision = Literal["local-only", "project", "owner", "reject"]


class PromotionEvaluationResult(TypedDict):
    decision: PromotionDecision
    reason: str
    provenance_warning: bool
    blocking_signal_type: BehaviorSignalType | None
    supporting_signal_used: bool


def evaluate_feedback_promotion(
    feedback: FeedbackLedgerEntry,
    *,
    project_repeat_count: int = 0,
    cross_project_repeat_count: int = 0,
    explicit_durable: bool = False,
    safe_to_learn: bool = True,
    behavior_signals: list[BehaviorSignalEntry] | None = None,
) -> PromotionEvaluationResult:
    provenance_warning = feedback["provenance"] == "external-only"
    behavior_signals = behavior_signals or []
    signal_summary = summarize_behavior_signals(feedback, behavior_signals)
    blocking_signal = signal_summary["blocking_signal"]
    supporting_acceptance = signal_summary["supporting_acceptance"]

    if not safe_to_learn:
        return {
            "decision": "reject",
            "reason": "Feedback is not safe to promote under policy or privacy constraints.",
            "provenance_warning": provenance_warning,
            "blocking_signal_type": None,
            "supporting_signal_used": False,
        }

    if blocking_signal is not None:
        signal_type = blocking_signal["signal_type"]
        if signal_type == "suggestion_not_adopted":
            reason = "Feedback should not be promoted because the suggested change was not adopted in the resulting work."
        elif signal_type in {"user_repair", "repeated_manual_fix"}:
            reason = "Feedback should not be promoted because the user had to repair the resulting work after application."
        else:
            reason = "Feedback should not be promoted because the proposed change was later reverted in practice."
        return {
            "decision": "reject",
            "reason": reason,
            "provenance_warning": provenance_warning,
            "blocking_signal_type": signal_type,
            "supporting_signal_used": supporting_acceptance,
        }

    if explicit_durable or cross_project_repeat_count >= 2:
        return {
            "decision": "owner",
            "reason": "Feedback is explicit durable preference or repeated across projects.",
            "provenance_warning": provenance_warning,
            "blocking_signal_type": None,
            "supporting_signal_used": supporting_acceptance,
        }

    if project_repeat_count >= 2:
        return {
            "decision": "project",
            "reason": "Feedback repeated enough within the current project to promote project-wide.",
            "provenance_warning": provenance_warning,
            "blocking_signal_type": None,
            "supporting_signal_used": supporting_acceptance,
        }

    if project_repeat_count >= 1 and supporting_acceptance:
        return {
            "decision": "project",
            "reason": "Feedback can promote project-wide because it repeated and was accepted without edit in practice.",
            "provenance_warning": provenance_warning,
            "blocking_signal_type": None,
            "supporting_signal_used": True,
        }

    return {
        "decision": "local-only",
        "reason": "Feedback should affect the current unit but lacks evidence for broader promotion.",
        "provenance_warning": provenance_warning,
        "blocking_signal_type": None,
        "supporting_signal_used": False,
    }
