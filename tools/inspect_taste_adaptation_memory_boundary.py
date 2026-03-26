#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.parsers import (
    load_behavior_signal_entry,
    load_design_teaching_research_record,
    load_feedback_ledger_entry,
    load_preference_record,
    load_truth_surface,
)
from runtime_types.taste_adaptation_memory_boundary import derive_taste_adaptation_record

EXAMPLES = ROOT / "schemas" / "examples"


def _load(name: str) -> dict:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


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


def _feedback(feedback_id: str, feedback_text: str, target: str, applied_to: str, *, scope_requested: str = "turn", promotion_status: str = "local-only", provenance: str = "not-yet-proven") -> dict:
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


def _signal(signal_id: str, target: str, applied_to: str, signal_type: str, strength: float, source_route: str) -> dict:
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


def derive_scenarios() -> list[tuple[str, dict]]:
    blocked_record = load_design_teaching_research_record(_load("design-teaching-research-record.blocked.example.json"))
    local_record = load_design_teaching_research_record(_load("design-teaching-research-record.local-teaching.example.json"))
    hybrid_record = load_design_teaching_research_record(_load("design-teaching-research-record.hybrid-research.example.json"))

    spec_truth = load_truth_surface(
        {
            **_base_truth_surface(),
            "active_spec": {"resolved_rules": {"teaching": "concise support-safe response only"}},
            "active_project_preferences": [load_preference_record(_project_preference("pref-project-001", "design"))],
            "active_owner_preferences": [load_preference_record(_owner_preference("pref-owner-002", "teaching"))],
        }
    )
    preserved_truth = load_truth_surface(_base_truth_surface())
    hybrid_truth = load_truth_surface(_base_truth_surface())

    return [
        (
            "spec_suppressed",
            derive_taste_adaptation_record(
                record_id="taste-adaptation-record-spec-suppressed-001",
                design_teaching_research=blocked_record,
                truth_surface=spec_truth,
                preference_records=[
                    load_preference_record(_project_preference("pref-project-001", "design")),
                    load_preference_record(_owner_preference("pref-owner-002", "teaching")),
                ],
                feedback_entries=[],
                behavior_signals=[],
            ),
        ),
        (
            "preserved_decisions",
            derive_taste_adaptation_record(
                record_id="taste-adaptation-record-preserved-decisions-001",
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
            ),
        ),
        (
            "hybrid_guarded",
            derive_taste_adaptation_record(
                record_id="taste-adaptation-record-hybrid-guarded-001",
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
            ),
        ),
    ]


def format_record(name: str, record: dict) -> str:
    precedence_winners = ", ".join(
        f"{entry['target']}={entry['winner_source']}" for entry in record["precedence_summaries"]
    )
    return "\n".join(
        [
            f"SCENARIO {name}",
            f"  record_id: {record['record_id']}",
            f"  source_record: {record['design_teaching_research']['record_id']}",
            f"  active_targets: {', '.join(signal['target'] for signal in record['active_taste_signals']) or 'none'}",
            f"  suppressed_targets: {', '.join(signal['target'] for signal in record['suppressed_taste_signals']) or 'none'}",
            f"  preserved_targets: {', '.join(entry['target'] for entry in record['preserved_decisions']) or 'none'}",
            f"  changed_targets: {', '.join(entry['target'] for entry in record['changed_decisions']) or 'none'}",
            f"  precedence_winners: {precedence_winners}",
            f"  support_safe_summary: {record['support_safe_summary']}",
        ]
    )


def main() -> int:
    print("Taste adaptation memory-boundary inspection")
    print("Support-safe restore point for representative spec-suppressed, preserved-decision, and hybrid-guarded S06 states.")
    print("This CLI prints only bounded summaries derived from canonical S05 truth and omits raw feedback, transcript text, unredacted research detail, and any private-memory detail.")
    print()
    print("\n\n".join(format_record(name, record) for name, record in derive_scenarios()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
