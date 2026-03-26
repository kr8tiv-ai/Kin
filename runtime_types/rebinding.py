from __future__ import annotations

from .contracts import GenesisClaimResult, RebindingLifecycleRecord


def start_rebinding(
    claim: GenesisClaimResult,
    *,
    new_owner_wallet: str,
    transferable_state_ref: str,
    private_state_ref: str,
    rebinding_fee_paid: bool,
) -> RebindingLifecycleRecord:
    ownership = claim["ownership"]
    if ownership is None:
        raise ValueError("Cannot start rebinding without a claimed Genesis ownership record.")

    blocked = not rebinding_fee_paid
    return {
        "asset_id": ownership["asset_id"],
        "previous_owner_wallet": ownership["owner_wallet"],
        "current_owner_wallet": new_owner_wallet,
        "transferable_state_ref": transferable_state_ref,
        "private_state_ref": private_state_ref,
        "private_state_status": "detached",
        "old_owner_access_status": "revoked",
        "status": "blocked" if blocked else "pending_onboarding",
        "blocking_reason": "rebinding_fee_unpaid" if blocked else None,
        "manual_checkpoint": "await_rebinding_fee" if blocked else "await_new_owner_onboarding",
    }
