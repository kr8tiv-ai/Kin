from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.disclosure import format_provenance_disclosure
from runtime_types.feedback_selection import select_relevant_feedback
from runtime_types.parsers import load_behavior_signal_entry, load_truth_surface
from runtime_types.precedence import resolve_precedence
from runtime_types.promotion import evaluate_feedback_promotion
from runtime_types.promotion_audit import format_promotion_audit
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


class FeedbackSelectionTests(unittest.TestCase):
    def test_prefers_turn_scope_over_broader_scope_when_both_match(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-project",
                "feedback_text": "less glossy at the project level",
                "scope_requested": "project",
                "target": "design",
                "timestamp": "2026-03-20T00:00:00Z",
            },
            {
                **base_feedback(),
                "feedback_id": "f-turn",
                "feedback_text": "less glossy for this turn",
                "scope_requested": "turn",
                "target": "design",
                "timestamp": "2026-03-19T00:00:00Z",
            },
        ]

        result = select_relevant_feedback("design", ts)

        self.assertIsNotNone(result)
        self.assertEqual(result["feedback_id"], "f-turn")

    def test_ignores_expired_and_rejected_feedback(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-expired",
                "promotion_status": "expired",
                "target": "design",
            },
            {
                **base_feedback(),
                "feedback_id": "f-rejected",
                "promotion_status": "rejected",
                "target": "design",
            },
        ]

        result = select_relevant_feedback("design", ts)

        self.assertIsNone(result)

    def test_prefers_more_recent_feedback_when_scope_is_equal(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-old",
                "feedback_text": "older feedback",
                "scope_requested": "turn",
                "target": "design",
                "timestamp": "2026-03-19T00:00:00Z",
            },
            {
                **base_feedback(),
                "feedback_id": "f-new",
                "feedback_text": "newer feedback",
                "scope_requested": "turn",
                "target": "design",
                "timestamp": "2026-03-20T00:00:00Z",
            },
        ]

        result = select_relevant_feedback("design", ts)

        self.assertIsNotNone(result)
        self.assertEqual(result["feedback_id"], "f-new")


class ParserBoundaryTests(unittest.TestCase):
    def test_load_behavior_signal_entry_accepts_valid_payload(self) -> None:
        payload = {
            "signal_id": "sig-201",
            "timestamp": "2026-03-20T18:50:00Z",
            "target": "design",
            "signal_type": "user_repair",
            "strength": 0.9,
            "applied_to": "example-task-001",
            "source_route": "local",
            "notes": "User manually simplified the generated hero treatment after review.",
        }

        result = load_behavior_signal_entry(payload)

        self.assertEqual(result["signal_type"], "user_repair")
        self.assertEqual(result["target"], "design")

    def test_load_behavior_signal_entry_rejects_invalid_signal_type(self) -> None:
        payload = {
            "signal_id": "sig-bad",
            "timestamp": "2026-03-20T18:50:00Z",
            "target": "design",
            "signal_type": "mystery_signal",
            "strength": 0.9,
            "applied_to": "example-task-001",
            "source_route": "local",
            "notes": "Invalid signal type.",
        }

        with self.assertRaises(ValueError):
            load_behavior_signal_entry(payload)

    def test_load_truth_surface_requires_recent_behavior_signals(self) -> None:
        payload = base_truth_surface()
        del payload["recent_behavior_signals"]

        with self.assertRaises(ValueError):
            load_truth_surface(payload)


class PrecedenceTests(unittest.TestCase):
    def test_active_spec_wins_over_feedback_and_default(self) -> None:
        ts = base_truth_surface()
        ts["active_spec"] = {"resolved_rules": {"routing.prefer_local": True}}
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_text": "Use external help if it is faster.",
                "target": "routing.prefer_local",
            }
        ]

        result = resolve_precedence("routing.prefer_local", ts, default=False)

        self.assertEqual(result["winner_source"], "active_spec")
        self.assertTrue(result["winner_value"])

    def test_latest_matching_feedback_wins_when_spec_is_silent(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-old",
                "feedback_text": "keep it glossy",
                "target": "design",
            },
            {
                **base_feedback(),
                "feedback_id": "f-new",
                "feedback_text": "less glossy",
                "target": "design",
            },
        ]

        result = resolve_precedence("design", ts, default="neutral")

        self.assertEqual(result["winner_source"], "explicit_feedback")
        self.assertEqual(result["winner_value"], "less glossy")

    def test_superseded_project_preference_is_ignored(self) -> None:
        ts = base_truth_surface()
        ts["active_project_preferences"] = [
            {
                "preference_id": "pref-stale",
                "rule": "design.dark_mode",
                "scope": "project",
                "confidence": 0.9,
                "evidence_count": 4,
                "last_confirmed_at": "2026-03-20T18:30:00Z",
                "conflict_status": "superseded",
                "origin_feedback_ids": ["fb-101"],
                "provenance_level": "local-proven",
            }
        ]

        result = resolve_precedence("design.dark_mode", ts, default="light")

        self.assertEqual(result["winner_source"], "default")
        self.assertEqual(result["winner_value"], "light")

    def test_active_project_preference_beats_owner_preference(self) -> None:
        ts = base_truth_surface()
        ts["active_project_preferences"] = [
            {
                "preference_id": "pref-project",
                "rule": "teaching.more_explanatory",
                "scope": "project",
                "confidence": 0.9,
                "evidence_count": 3,
                "last_confirmed_at": "2026-03-20T18:30:00Z",
                "conflict_status": "active",
                "origin_feedback_ids": ["fb-101"],
                "provenance_level": "local-proven",
            }
        ]
        ts["active_owner_preferences"] = [
            {
                "preference_id": "pref-owner",
                "rule": "teaching.minimal",
                "scope": "owner",
                "confidence": 0.7,
                "evidence_count": 5,
                "last_confirmed_at": "2026-03-20T18:00:00Z",
                "conflict_status": "active",
                "origin_feedback_ids": ["fb-050"],
                "provenance_level": "hybrid-proven",
            }
        ]

        result = resolve_precedence("teaching.more_explanatory", ts, default="neutral")

        self.assertEqual(result["winner_source"], "project_preference")
        self.assertEqual(result["winner_value"], "teaching.more_explanatory")


class PromotionTests(unittest.TestCase):
    def test_external_only_feedback_sets_provenance_warning(self) -> None:
        result = evaluate_feedback_promotion(
            {**base_feedback(), "provenance": "external-only"},
            project_repeat_count=2,
        )

        self.assertEqual(result["decision"], "project")
        self.assertTrue(result["provenance_warning"])

    def test_unsafe_feedback_is_rejected_even_with_repeat_counts(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=5,
            cross_project_repeat_count=3,
            explicit_durable=True,
            safe_to_learn=False,
        )

        self.assertEqual(result["decision"], "reject")

    def test_behavioral_repair_signal_blocks_promotion(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=5,
            behavior_signals=[
                {
                    "signal_id": "sig-repair-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "user_repair",
                    "strength": 0.9,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User manually simplified the hero after generation.",
                }
            ],
        )

        self.assertEqual(result["decision"], "reject")
        self.assertIn("repair", result["reason"].lower())
        self.assertEqual(result["blocking_signal_type"], "user_repair")
        self.assertFalse(result["supporting_signal_used"])

    def test_behavioral_non_adoption_signal_blocks_promotion(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=5,
            behavior_signals=[
                {
                    "signal_id": "sig-skip-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "suggestion_not_adopted",
                    "strength": 0.8,
                    "applied_to": "x",
                    "source_route": "hybrid",
                    "notes": "Suggested treatment was not carried forward.",
                }
            ],
        )

        self.assertEqual(result["decision"], "reject")
        self.assertIn("not adopted", result["reason"].lower())
        self.assertEqual(result["blocking_signal_type"], "suggestion_not_adopted")
        self.assertFalse(result["supporting_signal_used"])

    def test_accepted_without_edit_can_support_project_promotion(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=1,
            behavior_signals=[
                {
                    "signal_id": "sig-accept-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "accepted_without_edit",
                    "strength": 0.85,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User accepted the generated treatment without edits.",
                }
            ],
        )

        self.assertEqual(result["decision"], "project")
        self.assertIn("accepted", result["reason"].lower())
        self.assertIsNone(result["blocking_signal_type"])
        self.assertTrue(result["supporting_signal_used"])

    def test_accepted_without_edit_does_not_override_safety_or_negative_evidence(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=1,
            safe_to_learn=False,
            behavior_signals=[
                {
                    "signal_id": "sig-accept-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "accepted_without_edit",
                    "strength": 0.95,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User accepted the generated treatment without edits.",
                },
                {
                    "signal_id": "sig-repair-1",
                    "timestamp": "2026-03-20T00:06:00Z",
                    "target": "design",
                    "signal_type": "user_repair",
                    "strength": 0.95,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User later repaired the generated treatment.",
                },
            ],
        )

        self.assertEqual(result["decision"], "reject")
        self.assertIsNone(result["blocking_signal_type"])
        self.assertFalse(result["supporting_signal_used"])

    def test_blocking_signal_still_wins_when_acceptance_signal_is_present(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=1,
            behavior_signals=[
                {
                    "signal_id": "sig-accept-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "accepted_without_edit",
                    "strength": 0.95,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User accepted the generated treatment without edits.",
                },
                {
                    "signal_id": "sig-repair-1",
                    "timestamp": "2026-03-20T00:06:00Z",
                    "target": "design",
                    "signal_type": "user_repair",
                    "strength": 0.95,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User later repaired the generated treatment.",
                },
            ],
        )

        self.assertEqual(result["decision"], "reject")
        self.assertIn("repair", result["reason"].lower())
        self.assertEqual(result["blocking_signal_type"], "user_repair")
        self.assertTrue(result["supporting_signal_used"])

    def test_local_only_result_reports_no_behavioral_audit_flags(self) -> None:
        result = evaluate_feedback_promotion(base_feedback())

        self.assertEqual(result["decision"], "local-only")
        self.assertIsNone(result["blocking_signal_type"])
        self.assertFalse(result["supporting_signal_used"])


class PromotionAuditFormatterTests(unittest.TestCase):
    def test_formats_blocked_promotion_audit(self) -> None:
        summary = format_promotion_audit(
            {
                "decision": "reject",
                "reason": "Feedback should not be promoted because the user had to repair the resulting work after application.",
                "provenance_warning": False,
                "blocking_signal_type": "user_repair",
                "supporting_signal_used": False,
            }
        )

        self.assertIn("reject", summary)
        self.assertIn("user_repair", summary)

    def test_formats_supported_project_promotion_audit(self) -> None:
        summary = format_promotion_audit(
            {
                "decision": "project",
                "reason": "Feedback can promote project-wide because it repeated and was accepted without edit in practice.",
                "provenance_warning": False,
                "blocking_signal_type": None,
                "supporting_signal_used": True,
            }
        )

        self.assertIn("project", summary)
        self.assertIn("accepted_without_edit", summary)

    def test_formats_neutral_local_only_audit(self) -> None:
        summary = format_promotion_audit(
            {
                "decision": "local-only",
                "reason": "Feedback should affect the current unit but lacks evidence for broader promotion.",
                "provenance_warning": False,
                "blocking_signal_type": None,
                "supporting_signal_used": False,
            }
        )

        self.assertIn("local-only", summary)
        self.assertIn("no_behavioral_signal", summary)


class DisclosureTests(unittest.TestCase):
    def test_hybrid_route_requires_explicit_disclosure(self) -> None:
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

        self.assertEqual(result["level"], "explicit")
        self.assertTrue(result["mention_external_help"])

    def test_fallback_refusal_stays_brief_and_non_external(self) -> None:
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

        self.assertEqual(result["level"], "brief")
        self.assertFalse(result["mention_external_help"])


class RuntimeStepTests(unittest.TestCase):
    def test_runtime_step_composes_precedence_disclosure_and_promotion(self) -> None:
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

        self.assertEqual(result["precedence"]["winner_source"], "explicit_feedback")
        self.assertEqual(result["disclosure"]["level"], "explicit")
        self.assertEqual(result["promotion"]["decision"], "project")
        self.assertIsNone(result["promotion"]["blocking_signal_type"])
        self.assertFalse(result["promotion"]["supporting_signal_used"])

    def test_runtime_step_omits_promotion_when_feedback_absent(self) -> None:
        ts = base_truth_surface()

        result = resolve_runtime_step(
            "routing.prefer_local",
            ts,
            default=True,
            evaluate_promotion=True,
        )

        self.assertEqual(result["precedence"]["winner_source"], "default")
        self.assertNotIn("promotion", result)


    def test_runtime_step_uses_selected_feedback_for_promotion_instead_of_last_entry(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-relevant",
                "feedback_text": "less glossy",
                "scope_requested": "turn",
                "target": "design",
                "promotion_status": "local-only",
                "provenance": "not-yet-proven",
            },
            {
                **base_feedback(),
                "feedback_id": "f-last-but-irrelevant",
                "feedback_text": "teach more",
                "scope_requested": "turn",
                "target": "teaching",
                "promotion_status": "local-only",
                "provenance": "external-only",
            },
        ]

        result = resolve_runtime_step(
            "design",
            ts,
            default="neutral",
            evaluate_promotion=True,
            project_repeat_count=2,
        )

        self.assertEqual(result["precedence"]["winner_source"], "explicit_feedback")
        self.assertEqual(result["precedence"]["winner_value"], "less glossy")
        self.assertEqual(result["promotion"]["decision"], "project")
        self.assertFalse(result["promotion"]["provenance_warning"])
        self.assertIsNone(result["promotion"]["blocking_signal_type"])
        self.assertFalse(result["promotion"]["supporting_signal_used"])

    def test_runtime_step_omits_promotion_when_only_irrelevant_feedback_exists(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-teaching-only",
                "target": "teaching",
                "feedback_text": "teach more",
            }
        ]

        result = resolve_runtime_step(
            "design",
            ts,
            default="neutral",
            evaluate_promotion=True,
        )

        self.assertEqual(result["precedence"]["winner_source"], "default")
        self.assertNotIn("promotion", result)


    def test_runtime_step_blocks_promotion_when_behavioral_signal_shows_user_repair(self) -> None:
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
                "signal_id": "sig-runtime-repair",
                "timestamp": "2026-03-20T00:05:00Z",
                "target": "design",
                "signal_type": "user_repair",
                "strength": 0.95,
                "applied_to": "x",
                "source_route": "local",
                "notes": "User manually corrected the generated treatment.",
            }
        ]

        result = resolve_runtime_step(
            "design",
            ts,
            default="neutral",
            evaluate_promotion=True,
            project_repeat_count=3,
        )

        self.assertEqual(result["precedence"]["winner_source"], "explicit_feedback")
        self.assertEqual(result["promotion"]["decision"], "reject")
        self.assertEqual(result["promotion"]["blocking_signal_type"], "user_repair")
        self.assertFalse(result["promotion"]["supporting_signal_used"])

    def test_runtime_step_reports_supporting_acceptance_audit_fields(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-runtime-accept",
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
                "source_route": "local",
                "notes": "User accepted the generated treatment without edits.",
            }
        ]

        result = resolve_runtime_step(
            "design",
            ts,
            default="neutral",
            evaluate_promotion=True,
            project_repeat_count=1,
        )

        self.assertEqual(result["promotion"]["decision"], "project")
        self.assertIsNone(result["promotion"]["blocking_signal_type"])
        self.assertTrue(result["promotion"]["supporting_signal_used"])


if __name__ == "__main__":
    unittest.main()
