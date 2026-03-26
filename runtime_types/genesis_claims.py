from __future__ import annotations

from .contracts import GenesisClaimResult

VALID_COLLECTION = "genesis-kin"
TIER_ENTITLEMENTS = {
    "Egg": {
        "included_months": 1,
        "lifetime_discount_percent": 25,
        "solana_rewards_percent": 1,
    },
    "Hatchling": {
        "included_months": 3,
        "lifetime_discount_percent": 25,
        "solana_rewards_percent": 2,
    },
    "Elder": {
        "included_months": 3,
        "lifetime_discount_percent": 25,
        "solana_rewards_percent": 3,
    },
}
VALID_BLOODLINES = {"Mischief", "Vortex", "Forge", "Aether", "Catalyst", "Cipher"}


def resolve_genesis_claim(asset: dict[str, object]) -> GenesisClaimResult:
    collection = asset.get("collection")
    if collection != VALID_COLLECTION:
        return {
            "eligible": False,
            "failure_reason": "not_genesis_collection",
            "ownership": None,
            "entitlement": None,
        }

    bloodline = asset.get("bloodline")
    tier = asset.get("tier")
    if bloodline not in VALID_BLOODLINES or tier not in TIER_ENTITLEMENTS:
        return {
            "eligible": False,
            "failure_reason": "unresolvable_metadata",
            "ownership": None,
            "entitlement": None,
        }

    entitlement = TIER_ENTITLEMENTS[tier]
    return {
        "eligible": True,
        "failure_reason": None,
        "ownership": {
            "asset_id": str(asset["asset_id"]),
            "collection": str(collection),
            "owner_wallet": str(asset["owner_wallet"]),
            "bloodline": bloodline,
        },
        "entitlement": {
            "tier": tier,
            "included_months": entitlement["included_months"],
            "lifetime_discount_percent": entitlement["lifetime_discount_percent"],
            "solana_rewards_percent": entitlement["solana_rewards_percent"],
        },
    }
