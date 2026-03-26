#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.parsers import load_truth_surface
from runtime_types.runtime_operations import evaluate_runtime_readiness
from runtime_types.runtime_step import resolve_runtime_step


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def print_readiness(name: str, readiness: dict[str, object]) -> None:
    print(f"- {name}: status={readiness['status']}")
    print(f"  failed_checks={readiness['failed_checks']}")
    mismatches = readiness["mismatches"]
    if mismatches:
        for mismatch in mismatches:
            print(f"  mismatch={mismatch}")
    else:
        print("  mismatch=none")



def main() -> int:
    truth_surface_path = ROOT / "schemas" / "examples" / "truth-surface.example.json"
    truth_surface = load_truth_surface(load_json(truth_surface_path))

    healthy_route_event = {
        "event_id": "readiness-route-001",
        "provider": "demo-provider",
        "model": "demo-model",
        "mode": "hybrid",
        "route_reason": "quality support during readiness check",
        "fallback_used": True,
        "fallback_refused": False,
        "learned_effect_allowed": True,
    }

    healthy_result = resolve_runtime_step(
        "design",
        truth_surface,
        route_event=healthy_route_event,
        default=False,
        evaluate_promotion=True,
        project_repeat_count=1,
    )
    healthy_readiness = evaluate_runtime_readiness(healthy_result)

    drifted_result = resolve_runtime_step(
        "design",
        truth_surface,
        route_event=healthy_route_event,
        default=False,
        evaluate_promotion=True,
        project_repeat_count=1,
    )
    drifted_result["artifacts"]["promotion_analysis"]["decision"] = "reject"
    drifted_readiness = evaluate_runtime_readiness(drifted_result)

    empty_result = resolve_runtime_step(
        "routing.prefer_local",
        truth_surface,
        default=True,
        evaluate_promotion=True,
    )
    empty_readiness = evaluate_runtime_readiness(empty_result)

    print("Runtime operational readiness")
    print(f"- truth surface loaded: {truth_surface_path.name}")
    print_readiness("healthy-populated", healthy_readiness)
    print_readiness("drifted-promotion-artifact", drifted_readiness)
    print_readiness("healthy-empty-feedback", empty_readiness)
    print("- inspect this surface first when MVP honesty is in doubt: readiness.failed_checks + readiness.mismatches")

    return 0 if healthy_readiness["status"] == "ready" and drifted_readiness["status"] == "not-ready" else 1


if __name__ == "__main__":
    main()
