from __future__ import annotations

from .contracts import RuntimeReadinessSummary


def evaluate_runtime_readiness(result: dict[str, object]) -> RuntimeReadinessSummary:
    mismatches: list[str] = []

    artifacts = result.get("artifacts")
    artifact_present = isinstance(artifacts, dict)

    disclosure_matches_provenance = True
    promotion_matches_artifact = True

    if not artifact_present:
        mismatches.append("missing artifacts block")
    else:
        provenance = artifacts.get("provenance")
        promotion_analysis = artifacts.get("promotion_analysis")

        disclosure = result.get("disclosure")
        if isinstance(disclosure, dict) and isinstance(provenance, dict):
            disclosure_level = disclosure.get("level")
            provenance_level = provenance.get("disclosure_level")
            if disclosure_level != provenance_level:
                disclosure_matches_provenance = False
                mismatches.append(
                    f"disclosure level mismatch: result={disclosure_level!r} artifacts={provenance_level!r}"
                )

            disclosure_text = disclosure.get("text")
            provenance_text = provenance.get("disclosure_text")
            if disclosure_text != provenance_text:
                disclosure_matches_provenance = False
                mismatches.append(
                    f"disclosure text mismatch: result={disclosure_text!r} artifacts={provenance_text!r}"
                )

        promotion = result.get("promotion")
        if isinstance(promotion, dict) and isinstance(promotion_analysis, dict):
            promotion_decision = promotion.get("decision")
            artifact_decision = promotion_analysis.get("decision")
            if promotion_decision != artifact_decision:
                promotion_matches_artifact = False
                mismatches.append(
                    f"promotion decision mismatch: result={promotion_decision!r} artifacts={artifact_decision!r}"
                )

            promotion_reason = promotion.get("reason")
            artifact_reason = promotion_analysis.get("reason")
            if promotion_reason != artifact_reason:
                promotion_matches_artifact = False
                mismatches.append(
                    f"promotion reason mismatch: result={promotion_reason!r} artifacts={artifact_reason!r}"
                )

            promotion_support = promotion.get("supporting_signal_used")
            artifact_support = promotion_analysis.get("supporting_signal_used")
            if promotion_support != artifact_support:
                promotion_matches_artifact = False
                mismatches.append(
                    "promotion supporting-signal mismatch: "
                    f"result={promotion_support!r} artifacts={artifact_support!r}"
                )

    checks = {
        "artifact_present": artifact_present,
        "disclosure_matches_provenance": disclosure_matches_provenance,
        "promotion_matches_artifact": promotion_matches_artifact,
    }
    failed_checks = [name for name, ok in checks.items() if not ok]

    return {
        "status": "ready" if not failed_checks else "not-ready",
        "checks": checks,
        "failed_checks": failed_checks,
        "mismatches": mismatches,
    }
