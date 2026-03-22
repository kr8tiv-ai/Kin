from __future__ import annotations

import contextlib
import io
import json
import runpy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.parsers import (
    load_behavior_signal_entry,
    load_design_teaching_research_record,
    load_feedback_ledger_entry,
    load_preference_record,
    load_taste_adaptation_record,
    load_truth_surface,
)
from runtime_types.taste_adaptation_memory_boundary import derive_taste_adaptation_record


def example_payload(name: str) -> dict:
    path = ROOT / "schemas" / "examples" / name
    return json.loads(path.read_text(encoding="utf-8"))


def _base_truth_surface() -> dict:
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


def _project_preference(preference_id: str, rule: str, provenance_level: str = "local-proven") -> dict:
    return {
        "preference_id": preference_id,
        "rule": rule,
        "scope": "project",
        "confidence": 0.93,
        "evidence_count": 3,
        "last_confirmed_at": "2026-03-21T08:00:00Z",
        "conflict_status": "active",
        "origin_feedback_ids": ["fb-local-001"],
        "provenance_level": provenance_level,
    }


def _owner_preference(preference_id: str, rule: str, provenance_level: str = "hybrid-proven") -> dict:
    return {
        "preference_id": preference_id,
        "rule": rule,
        "scope": "owner",
        "confidence": 0.88,
        "evidence_count": 2,
        "last_confirmed_at": "2026-03-21T08:00:00Z",
        "conflict_status": "active",
        "origin_feedback_ids": ["fb-owner-001"],
        "provenance_level": provenance_level,
    }


def _feedback(
    feedback_id: str,
    feedback_text: str,
    target: str,
    applied_to: str,
    *,
    scope_requested: str = "turn",
    promotion_status: str = "local-only",
    provenance: str = "not-yet-proven",
) -> dict:
    return {
        "feedback_id": feedback_id,
        "feedback_text": feedback_text,
        "timestamp": "2026-03-21T08:05:00Z",
        "scope_requested": scope_requested,
        "target": target,
        "polarity": "correction",
        "source": "user",
        "applied_to": applied_to,
        "promotion_status": promotion_status,
        "provenance": provenance,
    }


def _signal(
    signal_id: str,
    target: str,
    applied_to: str,
    signal_type: str,
    strength: float,
    source_route: str,
) -> dict:
    return {
        "signal_id": signal_id,
        "timestamp": "2026-03-21T08:10:00Z",
        "target": target,
        "signal_type": signal_type,
        "strength": strength,
        "applied_to": applied_to,
        "source_route": source_route,
        "notes": f"{signal_type} evidence for {target}",
    }


class TasteAdaptationDerivationTests(unittest.TestCase):
    """Tests that S06 derives correctly from canonical S05 truth."""

    def test_spec_suppressed_scenario_derives_suppressed_teaching_signal(self) -> None:
        """When the active spec narrows the deliverable, teaching taste is suppressed."""
        blocked_record = load_design_teaching_research_record(
            example_payload("design-teaching-research-record.blocked.example.json")
        )
        spec_truth = load_truth_surface(
            {
                **_base_truth_surface(),
                "active_spec": {"resolved_rules": {"teaching": "concise support-safe response only"}},
                "active_project_preferences": [load_preference_record(_project_preference("pref-project-001", "design"))],
                "active_owner_preferences": [load_preference_record(_owner_preference("pref-owner-002", "teaching"))],
            }
        )

        result = derive_taste_adaptation_record(
            record_id="taste-adaptation-spec-suppressed-test-001",
            design_teaching_research=blocked_record,
            truth_surface=spec_truth,
            preference_records=[
                load_preference_record(_project_preference("pref-project-001", "design")),
                load_preference_record(_owner_preference("pref-owner-002", "teaching")),
            ],
            feedback_entries=[],
            behavior_signals=[],
        )

        self.assertEqual(result["schema_family"], "s06_taste_adaptation_memory_boundary")
        # Teaching signal should be suppressed due to active spec override
        teaching_suppressed = [s for s in result["suppressed_taste_signals"] if s["target"] == "teaching"]
        self.assertEqual(len(teaching_suppressed), 1)
        self.assertEqual(teaching_suppressed[0]["suppression_reason"], "active_spec_override")
        # Design preference should remain active
        design_active = [s for s in result["active_taste_signals"] if s["target"] == "design"]
        self.assertEqual(len(design_active), 1)
        # Precedence should show active_spec won for teaching
        teaching_precedence = [p for p in result["precedence_summaries"] if p["target"] == "teaching"]
        self.assertEqual(len(teaching_precedence), 1)
        self.assertEqual(teaching_precedence[0]["winner_source"], "active_spec")

    def test_preserved_decisions_scenario_keeps_confirmed_taste_active(self) -> None:
        """When project taste and accepted behavior align, decisions are preserved."""
        local_record = load_design_teaching_research_record(
            example_payload("design-teaching-research-record.local-teaching.example.json")
        )
        preserved_truth = load_truth_surface(_base_truth_surface())

        result = derive_taste_adaptation_record(
            record_id="taste-adaptation-preserved-test-001",
            design_teaching_research=local_record,
            truth_surface=preserved_truth,
            preference_records=[
                load_preference_record(_project_preference("pref-project-001", "design")),
                load_preference_record(_owner_preference("pref-owner-002", "teaching")),
            ],
            feedback_entries=[
                load_feedback_ledger_entry(
                    _feedback(
                        "fb-local-001",
                        "keep the page less glossy",
                        "design",
                        local_record["record_id"],
                        scope_requested="project",
                        promotion_status="promoted",
                        provenance="local-proven",
                    )
                ),
                load_feedback_ledger_entry(
                    _feedback(
                        "fb-routing-001",
                        "keep this one local if possible",
                        "routing",
                        local_record["record_id"],
                    )
                ),
            ],
            behavior_signals=[
                load_behavior_signal_entry(
                    _signal(
                        "sig-accepted-001",
                        "design",
                        local_record["record_id"],
                        "accepted_without_edit",
                        0.95,
                        "local",
                    )
                )
            ],
        )

        # Design should be preserved
        design_preserved = [d for d in result["preserved_decisions"] if d["target"] == "design"]
        self.assertGreaterEqual(len(design_preserved), 1)
        self.assertEqual(design_preserved[0]["decision_status"], "preserved")
        # Teaching should also be preserved (no active spec blocking it)
        teaching_preserved = [d for d in result["preserved_decisions"] if d["target"] == "teaching"]
        self.assertEqual(len(teaching_preserved), 1)
        # Routing feedback should be suppressed due to insufficient evidence
        routing_suppressed = [s for s in result["suppressed_taste_signals"] if s["target"] == "routing"]
        self.assertEqual(len(routing_suppressed), 1)
        self.assertEqual(routing_suppressed[0]["suppression_reason"], "insufficient_evidence")

    def test_hybrid_guarded_scenario_prevents_provenance_laundering(self) -> None:
        """Hybrid-assisted wins must not be flattened into owner taste."""
        hybrid_record = load_design_teaching_research_record(
            example_payload("design-teaching-research-record.hybrid-research.example.json")
        )
        hybrid_truth = load_truth_surface(_base_truth_surface())

        result = derive_taste_adaptation_record(
            record_id="taste-adaptation-hybrid-guarded-test-001",
            design_teaching_research=hybrid_record,
            truth_surface=hybrid_truth,
            preference_records=[],
            feedback_entries=[],
            behavior_signals=[
                load_behavior_signal_entry(
                    _signal(
                        "sig-accepted-hybrid-001",
                        "design",
                        hybrid_record["record_id"],
                        "accepted_without_edit",
                        0.92,
                        "hybrid",
                    )
                )
            ],
        )

        # Should have promotion_guarded warning on active signals
        self.assertTrue(any("promotion_guarded" in s.get("warning_flags", []) for s in result["active_taste_signals"]))
        # Should have suppressed signal for hybrid behavior that cannot become owner taste
        hybrid_suppressed = [s for s in result["suppressed_taste_signals"] if s["target"] == "design"]
        self.assertEqual(len(hybrid_suppressed), 1)
        self.assertEqual(hybrid_suppressed[0]["suppression_reason"], "route_provenance_guard")
        self.assertIn("hybrid_not_promoted", hybrid_suppressed[0]["warning_flags"])
        # Changed decision should record the memory-boundary guard
        changed = [d for d in result["changed_decisions"] if "promotion_guarded" in d.get("warning_flags", [])]
        self.assertGreaterEqual(len(changed), 1)
        # Support-safe summary should mention hybrid provenance
        self.assertIn("hybrid", result["support_safe_summary"].lower())

    def test_s06_consumes_canonical_s05_truth_without_mutation(self) -> None:
        """S06 must derive from S05 without mutating the upstream record."""
        local_record = load_design_teaching_research_record(
            example_payload("design-teaching-research-record.local-teaching.example.json")
        )
        original_record_id = local_record["record_id"]
        original_harness_id = local_record["harness"]["harness_id"]

        result = derive_taste_adaptation_record(
            record_id="taste-adaptation-consumption-test-001",
            design_teaching_research=local_record,
            truth_surface=load_truth_surface(_base_truth_surface()),
            preference_records=[load_preference_record(_project_preference("pref-project-001", "design"))],
            feedback_entries=[],
            behavior_signals=[],
        )

        # S05 record should be unchanged
        self.assertEqual(result["design_teaching_research"]["record_id"], original_record_id)
        self.assertEqual(result["design_teaching_research"]["harness"]["harness_id"], original_harness_id)


class TasteAdaptationParserBoundaryTests(unittest.TestCase):
    """Tests for S06 parser boundary enforcement and redaction constraints."""

    def test_example_record_stays_support_safe(self) -> None:
        """S06 example fixtures must not expose raw feedback, transcripts, or private memory."""
        payload = example_payload("taste-adaptation-record.hybrid-guarded.example.json")

        record = load_taste_adaptation_record(payload)

        rendered = json.dumps(record).lower()
        self.assertEqual(record["schema_family"], "s06_taste_adaptation_memory_boundary")
        # Check that actual leaked content patterns don't appear
        self.assertNotIn("raw_feedback_text", rendered)
        self.assertNotIn("raw_transcript_text", rendered)
        self.assertNotIn("private_memory_payload", rendered)
        self.assertNotIn("https://", rendered)
        self.assertNotIn("http://", rendered)

    def test_parser_rejects_private_memory_leak_field(self) -> None:
        """S06 parser must reject records with private_memory_payload."""
        payload = example_payload("taste-adaptation-record.spec-suppressed.example.json")
        payload["private_memory_payload"] = {"secret": "unsafe memory dump"}

        with self.assertRaises(ValueError):
            load_taste_adaptation_record(payload)

    def test_parser_rejects_raw_feedback_text_in_signal(self) -> None:
        """S06 parser must reject taste signals with raw_feedback_text."""
        payload = example_payload("taste-adaptation-record.preserved-decisions.example.json")
        payload["active_taste_signals"][0]["raw_feedback_text"] = "exact owner words"

        with self.assertRaises(ValueError):
            load_taste_adaptation_record(payload)

    def test_parser_rejects_invalid_warning_flag(self) -> None:
        """S06 parser must reject unknown warning flags."""
        payload = example_payload("taste-adaptation-record.spec-suppressed.example.json")
        payload["active_taste_signals"][0]["warning_flags"] = ["mystery-flag"]

        with self.assertRaises(ValueError):
            load_taste_adaptation_record(payload)

    def test_parser_rejects_invalid_suppression_reason(self) -> None:
        """S06 parser must reject unknown suppression reasons."""
        payload = example_payload("taste-adaptation-record.spec-suppressed.example.json")
        payload["suppressed_taste_signals"][0]["suppression_reason"] = "mystery_reason"

        with self.assertRaises(ValueError):
            load_taste_adaptation_record(payload)

    def test_parser_accepts_all_three_example_fixtures(self) -> None:
        """All three S06 example fixtures must validate successfully."""
        for name in [
            "taste-adaptation-record.spec-suppressed.example.json",
            "taste-adaptation-record.preserved-decisions.example.json",
            "taste-adaptation-record.hybrid-guarded.example.json",
        ]:
            payload = example_payload(name)
            result = load_taste_adaptation_record(payload)
            self.assertEqual(result["schema_family"], "s06_taste_adaptation_memory_boundary")


class TasteAdaptationCliTests(unittest.TestCase):
    """Tests for the S06 restore-point CLI using runpy."""

    def test_cli_prints_support_safe_restore_point(self) -> None:
        """The S06 CLI must print stable support-safe summaries for all scenarios."""
        output = io.StringIO()

        with contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as exit_ctx:
                runpy.run_path(str(ROOT / "tools" / "inspect_taste_adaptation_memory_boundary.py"), run_name="__main__")

        rendered = output.getvalue()
        self.assertEqual(exit_ctx.exception.code, 0)
        self.assertIn("Taste adaptation memory-boundary inspection", rendered)
        self.assertIn("SCENARIO spec_suppressed", rendered)
        self.assertIn("SCENARIO preserved_decisions", rendered)
        self.assertIn("SCENARIO hybrid_guarded", rendered)
        self.assertIn("active_targets:", rendered)
        self.assertIn("suppressed_targets:", rendered)
        self.assertIn("precedence_winners:", rendered)
        self.assertIn("support_safe_summary:", rendered)
        # Redaction constraints - check that actual content isn't leaked
        # (the CLI header mentions what it omits, so we check for specific leaked content patterns)
        self.assertNotIn("https://", rendered)
        self.assertNotIn("http://", rendered)
        self.assertNotIn("private_memory_payload", rendered)

    def test_cli_prints_spec_suppressed_scenario(self) -> None:
        """The CLI must show teaching suppression when spec narrows deliverable."""
        output = io.StringIO()

        with contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit):
                runpy.run_path(str(ROOT / "tools" / "inspect_taste_adaptation_memory_boundary.py"), run_name="__main__")

        rendered = output.getvalue()
        self.assertIn("SCENARIO spec_suppressed", rendered)
        self.assertIn("teaching", rendered)  # Teaching target appears


if __name__ == "__main__":
    unittest.main()
