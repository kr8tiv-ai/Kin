#!/usr/bin/env python
"""S08 integrated harness truth inspection CLI."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from runtime_types.integrated_harness_truth import derive_integrated_harness_truth


def _load_example(name: str) -> dict:
    """Load an example fixture."""
    path = ROOT / "schemas" / "examples" / name
    return json.loads(path.read_text(encoding="utf-8"))


def inspect_healthy() -> None:
    """Inspect the healthy scenario using inline example."""
    example = _load_example("integrated-harness-truth-record.healthy.example.json")

    record = derive_integrated_harness_truth(
        record_id=example["record_id"],
        concierge_lifecycle=example["concierge_lifecycle"],
        telegram_voice_turn=example["telegram_voice_turn"],
        cipher_continuity=example["cipher_continuity"],
        website_specialist_harness=example["website_specialist_harness"],
        design_teaching_research=example["design_teaching_research"],
        taste_adaptation=example["taste_adaptation"],
        managed_service_posture=example["managed_service_posture"],
    )

    print("=== S08 Healthy Scenario ===")
    print(f"Record ID: {record['record_id']}")
    print(f"Local-First Honesty:")
    honesty = record["local_first_honesty"]
    print(f"  Onboarding honest: {honesty['onboarding_honest']}")
    print(f"  Voice loop honest: {honesty['voice_loop_honest']}")
    print(f"  Specialist local ratio: {honesty['specialist_local_ratio']:.0%}")
    print(f"  Teaching active: {honesty['teaching_active']}")
    print(f"  Adaptation bounded: {honesty['adaptation_bounded']}")
    print(f"  Managed service visible: {honesty['managed_service_visible']}")
    print(f"Summary: {record['support_safe_summary']}")


def main() -> int:
    """Run S08 inspection."""
    print("S08 Integrated Harness Truth Inspection")
    print("=" * 40)
    print()

    try:
        inspect_healthy()
        print()
        print("=" * 40)
        print("All S08 scenarios inspected successfully.")
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
