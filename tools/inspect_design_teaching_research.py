#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types import derive_design_teaching_research_record
from runtime_types.parsers import load_website_specialist_harness_record


EXAMPLES = ROOT / "schemas" / "examples"


def _load_example(name: str) -> dict:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def derive_scenarios() -> list[tuple[str, dict]]:
    local_harness = load_website_specialist_harness_record(
        _load_example("website-specialist-harness-record.local-success.example.json")
    )
    hybrid_harness = load_website_specialist_harness_record(
        _load_example("website-specialist-harness-record.hybrid-escalation.example.json")
    )

    return [
        (
            "local_teaching",
            derive_design_teaching_research_record(
                record_id="derived-local-teaching-001",
                harness=local_harness,
                lesson_focus="Explains why stronger hierarchy and tighter section pacing make the page feel intentional rather than template-assembled.",
                next_step_guidance="Revise the hero and first supporting section before layering in extra visual effects.",
                teaching_requested=True,
                research_requested=False,
            ),
        ),
        (
            "hybrid_research",
            derive_design_teaching_research_record(
                record_id="derived-hybrid-research-001",
                harness=hybrid_harness,
                lesson_focus="Translates bounded current-reference signals into guidance about what feels stale, overdone, or appropriately current for the website.",
                next_step_guidance="Keep the concept and hierarchy, then selectively update only the sections whose treatment reads stale.",
                teaching_requested=True,
                research_requested=True,
                current_reference_summary="Current-reference synthesis highlighted which visual cues still feel contemporary and which ones now read as overused.",
                freshness_label="current",
            ),
        ),
        (
            "blocked_or_suppressed",
            derive_design_teaching_research_record(
                record_id="derived-blocked-001",
                harness=local_harness,
                lesson_focus="No lesson should be emitted when the bounded teaching pass is suppressed.",
                next_step_guidance="Ask for an explicit bounded teaching pass before requesting design-lesson output.",
                teaching_requested=False,
                research_requested=True,
                research_blocked_reason="Current-reference research is blocked for this record, so no freshness claim is made.",
            ),
        ),
    ]


def format_record(name: str, record: dict) -> str:
    teaching = record["teaching"]
    research = record["research"]
    harness = record["harness"]
    execution = harness["execution"]

    return "\n".join(
        [
            f"SCENARIO {name}",
            f"  record_id: {record['record_id']}",
            f"  harness_id: {harness['harness_id']}",
            f"  route_mode: {execution['route']['mode']}",
            f"  teaching_status: {teaching['teaching_status']}",
            f"  research_status: {research['research_status']}",
            f"  provenance_mode: {research['provenance_mode']}",
            f"  freshness_label: {research['freshness_label']}",
            f"  disclosure_level: {research['disclosure_level']}",
            f"  disclosure_text: {research['disclosure_text']}",
            f"  lesson_summary: {teaching['lesson_summary']}",
            f"  anti_slop_rationale: {teaching['anti_slop_rationale']}",
            f"  signal_summary: {research['signal_summary']}",
            f"  support_safe_summary: {record['support_safe_summary']}",
        ]
    )


def main() -> int:
    print("Design teaching + research inspection")
    print("Support-safe restore point for representative local teaching, hybrid research, and blocked/suppressed S05 states.")
    print("This CLI reflects derived S05 runtime truth on top of canonical S04 harness records and does not imply a live browser or unredacted runtime artifacts.")
    print()
    print("\n\n".join(format_record(name, record) for name, record in derive_scenarios()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
