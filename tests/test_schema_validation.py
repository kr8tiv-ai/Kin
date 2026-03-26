from __future__ import annotations

import unittest

from runtime_types.schema_validation import example_to_schema_name, validate_value


class SchemaValidationTests(unittest.TestCase):
    def test_empty_variant_example_maps_to_base_schema_name(self) -> None:
        self.assertEqual(
            example_to_schema_name("runtime-step-artifacts-empty.example.json"),
            "runtime-step-artifacts.schema.json",
        )

    def test_validate_value_accepts_union_type_with_null(self) -> None:
        schema = {"type": ["string", "null"], "enum": ["brief", "explicit", None]}
        errors = validate_value(schema, None, "field", {})
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
