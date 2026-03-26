#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.disclosure import format_provenance_disclosure
from runtime_types.precedence import resolve_precedence
from runtime_types.promotion import evaluate_feedback_promotion
from runtime_types.promotion_audit import format_promotion_audit
from runtime_types.runtime_operations import evaluate_runtime_readiness
from runtime_types.runtime_step import resolve_runtime_step


def base_truth_surface() -> dict:
    return {
        "active_spec": {},
        "active_policy": {},
        "current_task": {},
        "persona_anchor": {},
        "routing_policy": {},
        "fallback_policy": {},
        "critique_policy": {},
        "revision_budget": {},
        "active_project_preferences": [],
        "active_owner_preferences": [],
        "recent_explicit_feedback": [],
        "recent_behavior_signals": [],
        "disclosure_state": {},
    }


def base_feedback() -> dict:
    return {
        "feedback_id": "f1",
        "feedback_text": "less glossy",
        "timestamp": "2026-03-20T00:00:00Z",
        "scope_requested": "turn",
        "target": "design",
        "polarity": "correction",
        "source": "user",
        "applied_to": "x",
        "promotion_status": "local-only",
        "provenance": "not-yet-proven",
    }


def scenario_spec_wins_over_default() -> tuple[bool, str]:
    ts = base_truth_surface()
    ts["active_spec"] = {"resolved_rules": {"routing.prefer_local": True}}
    result = resolve_precedence("routing.prefer_local", ts, False)
    return result["winner_source"] == "active_spec" and result["winner_value"] is True, str(result)


def scenario_project_promotion() -> tuple[bool, str]:
    result = evaluate_feedback_promotion(base_feedback(), project_repeat_count=2)
    return result["decision"] == "project", format_promotion_audit(result)


def scenario_owner_promotion() -> tuple[bool, str]:
    result = evaluate_feedback_promotion(base_feedback(), explicit_durable=True)
    return result["decision"] == "owner", format_promotion_audit(result)


def scenario_unsafe_feedback_reject() -> tuple[bool, str]:
    result = evaluate_feedback_promotion(base_feedback(), safe_to_learn=False)
    return result["decision"] == "reject", format_promotion_audit(result)


def scenario_acceptance_supported_project_promotion() -> tuple[bool, str]:
    result = evaluate_feedback_promotion(
        base_feedback(),
        project_repeat_count=1,
        behavior_signals=[
            {
                "signal_id": "sig-accept-1",
                "timestamp": "2026-03-20T00:05:00Z",
                "target": "design",
                "signal_type": "accepted_without_edit",
                "strength": 0.9,
                "applied_to": "x",
                "source_route": "local",
                "notes": "User accepted the generated treatment without edits.",
            }
        ],
    )
    ok = result["decision"] == "project" and result["supporting_signal_used"] is True
    return ok, format_promotion_audit(result)


def scenario_repair_blocked_reject() -> tuple[bool, str]:
    result = evaluate_feedback_promotion(
        base_feedback(),
        project_repeat_count=3,
        behavior_signals=[
            {
                "signal_id": "sig-repair-1",
                "timestamp": "2026-03-20T00:05:00Z",
                "target": "design",
                "signal_type": "user_repair",
                "strength": 0.95,
                "applied_to": "x",
                "source_route": "local",
                "notes": "User manually corrected the generated treatment.",
            }
        ],
    )
    ok = result["decision"] == "reject" and result["blocking_signal_type"] == "user_repair"
    return ok, format_promotion_audit(result)


def scenario_hybrid_disclosure() -> tuple[bool, str]:
    event = {
        "event_id": "e1",
        "provider": "p",
        "model": "m",
        "mode": "hybrid",
        "route_reason": "quality support",
        "fallback_used": True,
        "fallback_refused": False,
        "learned_effect_allowed": True,
    }
    result = format_provenance_disclosure(event)
    return result["level"] == "explicit" and result["mention_external_help"] is True, str(result)


def scenario_fallback_refused_disclosure() -> tuple[bool, str]:
    event = {
        "event_id": "e2",
        "provider": "p",
        "model": "m",
        "mode": "local",
        "route_reason": "policy lock",
        "fallback_used": False,
        "fallback_refused": True,
        "learned_effect_allowed": False,
    }
    result = format_provenance_disclosure(event)
    return result["level"] == "brief" and result["mention_external_help"] is False, str(result)


def scenario_runtime_artifact_populated_case() -> tuple[bool, str]:
    ts = base_truth_surface()
    ts["recent_explicit_feedback"] = [{**base_feedback(), "feedback_id": "f-artifact"}]
    ts["recent_behavior_signals"] = [
        {
            "signal_id": "sig-accept-1",
            "timestamp": "2026-03-20T00:05:00Z",
            "target": "design",
            "signal_type": "accepted_without_edit",
            "strength": 0.9,
            "applied_to": "x",
            "source_route": "hybrid",
            "notes": "User accepted the generated treatment without edits.",
        }
    ]
    route_event = {
        "event_id": "e-artifact",
        "provider": "p",
        "model": "m",
        "mode": "hybrid",
        "route_reason": "quality support",
        "fallback_used": True,
        "fallback_refused": False,
        "learned_effect_allowed": True,
    }
    result = resolve_runtime_step(
        "design",
        ts,
        route_event=route_event,
        default="neutral",
        evaluate_promotion=True,
        project_repeat_count=1,
    )
    artifacts = result["artifacts"]
    readiness = evaluate_runtime_readiness(result)
    ok = (
        artifacts["provenance"]["route_mode"] == "hybrid"
        and artifacts["feedback_selection"]["selected_feedback_id"] == "f-artifact"
        and artifacts["promotion_analysis"]["status"] == "evaluated"
        and artifacts["promotion_analysis"]["decision"] == "project"
        and readiness["status"] == "ready"
    )
    return ok, f"artifacts={artifacts}; readiness={readiness}"


def scenario_runtime_artifact_empty_case() -> tuple[bool, str]:
    ts = base_truth_surface()
    result = resolve_runtime_step(
        "routing.prefer_local",
        ts,
        default=True,
        evaluate_promotion=True,
    )
    artifacts = result["artifacts"]
    readiness = evaluate_runtime_readiness(result)
    ok = (
        artifacts["provenance"]["route_mode"] == "local"
        and artifacts["feedback_selection"]["selected"] is False
        and artifacts["promotion_analysis"]["status"] == "not-evaluated"
        and artifacts["promotion_analysis"]["decision"] is None
        and readiness["status"] == "ready"
    )
    return ok, f"artifacts={artifacts}; readiness={readiness}"


def scenario_runtime_readiness_detects_drift() -> tuple[bool, str]:
    ts = base_truth_surface()
    ts["recent_explicit_feedback"] = [{**base_feedback(), "feedback_id": "f-drift"}]
    route_event = {
        "event_id": "e-drift",
        "provider": "p",
        "model": "m",
        "mode": "hybrid",
        "route_reason": "quality support",
        "fallback_used": True,
        "fallback_refused": False,
        "learned_effect_allowed": True,
    }
    result = resolve_runtime_step(
        "design",
        ts,
        route_event=route_event,
        default="neutral",
        evaluate_promotion=True,
        project_repeat_count=2,
    )
    result["artifacts"]["promotion_analysis"]["decision"] = "reject"
    readiness = evaluate_runtime_readiness(result)
    ok = readiness["status"] == "not-ready" and "promotion_matches_artifact" in readiness["failed_checks"]
    return ok, str(readiness)


def main() -> int:
    scenarios = [
        ("spec-wins-over-default", scenario_spec_wins_over_default),
        ("project-promotion", scenario_project_promotion),
        ("owner-promotion", scenario_owner_promotion),
        ("unsafe-feedback-reject", scenario_unsafe_feedback_reject),
        ("acceptance-supported-project-promotion", scenario_acceptance_supported_project_promotion),
        ("repair-blocked-reject", scenario_repair_blocked_reject),
        ("hybrid-disclosure", scenario_hybrid_disclosure),
        ("fallback-refused-disclosure", scenario_fallback_refused_disclosure),
        ("runtime-artifact-populated-case", scenario_runtime_artifact_populated_case),
        ("runtime-artifact-empty-case", scenario_runtime_artifact_empty_case),
        ("runtime-readiness-detects-drift", scenario_runtime_readiness_detects_drift),
    ]

    failures = 0
    print("Runtime scenarios")
    for name, fn in scenarios:
        ok, detail = fn()
        status = "PASS" if ok else "FAIL"
        print(f"- {status} {name}: {detail}")
        if not ok:
            failures += 1

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
