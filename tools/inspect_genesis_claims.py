#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.genesis_claims import resolve_genesis_claim


def main() -> int:
    fixtures_dir = ROOT / "fixtures" / "genesis"
    print("Genesis claim inspection")
    for path in sorted(fixtures_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        result = resolve_genesis_claim(payload)
        print(f"- {path.name}: eligible={result['eligible']} failure={result['failure_reason']}")
        if result["ownership"] is not None:
            ownership = result["ownership"]
            entitlement = result["entitlement"]
            print(
                "  "
                f"bloodline={ownership['bloodline']} tier={entitlement['tier']} "
                f"months={entitlement['included_months']} discount={entitlement['lifetime_discount_percent']}% "
                f"rewards={entitlement['solana_rewards_percent']}%"
            )
    return 0


if __name__ == "__main__":
    main()
