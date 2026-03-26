from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.rebinding import start_rebinding


def claim_result() -> dict:
    return {
        "eligible": True,
        "failure_reason": None,
        "ownership": {
            "asset_id": "asset-cipher-001",
            "collection": "genesis-kin",
            "owner_wallet": "wallet-old-owner",
            "bloodline": "Cipher",
        },
        "entitlement": {
            "tier": "Egg",
            "included_months": 1,
            "lifetime_discount_percent": 25,
            "solana_rewards_percent": 1,
        },
    }


class RebindingLifecycleTests(unittest.TestCase):
    def test_transfer_preserves_transferable_state_and_detaches_private_state(self) -> None:
        result = start_rebinding(
            claim_result(),
            new_owner_wallet="wallet-new-owner",
            transferable_state_ref="skill-pack-cipher-v1",
            private_state_ref="private-memory-old-owner",
            rebinding_fee_paid=True,
        )

        self.assertEqual(result["asset_id"], "asset-cipher-001")
        self.assertEqual(result["previous_owner_wallet"], "wallet-old-owner")
        self.assertEqual(result["current_owner_wallet"], "wallet-new-owner")
        self.assertEqual(result["transferable_state_ref"], "skill-pack-cipher-v1")
        self.assertEqual(result["private_state_ref"], "private-memory-old-owner")
        self.assertEqual(result["private_state_status"], "detached")
        self.assertEqual(result["old_owner_access_status"], "revoked")
        self.assertEqual(result["status"], "pending_onboarding")

    def test_rebinding_requires_fee_and_manual_onboarding_checkpoint(self) -> None:
        result = start_rebinding(
            claim_result(),
            new_owner_wallet="wallet-new-owner",
            transferable_state_ref="skill-pack-cipher-v1",
            private_state_ref="private-memory-old-owner",
            rebinding_fee_paid=False,
        )

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["blocking_reason"], "rebinding_fee_unpaid")
        self.assertEqual(result["manual_checkpoint"], "await_rebinding_fee")

    def test_old_owner_access_is_revoked_on_transfer(self) -> None:
        result = start_rebinding(
            claim_result(),
            new_owner_wallet="wallet-new-owner",
            transferable_state_ref="skill-pack-cipher-v1",
            private_state_ref="private-memory-old-owner",
            rebinding_fee_paid=True,
        )

        self.assertEqual(result["old_owner_access_status"], "revoked")
        self.assertEqual(result["manual_checkpoint"], "await_new_owner_onboarding")


if __name__ == "__main__":
    unittest.main()
