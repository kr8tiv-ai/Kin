from __future__ import annotations

import re


def normalize_rule_key(value: str) -> str:
    normalized = value.strip().lower()
    normalized = normalized.replace("_", ".").replace("-", ".")
    normalized = re.sub(r"\s+", ".", normalized)
    normalized = re.sub(r"\.+", ".", normalized)
    return normalized.strip(".")


def rule_matches(key: str, candidate: str) -> bool:
    normalized_key = normalize_rule_key(key)
    normalized_candidate = normalize_rule_key(candidate)
    return (
        normalized_key == normalized_candidate
        or normalized_key in normalized_candidate
        or normalized_candidate in normalized_key
    )
