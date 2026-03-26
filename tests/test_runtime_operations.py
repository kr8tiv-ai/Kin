from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

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


class RuntimeOperationalReadinessTests(unittest.TestCase):
    def test_readiness_summary_accepts_honest_populated_result(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-runtime",
                "feedback_text": "less glossy",
                "target": "design",
            }
        ]
        ts["recent_behavior_signals"] = [
            {
                "signal_id": "sig-runtime-accept",
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
            "event_id": "e-runtime",
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

        readiness = evaluate_runtime_readiness(result)

        self.assertEqual(readiness["status"], "ready")
        self.assertEqual(readiness["failed_checks"], [])
        self.assertEqual(readiness["mismatches"], [])
        self.assertTrue(readiness["checks"]["artifact_present"])
        self.assertTrue(readiness["checks"]["disclosure_matches_provenance"])
        self.assertTrue(readiness["checks"]["promotion_matches_artifact"])

    def test_readiness_summary_flags_artifact_mismatch(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-runtime",
                "feedback_text": "less glossy",
                "target": "design",
            }
        ]
        route_event = {
            "event_id": "e-runtime",
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

        self.assertEqual(readiness["status"], "not-ready")
        self.assertIn("promotion_matches_artifact", readiness["failed_checks"])
        self.assertTrue(
            any(mismatch.startswith("promotion decision mismatch") for mismatch in readiness["mismatches"])
        )

    def test_readiness_summary_flags_missing_artifact_block(self) -> None:
        result = {
            "precedence": {
                "key": "routing.prefer_local",
                "winner_source": "default",
                "winner_value": True,
                "overridden_sources": [],
                "reason": "No matching higher-precedence source resolved the key.",
            }
        }

        readiness = evaluate_runtime_readiness(result)

        self.assertEqual(readiness["status"], "not-ready")
        self.assertIn("artifact_present", readiness["failed_checks"])
        self.assertIn("missing artifacts block", readiness["mismatches"])

    def test_readiness_summary_flags_disclosure_drift(self) -> None:
        ts = base_truth_surface()
        route_event = {
            "event_id": "e-runtime",
            "provider": "p",
            "model": "m",
            "mode": "hybrid",
            "route_reason": "quality support",
            "fallback_used": True,
            "fallback_refused": False,
            "learned_effect_allowed": True,
        }

        result = resolve_runtime_step(
            "routing.prefer_local",
            ts,
            route_event=route_event,
            default=True,
            evaluate_promotion=True,
        )
        result["artifacts"]["provenance"]["disclosure_level"] = "brief"

        readiness = evaluate_runtime_readiness(result)

        self.assertEqual(readiness["status"], "not-ready")
        self.assertIn("disclosure_matches_provenance", readiness["failed_checks"])
        self.assertTrue(
            any(mismatch.startswith("disclosure level mismatch") for mismatch in readiness["mismatches"])
        )


if __name__ == "__main__":
    unittest.main()
