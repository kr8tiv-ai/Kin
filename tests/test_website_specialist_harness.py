from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.parsers import load_website_specialist_harness_record


class WebsiteSpecialistHarnessContractTests(unittest.TestCase):
    def test_local_success_example_stays_support_safe_and_local(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "website-specialist-harness-record.local-success.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_website_specialist_harness_record(payload)

        self.assertEqual(result["execution"]["route"]["mode"], "local")
        self.assertFalse(result["execution"]["fallback_refused"])
        self.assertIn("cipher_bloodline", result["execution"]["persona_markers"])

    def test_hybrid_escalation_example_discloses_external_help_honestly(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "website-specialist-harness-record.hybrid-escalation.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_website_specialist_harness_record(payload)

        self.assertEqual(result["execution"]["route"]["mode"], "hybrid")
        self.assertEqual(result["execution"]["disclosure_level"], "explicit")
        self.assertTrue(result["execution"]["route"]["fallback_used"])


if __name__ == "__main__":
    unittest.main()
