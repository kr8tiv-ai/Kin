from __future__ import annotations

from typing import Literal, TypedDict

from .contracts import DesignResearchStatus, ResearchFreshnessLabel, RouteMode, RoutingProvenanceEvent

DisclosureLevel = Literal["none", "brief", "explicit"]


class DisclosureResult(TypedDict):
    level: DisclosureLevel
    text: str
    mention_external_help: bool


def format_design_research_disclosure(
    *,
    route_mode: RouteMode,
    research_status: DesignResearchStatus,
    freshness_label: ResearchFreshnessLabel,
) -> DisclosureResult:
    if research_status == "blocked":
        return {
            "level": "brief",
            "text": "Current-reference research is blocked for this record, so no freshness claim is made.",
            "mention_external_help": False,
        }

    if research_status == "suppressed":
        return {
            "level": "brief",
            "text": "Current-reference research is intentionally suppressed for this record.",
            "mention_external_help": False,
        }

    if route_mode == "hybrid" and research_status == "hybrid_support":
        freshness_phrase = "current-reference freshness" if freshness_label == "current" else "bounded reference synthesis"
        return {
            "level": "explicit",
            "text": f"Bounded hybrid research support informed the {freshness_phrase} notes for this design pass.",
            "mention_external_help": True,
        }

    return {
        "level": "none",
        "text": "No current-reference research was needed for this teaching pass.",
        "mention_external_help": False,
    }


def format_provenance_disclosure(event: RoutingProvenanceEvent) -> DisclosureResult:
    if event["fallback_refused"]:
        return {
            "level": "brief",
            "text": "External fallback was refused for this step, so the result stayed within the current allowed route.",
            "mention_external_help": False,
        }

    if event["mode"] == "local" and not event["fallback_used"]:
        return {
            "level": "brief",
            "text": "This step ran on the local path.",
            "mention_external_help": False,
        }

    if event["mode"] == "hybrid":
        return {
            "level": "explicit",
            "text": f"This step used a hybrid path: local execution with external help for quality or capability support. Reason: {event['route_reason']}",
            "mention_external_help": True,
        }

    if event["mode"] == "external":
        return {
            "level": "explicit",
            "text": f"This step relied on external help. Reason: {event['route_reason']}",
            "mention_external_help": True,
        }

    return {
        "level": "none",
        "text": "",
        "mention_external_help": False,
    }
