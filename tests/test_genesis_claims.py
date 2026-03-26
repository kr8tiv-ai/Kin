from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.genesis_claims import resolve_genesis_claim


def egg_asset() -> dict:
    return {
        "asset_id": "asset-egg-001",
        "collection": "genesis-kin",
        "owner_wallet": "wallet-egg-owner",
        "bloodline": "Cipher",
        "tier": "Egg",
    }


def hatchling_asset() -> dict:
    return {
        "asset_id": "asset-hatchling-001",
        "collection": "genesis-kin",
        "owner_wallet": "wallet-hatchling-owner",
        "bloodline": "Catalyst",
        "tier": "Hatchling",
    }


def elder_asset() -> dict:
    return {
        "asset_id": "asset-elder-001",
        "collection": "genesis-kin",
        "owner_wallet": "wallet-elder-owner",
        "bloodline": "Forge",
        "tier": "Elder",
    }


class GenesisEntitlementTests(unittest.TestCase):
    def test_resolves_all_three_live_tiers(self) -> None:
        egg = resolve_genesis_claim(egg_asset())
        hatchling = resolve_genesis_claim(hatchling_asset())
        elder = resolve_genesis_claim(elder_asset())

        self.assertEqual(egg["ownership"]["bloodline"], "Cipher")
        self.assertEqual(egg["entitlement"]["tier"], "Egg")
        self.assertEqual(egg["entitlement"]["included_months"], 1)
        self.assertEqual(egg["entitlement"]["lifetime_discount_percent"], 25)
        self.assertEqual(egg["entitlement"]["solana_rewards_percent"], 1)

        self.assertEqual(hatchling["ownership"]["bloodline"], "Catalyst")
        self.assertEqual(hatchling["entitlement"]["tier"], "Hatchling")
        self.assertEqual(hatchling["entitlement"]["included_months"], 3)
        self.assertEqual(hatchling["entitlement"]["solana_rewards_percent"], 2)

        self.assertEqual(elder["ownership"]["bloodline"], "Forge")
        self.assertEqual(elder["entitlement"]["tier"], "Elder")
        self.assertEqual(elder["entitlement"]["included_months"], 3)
        self.assertEqual(elder["entitlement"]["solana_rewards_percent"], 3)

    def test_rejects_non_genesis_asset(self) -> None:
        payload = {
            "asset_id": "asset-other-001",
            "collection": "future-kin",
            "owner_wallet": "wallet-other-owner",
            "bloodline": "Cipher",
            "tier": "Egg",
        }

        result = resolve_genesis_claim(payload)

        self.assertEqual(result["failure_reason"], "not_genesis_collection")
        self.assertFalse(result["eligible"])

    def test_requires_resolvable_bloodline_and_tier_metadata(self) -> None:
        payload = {
            "asset_id": "asset-bad-001",
            "collection": "genesis-kin",
            "owner_wallet": "wallet-bad-owner",
            "bloodline": "Unknown",
            "tier": "Mythic",
        }

        result = resolve_genesis_claim(payload)

        self.assertEqual(result["failure_reason"], "unresolvable_metadata")
        self.assertFalse(result["eligible"])


if __name__ == "__main__":
    unittest.main()
