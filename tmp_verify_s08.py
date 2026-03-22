#!/usr/bin/env python
"""S08 verification script."""

from __future__ import annotations

import runpy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class S08VerificationTests(unittest.TestCase):
    """Verification tests for S08 integrated harness truth."""

    def test_cli_main_exits_zero(self) -> None:
        """The CLI __main__ must exit with code 0."""
        with self.assertRaises(SystemExit) as ctx:
            runpy.run_path(
                str(ROOT / "tools" / "inspect_integrated_harness_truth.py"),
                run_name="__main__",
            )
        self.assertEqual(ctx.exception.code, 0)

    def test_unit_tests_pass(self) -> None:
        """Unit tests must pass via unittest discovery."""
        loader = unittest.TestLoader()
        suite = loader.discover(str(ROOT / "tests"), pattern="test_integrated_harness_truth.py")
        runner = unittest.TextTestRunner(verbosity=0)
        result = runner.run(suite)
        self.assertTrue(result.wasSuccessful(), f"Tests failed: {result.failures}")


def main() -> int:
    """Run S08 verification."""
    print("S08 Integrated Harness Truth Verification")
    print("=" * 40)

    # Run unit tests
    print("\n1. Running unit tests...")
    loader = unittest.TestLoader()
    suite = loader.discover(str(ROOT / "tests"), pattern="test_integrated_harness_truth.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    if not result.wasSuccessful():
        print("\n[X] Unit tests failed")
        return 1

    print("\n[OK] Unit tests passed")

    # Run CLI verification
    print("\n2. Running CLI verification...")
    try:
        runpy.run_path(
            str(ROOT / "tools" / "inspect_integrated_harness_truth.py"),
            run_name="__main__",
        )
    except SystemExit as e:
        if e.code == 0:
            print("[OK] CLI exited successfully")
        else:
            print(f"\n[X] CLI exited with code {e.code}")
            return 1

    print("\n" + "=" * 40)
    print("All S08 verifications passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
