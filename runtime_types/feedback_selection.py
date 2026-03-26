from __future__ import annotations

from datetime import datetime

from .contracts import FeedbackLedgerEntry, TruthSurface
from .rules import rule_matches

INACTIVE_PROMOTION_STATUSES = {"expired", "rejected"}
SCOPE_PRIORITY = {
    "turn": 0,
    "project": 1,
    "owner": 2,
    "unspecified": 3,
}


def _feedback_matches_key(key: str, entry: FeedbackLedgerEntry) -> bool:
    target = entry.get("target")
    feedback_text = entry.get("feedback_text")
    if isinstance(target, str) and rule_matches(key, target):
        return True
    if isinstance(feedback_text, str) and rule_matches(key, feedback_text):
        return True
    return False


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def select_relevant_feedback(key: str, truth_surface: TruthSurface) -> FeedbackLedgerEntry | None:
    best_entry: FeedbackLedgerEntry | None = None
    best_key: tuple[int, float, int] | None = None

    for index, entry in enumerate(truth_surface.get("recent_explicit_feedback", [])):
        if entry.get("promotion_status") in INACTIVE_PROMOTION_STATUSES:
            continue
        if not _feedback_matches_key(key, entry):
            continue

        candidate_key = (
            -SCOPE_PRIORITY.get(entry.get("scope_requested", "unspecified"), 99),
            _parse_timestamp(entry["timestamp"]).timestamp(),
            index,
        )
        if best_key is None or candidate_key > best_key:
            best_key = candidate_key
            best_entry = entry

    return best_entry
