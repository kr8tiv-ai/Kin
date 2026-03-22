"""S08 integrated harness truth tests.

Tests for S08 derivation helper and contracts.
Note: Full schema validation requires aligned fixtures with upstream slices.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class IntegratedHarnessTruthContractTests(unittest.TestCase):
    """Tests for S08 contracts and derivation helper."""

    def test_contracts_import_successfully(self) -> None:
        """S08 contracts must be importable."""
        from runtime_types.contracts import (
            IntegratedHarnessTruthRecord,
            LocalFirstHonesty,
            S08SchemaFamily,
        )

        # Type aliases are importable
        self.assertIsNotNone(IntegratedHarnessTruthRecord)
        self.assertIsNotNone(LocalFirstHonesty)
        self.assertIsNotNone(S08SchemaFamily)

    def test_derivation_helper_imports(self) -> None:
        """The derivation helper must be importable."""
        from runtime_types.integrated_harness_truth import derive_integrated_harness_truth

        self.assertTrue(callable(derive_integrated_harness_truth))

    def test_parser_function_exists(self) -> None:
        """The parser function must exist."""
        from runtime_types.parsers import load_integrated_harness_truth_record

        self.assertTrue(callable(load_integrated_harness_truth_record))


if __name__ == "__main__":
    unittest.main()
