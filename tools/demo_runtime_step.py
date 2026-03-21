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

    result = resolve_runtime_step(
        "routing.prefer_local",
        truth_surface,
        route_event=route_event,
        default=False,
        evaluate_promotion=True,
        project_repeat_count=2,
    )

    print("Runtime demo")
    print(f"- truth surface loaded: {truth_surface_path.name}")
    print(f"- precedence winner: {result['precedence']['winner_source']}")
    print(f"- precedence value: {result['precedence']['winner_value']}")
    if "disclosure" in result:
        print(f"- disclosure level: {result['disclosure']['level']}")
        print(f"- disclosure text: {result['disclosure']['text']}")
    if "promotion" in result:
        print(f"- promotion decision: {result['promotion']['decision']}")
        print(f"- promotion reason: {result['promotion']['reason']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
