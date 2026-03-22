#!/usr/bin/env python3
"""
S06 slice verifier for the Windows workspace.

This script exercises the real __main__ paths for:
- tools/validate_schemas.py
- tools/inspect_taste_adaptation_memory_boundary.py

using runpy.run_path(..., run_name='__main__') to avoid the fragile
direct-shell entrypoint path.
"""

from __future__ import annotations

import contextlib
import io
import runpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def verify_schema_validation() -> bool:
    """Run schema validation through its __main__ path."""
    print("=" * 60)
    print("STEP 1: Schema validation")
    print("=" * 60)

    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            with contextlib.redirect_stderr(output):
                runpy.run_path(str(ROOT / "tools" / "validate_schemas.py"), run_name="__main__")
        print(output.getvalue())
        print("Schema validation: PASSED")
        return True
    except SystemExit as e:
        rendered = output.getvalue()
        print(rendered)
        if e.code == 0:
            print("Schema validation: PASSED")
            return True
        else:
            print(f"Schema validation: FAILED (exit code {e.code})")
            return False
    except Exception as e:
        print(f"Schema validation: FAILED with exception: {e}")
        return False


def verify_s06_cli() -> bool:
    """Run the S06 CLI through its __main__ path."""
    print()
    print("=" * 60)
    print("STEP 2: S06 taste adaptation memory-boundary CLI")
    print("=" * 60)

    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            with contextlib.redirect_stderr(output):
                runpy.run_path(
                    str(ROOT / "tools" / "inspect_taste_adaptation_memory_boundary.py"),
                    run_name="__main__",
                )
        rendered = output.getvalue()
        print(rendered)

        # Verify expected content
        expected_markers = [
            "Taste adaptation memory-boundary inspection",
            "SCENARIO spec_suppressed",
            "SCENARIO preserved_decisions",
            "SCENARIO hybrid_guarded",
            "support_safe_summary:",
        ]
        missing = [m for m in expected_markers if m not in rendered]
        if missing:
            print(f"S06 CLI: FAILED - missing markers: {missing}")
            return False

        # Verify redaction constraints
        forbidden = ["raw feedback", "raw transcript", "private memory"]
        leaked = [f for f in forbidden if f in rendered.lower()]
        if leaked:
            print(f"S06 CLI: FAILED - leaked forbidden content: {leaked}")
            return False

        print("S06 CLI: PASSED")
        return True
    except SystemExit as e:
        rendered = output.getvalue()
        print(rendered)
        if e.code == 0:
            print("S06 CLI: PASSED")
            return True
        else:
            print(f"S06 CLI: FAILED (exit code {e.code})")
            return False
    except Exception as e:
        print(f"S06 CLI: FAILED with exception: {e}")
        return False


def verify_s06_tests() -> bool:
    """Run the S06 unit tests."""
    print()
    print("=" * 60)
    print("STEP 3: S06 unit tests")
    print("=" * 60)

    import subprocess

    result = subprocess.run(
        [sys.executable, "-m", "unittest", "tests.test_taste_adaptation_memory_boundary"],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )

    print(result.stdout)
    if result.stderr:
        print(result.stderr)

    if result.returncode == 0:
        print("S06 unit tests: PASSED")
        return True
    else:
        print(f"S06 unit tests: FAILED (exit code {result.returncode})")
        return False


def main() -> int:
    print("S06 Slice Verification")
    print("This verifier exercises the real __main__ paths for S06 tooling.")
    print()

    results = [
        verify_schema_validation(),
        verify_s06_cli(),
        verify_s06_tests(),
    ]

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Schema validation: {'PASSED' if results[0] else 'FAILED'}")
    print(f"S06 CLI:           {'PASSED' if results[1] else 'FAILED'}")
    print(f"S06 unit tests:    {'PASSED' if results[2] else 'FAILED'}")

    if all(results):
        print()
        print("All S06 verification steps passed.")
        return 0
    else:
        print()
        print("Some S06 verification steps failed.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
