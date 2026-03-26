#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.parsers import load_truth_surface
from runtime_types.runtime_step import resolve_runtime_step


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def print_artifact_summary(result: dict, *, label: str) -> None:
    artifacts = result["artifacts"]
    provenance = artifacts["provenance"]
    feedback_selection = artifacts["feedback_selection"]
    promotion_analysis = artifacts["promotion_analysis"]

    print(f"{label}")
    print(
        "  provenance: "
        f"route={provenance['route_mode']} disclosure={provenance['disclosure_level']} "
        f"fallback_used={provenance['fallback_used']} fallback_refused={provenance['fallback_refused']}"
    )
    print(f"  route reason: {provenance['route_reason']}")
    print(f"  disclosure text: {provenance['disclosure_text']}")
    print(
        "  feedback selection: "
        f"selected={feedback_selection['selected']} id={feedback_selection['selected_feedback_id']} "
        f"target={feedback_selection['target']}"
    )
    print(f"  selection reason: {feedback_selection['selection_reason']}")
    print(
        "  promotion analysis: "
        f"status={promotion_analysis['status']} decision={promotion_analysis['decision']} "
        f"supporting_signal_used={promotion_analysis['supporting_signal_used']} "
        f"blocking_signal_type={promotion_analysis['blocking_signal_type']}"
    )
    print(f"  promotion audit: {promotion_analysis['audit_summary']}")



def main() -> int:
    truth_surface_path = ROOT / "schemas" / "examples" / "truth-surface.example.json"
    truth_surface = load_truth_surface(load_json(truth_surface_path))

    route_event = {
        "event_id": "demo-route-001",
        "provider": "demo-provider",
        "model": "demo-model",
        "mode": "hybrid",
        "route_reason": "quality support during demo step",
        "fallback_used": True,
        "fallback_refused": False,
        "learned_effect_allowed": True,
    }

    populated_result = resolve_runtime_step(
        "design",
        truth_surface,
        route_event=route_event,
        default=False,
        evaluate_promotion=True,
        project_repeat_count=1,
    )

    empty_result = resolve_runtime_step(
        "routing.prefer_local",
        truth_surface,
        default=True,
        evaluate_promotion=True,
    )

    print("Runtime demo")
    print(f"- truth surface loaded: {truth_surface_path.name}")
    print(f"- populated precedence winner: {populated_result['precedence']['winner_source']}")
    print(f"- empty-case precedence winner: {empty_result['precedence']['winner_source']}")
    print_artifact_summary(populated_result, label="- populated artifact block")
    print_artifact_summary(empty_result, label="- empty artifact block")
    print("- inspect this surface first when route/disclosure/promotion drift is suspected: result['artifacts']")

    return 0


if __name__ == "__main__":
    main()
