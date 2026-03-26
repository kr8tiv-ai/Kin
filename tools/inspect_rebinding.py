#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.rebinding import start_rebinding


def main() -> int:
    claim_path = ROOT / "fixtures" / "rebinding" / "claimed-cipher.json"
    claim = json.loads(claim_path.read_text(encoding="utf-8"))

    paid = start_rebinding(
        claim,
        new_owner_wallet="wallet-new-owner",
        transferable_state_ref="skill-pack-cipher-v1",
        private_state_ref="private-memory-old-owner",
        rebinding_fee_paid=True,
    )
    blocked = start_rebinding(
        claim,
        new_owner_wallet="wallet-new-owner",
        transferable_state_ref="skill-pack-cipher-v1",
        private_state_ref="private-memory-old-owner",
        rebinding_fee_paid=False,
    )

    print("Rebinding inspection")
    print(f"- paid: status={paid['status']} checkpoint={paid['manual_checkpoint']} old_access={paid['old_owner_access_status']}")
    print(f"  transferable={paid['transferable_state_ref']} private_state={paid['private_state_status']}")
    print(f"- blocked: status={blocked['status']} reason={blocked['blocking_reason']} checkpoint={blocked['manual_checkpoint']}")
    return 0


if __name__ == "__main__":
    main()
