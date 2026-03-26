from __future__ import annotations

from typing import Literal, TypedDict

from .contracts import TruthSurface
from .feedback_selection import select_relevant_feedback
from .rules import rule_matches

ResolutionSource = Literal["active_spec", "explicit_feedback", "project_preference", "owner_preference", "default"]


class ResolutionResult(TypedDict):
    key: str
    winner_source: ResolutionSource
    winner_value: object | None
    overridden_sources: list[ResolutionSource]
    reason: str


ACTIVE_CONFLICT_STATUSES = {"active"}


def _get_spec_value(key: str, truth_surface: TruthSurface) -> object | None:
    resolved_rules = truth_surface.get("active_spec", {}).get("resolved_rules")
    if isinstance(resolved_rules, dict):
        return resolved_rules.get(key)
    return None


def _get_feedback_value(key: str, truth_surface: TruthSurface) -> object | None:
    entry = select_relevant_feedback(key, truth_surface)
    if entry is None:
        return None
    return entry.get("feedback_text")


def _get_preference_value(key: str, preferences: list[dict[str, object]]) -> object | None:
    for pref in preferences:
        if pref.get("conflict_status") not in ACTIVE_CONFLICT_STATUSES:
            continue
        rule = pref.get("rule")
        if isinstance(rule, str) and rule_matches(key, rule):
            return rule
    return None


def resolve_precedence(key: str, truth_surface: TruthSurface, default: object | None = None) -> ResolutionResult:
    spec_value = _get_spec_value(key, truth_surface)
    if spec_value is not None:
        return {
            "key": key,
            "winner_source": "active_spec",
            "winner_value": spec_value,
            "overridden_sources": ["explicit_feedback", "project_preference", "owner_preference", "default"],
            "reason": "Active spec resolved_rules entry wins by precedence.",
        }

    feedback_value = _get_feedback_value(key, truth_surface)
    if feedback_value is not None:
        return {
            "key": key,
            "winner_source": "explicit_feedback",
            "winner_value": feedback_value,
            "overridden_sources": ["project_preference", "owner_preference", "default"],
            "reason": "Relevant explicit feedback wins when active spec is silent.",
        }

    project_value = _get_preference_value(key, truth_surface.get("active_project_preferences", []))
    if project_value is not None:
        return {
            "key": key,
            "winner_source": "project_preference",
            "winner_value": project_value,
            "overridden_sources": ["owner_preference", "default"],
            "reason": "Active project preference wins when neither active spec nor explicit feedback resolves the key.",
        }

    owner_value = _get_preference_value(key, truth_surface.get("active_owner_preferences", []))
    if owner_value is not None:
        return {
            "key": key,
            "winner_source": "owner_preference",
            "winner_value": owner_value,
            "overridden_sources": ["default"],
            "reason": "Active owner preference wins when higher-precedence layers are silent.",
        }

    return {
        "key": key,
        "winner_source": "default",
        "winner_value": default,
        "overridden_sources": [],
        "reason": "No matching higher-precedence source resolved the key.",
    }
