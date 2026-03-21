#!/usr/bin/env python3
"""Repo-local schema sanity validator CLI."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.schema_validation import validate_examples


def main() -> int:
    errors, schema_count, example_count = validate_examples()

    if errors:
        print("Schema validation FAILED")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Schema validation PASSED")
    print(f"- schemas checked: {schema_count}")
    print(f"- examples checked: {example_count}")
    print("- validation depth: recursive subset with local $ref support")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
