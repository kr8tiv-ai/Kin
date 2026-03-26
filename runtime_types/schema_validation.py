from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "schemas"
EXAMPLE_DIR = SCHEMA_DIR / "examples"

JSON_TYPE_MAP: dict[str, tuple[type, ...]] = {
    "object": (dict,),
    "array": (list,),
    "string": (str,),
    "number": (int, float),
    "integer": (int,),
    "boolean": (bool,),
}


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def load_all_schemas() -> dict[str, dict[str, Any]]:
    schemas: dict[str, dict[str, Any]] = {}
    for schema_path in sorted(SCHEMA_DIR.glob("*.schema.json")):
        schema = load_json(schema_path)
        if not isinstance(schema, dict):
            raise ValueError(f"{schema_path}: schema root must be an object")
        schemas[schema_path.name] = schema
    return schemas


def example_to_schema_name(example_name: str) -> str:
    if not example_name.endswith(".example.json"):
        raise ValueError(f"Unexpected example filename format: {example_name}")
    stem = example_name.removesuffix(".example.json")
    if stem.endswith("-empty"):
        stem = stem.removesuffix("-empty")
    dotted_parts = stem.split(".")
    if len(dotted_parts) > 1:
        stem = dotted_parts[0]
    return f"{stem}.schema.json"


def resolve_ref(ref: str, schemas: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    if not ref.startswith("./") or not ref.endswith(".json"):
        return None
    return schemas.get(ref[2:])


def json_type_ok(expected_type: str, value: Any) -> bool:
    allowed = JSON_TYPE_MAP.get(expected_type)
    if allowed is None:
        return True
    if expected_type == "number":
        return isinstance(value, allowed) and not isinstance(value, bool)
    if expected_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    return isinstance(value, allowed)


def _json_type_name(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _json_type_matches(expected_type: str, value: Any) -> bool:
    if expected_type == "null":
        return value is None
    return json_type_ok(expected_type, value)


def validate_value(
    schema: dict[str, Any],
    value: Any,
    label: str,
    schemas: dict[str, dict[str, Any]],
) -> list[str]:
    errors: list[str] = []

    if "$ref" in schema:
        target = resolve_ref(schema["$ref"], schemas)
        if target is None:
            return [f"{label}: unresolved ref {schema['$ref']!r}"]
        return validate_value(target, value, label, schemas)

    expected_type = schema.get("type")
    if isinstance(expected_type, str) and not json_type_ok(expected_type, value):
        return [f"{label}: expected type '{expected_type}', got '{type(value).__name__}'"]
    if isinstance(expected_type, list):
        if not any(isinstance(option, str) and _json_type_matches(option, value) for option in expected_type):
            return [
                f"{label}: expected one of types {expected_type!r}, got '{_json_type_name(value)}'"
            ]

    if "enum" in schema and value not in schema["enum"]:
        return [f"{label}: invalid value {value!r}; allowed={schema['enum']!r}"]

    if expected_type == "object" and isinstance(value, dict):
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        additional_allowed = schema.get("additionalProperties", True)

        for key in required:
            if key not in value:
                errors.append(f"{label}: missing required field '{key}'")

        if additional_allowed is False:
            extra_keys = sorted(set(value.keys()) - set(properties.keys()))
            for key in extra_keys:
                errors.append(f"{label}: unexpected field '{key}'")

        for key, child_schema in properties.items():
            if key not in value:
                continue
            errors.extend(validate_value(child_schema, value[key], f"{label}.{key}", schemas))

    if expected_type == "array" and isinstance(value, list):
        item_schema = schema.get("items")
        if item_schema is None:
            return errors
        for idx, item in enumerate(value):
            errors.extend(validate_value(item_schema, item, f"{label}[{idx}]", schemas))

    return errors


def validate_against_schema_name(schema_name: str, payload: Any) -> list[str]:
    schemas = load_all_schemas()
    schema = schemas.get(schema_name)
    if schema is None:
        return [f"unknown schema '{schema_name}'"]
    return validate_value(schema, payload, schema_name.replace('.schema.json', ''), schemas)


def validate_examples() -> tuple[list[str], int, int]:
    schemas = load_all_schemas()
    errors: list[str] = []
    example_paths = sorted(EXAMPLE_DIR.glob("*.json"))

    for example_path in example_paths:
        try:
            payload = load_json(example_path)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{example_path}: failed to parse JSON ({exc})")
            continue

        try:
            schema_name = example_to_schema_name(example_path.name)
        except ValueError as exc:
            errors.append(str(exc))
            continue

        schema = schemas.get(schema_name)
        if schema is None:
            errors.append(f"{example_path}: no matching schema file '{schema_name}'")
            continue

        errors.extend(validate_value(schema, payload, example_path.name, schemas))

    return errors, len(schemas), len(example_paths)
