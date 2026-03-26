from __future__ import annotations

from .contracts import (
    DesignResearchSummary,
    DesignTeachingResearchRecord,
    DesignTeachingSummary,
    DisclosureLevel,
    ResearchFreshnessLabel,
    WebsiteSpecialistHarnessRecord,
)
from .disclosure import format_design_research_disclosure
from .parsers import load_design_research_summary, load_design_teaching_research_record, load_design_teaching_summary, load_website_specialist_harness_record


def _teaching_status(*, teaching_requested: bool) -> str:
    return "available" if teaching_requested else "suppressed"


def _teaching_summary(*, teaching_requested: bool, lesson_focus: str) -> str:
    if teaching_requested:
        return lesson_focus
    return "Teaching output is intentionally suppressed until the operator requests a bounded lesson pass."


def _design_choice_explanation(*, teaching_requested: bool, lesson_focus: str) -> str:
    if teaching_requested:
        return lesson_focus
    return "No design-choice explanation is emitted because the current support state should avoid over-teaching."


def _anti_slop_rationale(*, teaching_requested: bool, research_requested: bool) -> str:
    if not teaching_requested:
        return (
            "Suppressing speculative critique prevents Cipher from inventing lessons when the runtime has no approved "
            "teaching pass."
        )
    if research_requested:
        return (
            "It uses current references to sharpen judgment while explicitly avoiding trend worship, mimicry, and "
            "generic startup-page sludge."
        )
    return (
        "It redirects away from generic hero-feature boilerplate and trend cargo culting toward purposeful structure, "
        "hierarchy, and contrast decisions."
    )


def _research_payload(
    *,
    harness: WebsiteSpecialistHarnessRecord,
    research_requested: bool,
    current_reference_summary: str | None,
    freshness_label: ResearchFreshnessLabel,
    research_blocked_reason: str | None,
) -> DesignResearchSummary:
    route_mode = harness["execution"]["route"]["mode"]

    if research_blocked_reason:
        disclosure = format_design_research_disclosure(
            route_mode="local",
            research_status="blocked",
            freshness_label="unknown",
        )
        return load_design_research_summary(
            {
                "research_status": "blocked",
                "provenance_mode": "local",
                "freshness_label": "unknown",
                "disclosure_level": disclosure["level"],
                "disclosure_text": research_blocked_reason,
                "signal_summary": "No current-reference signal summary is available because research stayed blocked or suppressed.",
                "provenance_summary": "The record honestly reports the blocked state instead of implying that web checking or live browsing happened.",
            }
        )

    if not research_requested:
        disclosure = format_design_research_disclosure(
            route_mode="local",
            research_status="local_only",
            freshness_label="not_applicable",
        )
        return load_design_research_summary(
            {
                "research_status": "local_only",
                "provenance_mode": "local",
                "freshness_label": "not_applicable",
                "disclosure_level": disclosure["level"],
                "disclosure_text": disclosure["text"],
                "signal_summary": "Uses only local design-rubric and bounded synthesis signals already available in the runtime.",
                "provenance_summary": "No external or hybrid reference gathering occurred for this record.",
            }
        )

    if route_mode == "hybrid":
        disclosure = format_design_research_disclosure(
            route_mode="hybrid",
            research_status="hybrid_support",
            freshness_label=freshness_label,
        )
        signal_summary = current_reference_summary or (
            "Current-reference synthesis highlighted which visual cues still feel contemporary and which ones now read "
            "as overused."
        )
        return load_design_research_summary(
            {
                "research_status": "hybrid_support",
                "provenance_mode": "hybrid",
                "freshness_label": freshness_label,
                "disclosure_level": disclosure["level"],
                "disclosure_text": disclosure["text"],
                "signal_summary": signal_summary,
                "provenance_summary": "Signals were translated into implementation-facing guidance from bounded hybrid support rather than preserved as raw reference dumps.",
            }
        )

    disclosure = format_design_research_disclosure(
        route_mode="local",
        research_status="local_only",
        freshness_label="not_applicable",
    )
    return load_design_research_summary(
        {
            "research_status": "local_only",
            "provenance_mode": "local",
            "freshness_label": "not_applicable",
            "disclosure_level": disclosure["level"],
            "disclosure_text": disclosure["text"],
            "signal_summary": "Uses only local design-rubric and bounded synthesis signals already available in the runtime.",
            "provenance_summary": "No external or hybrid reference gathering occurred for this record.",
        }
    )


def derive_design_teaching_research_record(
    *,
    record_id: str,
    harness: WebsiteSpecialistHarnessRecord,
    lesson_focus: str,
    next_step_guidance: str,
    teaching_requested: bool,
    research_requested: bool,
    current_reference_summary: str | None = None,
    freshness_label: ResearchFreshnessLabel = "unknown",
    research_blocked_reason: str | None = None,
) -> DesignTeachingResearchRecord:
    validated_harness = load_website_specialist_harness_record(harness)

    teaching: DesignTeachingSummary = load_design_teaching_summary(
        {
            "teaching_status": _teaching_status(teaching_requested=teaching_requested),
            "lesson_summary": _teaching_summary(
                teaching_requested=teaching_requested,
                lesson_focus=lesson_focus,
            ),
            "design_choice_explanation": _design_choice_explanation(
                teaching_requested=teaching_requested,
                lesson_focus=lesson_focus,
            ),
            "anti_slop_rationale": _anti_slop_rationale(
                teaching_requested=teaching_requested,
                research_requested=research_requested,
            ),
            "next_step_guidance": next_step_guidance,
        }
    )

    research = _research_payload(
        harness=validated_harness,
        research_requested=research_requested,
        current_reference_summary=current_reference_summary,
        freshness_label=freshness_label,
        research_blocked_reason=research_blocked_reason,
    )

    support_safe_summary = (
        "Cipher can explain the design direction and disclose bounded provenance without bluffing that live browsing occurred or exposing sensitive runtime detail."
        if teaching_requested or research_requested
        else "Cipher preserves a support-safe blocked state without bluffing unavailable research or critique output."
    )

    return load_design_teaching_research_record(
        {
            "record_id": record_id,
            "schema_family": "s05_design_teaching_research",
            "harness": validated_harness,
            "teaching": teaching,
            "research": research,
            "support_safe_summary": support_safe_summary,
        }
    )
