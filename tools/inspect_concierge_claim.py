#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.concierge_claims import derive_concierge_lifecycle
from runtime_types.contracts import ConciergeClaimLifecycleRecord


def _representative_claims() -> list[ConciergeClaimLifecycleRecord]:
    return [
        derive_concierge_lifecycle(
            claim_id="claim-concierge-001",
            claimant_label="demo-owner-cipher",
            claim_submitted=True,
            identity_verified=True,
            device_setup_complete=False,
            owner_confirmation_complete=False,
            support_intervention_required=False,
        ),
        derive_concierge_lifecycle(
            claim_id="claim-concierge-002",
            claimant_label="demo-owner-catalyst",
            claim_submitted=True,
            identity_verified=False,
            device_setup_complete=False,
            owner_confirmation_complete=False,
            support_intervention_required=True,
        ),
        derive_concierge_lifecycle(
            claim_id="claim-concierge-003",
            claimant_label="demo-owner-forge",
            claim_submitted=True,
            identity_verified=True,
            device_setup_complete=True,
            owner_confirmation_complete=True,
            support_intervention_required=False,
        ),
    ]


def _format_optional(label: str, value: str | None) -> str:
    return f"{label}: {value if value is not None else 'none'}"


def _print_record(record: ConciergeClaimLifecycleRecord) -> None:
    guidance = record["setup_guidance"]
    print(f"- {record['claim_id']} ({record['claimant_label']})")
    print(f"  Claim status: {record['claim_status']}")
    print(f"  Setup stage: {record['setup_stage']}")
    print(f"  Activation ready: {'yes' if record['activation_ready'] else 'no'}")
    print(f"  Blocking reason: {record['blocking_reason'] if record['blocking_reason'] is not None else 'none'}")
    print(
        f"  Manual checkpoint: {record['manual_checkpoint'] if record['manual_checkpoint'] is not None else 'none'}"
    )
    print(f"  Next user step: {record['next_user_step']}")
    print(f"  Guidance status: {guidance['guidance_status']}")
    print(f"  Summary: {guidance['plain_language_summary']}")
    print(f"  Support-safe notes: {guidance['support_safe_notes']}")


def main() -> int:
    print("Concierge claim inspection")
    print("Support-safe restore point for representative concierge onboarding states.")
    for record in _representative_claims():
        _print_record(record)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
