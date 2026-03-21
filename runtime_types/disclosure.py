from __future__ import annotations

from typing import Literal, TypedDict

from .contracts import RoutingProvenanceEvent

DisclosureLevel = Literal["none", "brief", "explicit"]


class DisclosureResult(TypedDict):
    level: DisclosureLevel
    text: str
    mention_external_help: bool


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
