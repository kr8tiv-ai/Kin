#!/usr/bin/env python
"""S07 managed-service posture inspection CLI.

Support-safe restore point for inspecting managed-service posture
without leaking infrastructure credentials or internal system details.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from runtime_types.contracts import (
    BackupState,
    ComputerSetupGuidance,
    ConciergeClaimLifecycleRecord,
    InterventionState,
    SupportReadiness,
    TailscaleAccessStatus,
)
from runtime_types.managed_service_posture import derive_managed_service_posture_record


def _load_example(name: str) -> dict:
    """Load an example fixture."""
    path = Path(__file__).parent.parent / "schemas" / "examples" / name
    return json.loads(path.read_text(encoding="utf-8"))


def inspect_healthy() -> None:
    """Inspect the healthy scenario."""
    example = _load_example("managed-service-posture-record.healthy.example.json")

    record = derive_managed_service_posture_record(
        record_id=example["record_id"],
        concierge_lifecycle=example["concierge_lifecycle"],
        website_specialist_harness=example.get("website_specialist_harness"),
        tailscale_access=example["tailscale_access"],
        computer_setup_guidance=example["computer_setup_guidance"],
        backup_state=example["backup_state"],
        intervention_state=example["intervention_state"],
        support_readiness=example["support_readiness"],
        overall_posture=example["overall_posture"],
        support_safe_summary=example["support_safe_summary"],
    )

    print("=== S07 Healthy Scenario ===")
    print(f"Record ID: {record['record_id']}")
    print(f"Overall Posture: {record['overall_posture']}")
    print(f"Tailscale Status: {record['tailscale_access']['status']}")
    print(f"Backup Status: {record['backup_state']['status']}")
    print(f"Intervention: {record['intervention_state']['status']}")
    print(f"Support Ready: {record['support_readiness']['can_receive_support']}")
    print(f"Summary: {record['support_safe_summary']}")
    print()


def inspect_needs_attention() -> None:
    """Inspect the needs-attention scenario."""
    example = _load_example("managed-service-posture-record.needs-attention.example.json")

    record = derive_managed_service_posture_record(
        record_id=example["record_id"],
        concierge_lifecycle=example["concierge_lifecycle"],
        website_specialist_harness=example.get("website_specialist_harness"),
        tailscale_access=example["tailscale_access"],
        computer_setup_guidance=example["computer_setup_guidance"],
        backup_state=example["backup_state"],
        intervention_state=example["intervention_state"],
        support_readiness=example["support_readiness"],
        overall_posture=example["overall_posture"],
        support_safe_summary=example["support_safe_summary"],
    )

    print("=== S07 Needs Attention Scenario ===")
    print(f"Record ID: {record['record_id']}")
    print(f"Overall Posture: {record['overall_posture']}")
    print(f"Tailscale Status: {record['tailscale_access']['status']}")
    print(f"Setup Step: {record['tailscale_access'].get('setup_step', 'N/A')}")
    print(f"Owner Action Required: {record['intervention_state']['owner_action_required']}")
    print(f"Next Step: {record['computer_setup_guidance']['next_owner_step']}")
    print(f"Summary: {record['support_safe_summary']}")
    print()


def inspect_recovering() -> None:
    """Inspect the recovering scenario."""
    example = _load_example("managed-service-posture-record.recovering.example.json")

    record = derive_managed_service_posture_record(
        record_id=example["record_id"],
        concierge_lifecycle=example["concierge_lifecycle"],
        website_specialist_harness=example.get("website_specialist_harness"),
        tailscale_access=example["tailscale_access"],
        computer_setup_guidance=example["computer_setup_guidance"],
        backup_state=example["backup_state"],
        intervention_state=example["intervention_state"],
        support_readiness=example["support_readiness"],
        overall_posture=example["overall_posture"],
        support_safe_summary=example["support_safe_summary"],
    )

    print("=== S07 Recovering Scenario ===")
    print(f"Record ID: {record['record_id']}")
    print(f"Overall Posture: {record['overall_posture']}")
    print(f"Intervention Type: {record['intervention_state'].get('intervention_type', 'none')}")
    print(f"Intervention Status: {record['intervention_state']['status']}")
    print(f"Owner Action Required: {record['intervention_state']['owner_action_required']}")
    print(f"Resolution: {record['intervention_state'].get('estimated_resolution_summary', 'N/A')}")
    print(f"Summary: {record['support_safe_summary']}")
    print()


def main() -> int:
    """Run all S07 inspection scenarios."""
    print("S07 Managed Service Posture Inspection")
    print("=" * 40)
    print()

    try:
        inspect_healthy()
        inspect_needs_attention()
        inspect_recovering()

        print("=" * 40)
        print("All S07 scenarios inspected successfully.")
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
