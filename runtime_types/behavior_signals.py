from __future__ import annotations

from datetime import datetime
from typing import TypedDict

from .contracts import BehaviorSignalEntry, FeedbackLedgerEntry

BLOCKING_SIGNAL_TYPES = {"suggestion_not_adopted", "user_repair", "repeated_manual_fix", "proposal_reverted"}
SUPPORTING_SIGNAL_TYPES = {"accepted_without_edit"}


class BehaviorSignalSummary(TypedDict):
    blocking_signal: BehaviorSignalEntry | None
    supporting_acceptance: bool


def _parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _signal_matches_feedback(feedback: FeedbackLedgerEntry, signal: BehaviorSignalEntry) -> bool:
    if signal.get("target") != feedback.get("target"):
        return False
    if signal.get("applied_to") != feedback.get("applied_to"):
        return False
    if _parse_timestamp(signal["timestamp"]) < _parse_timestamp(feedback["timestamp"]):
        return False
    return True


def summarize_behavior_signals(
    feedback: FeedbackLedgerEntry,
    behavior_signals: list[BehaviorSignalEntry],
) -> BehaviorSignalSummary:
    blocking_signal: BehaviorSignalEntry | None = None
    supporting_acceptance = False

    for signal in reversed(behavior_signals):
        if not _signal_matches_feedback(feedback, signal):
            continue

        signal_type = signal.get("signal_type")
        strength = signal.get("strength", 0.0)

        if blocking_signal is None and signal_type in BLOCKING_SIGNAL_TYPES and strength >= 0.7:
            blocking_signal = signal

        if not supporting_acceptance and signal_type in SUPPORTING_SIGNAL_TYPES and strength >= 0.8:
            supporting_acceptance = True

        if blocking_signal is not None and supporting_acceptance:
            break

    return {
        "blocking_signal": blocking_signal,
        "supporting_acceptance": supporting_acceptance,
    }
