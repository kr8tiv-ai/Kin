from __future__ import annotations

from .promotion import PromotionEvaluationResult


def format_promotion_audit(result: PromotionEvaluationResult) -> str:
    signal_label = result["blocking_signal_type"] or (
        "accepted_without_edit" if result["supporting_signal_used"] else "no_behavioral_signal"
    )
    provenance_label = "provenance_warning" if result["provenance_warning"] else "provenance_clear"
    return f"decision={result['decision']}; signal={signal_label}; provenance={provenance_label}; reason={result['reason']}"
