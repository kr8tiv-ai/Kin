from __future__ import annotations

from typing import Iterable

from .contracts import (
    CipherContinuityRecord,
    CipherContinuitySource,
    CipherContinuityStatus,
    CipherIdentitySafetyStatus,
    CipherPersonaMarker,
    CipherPolicyGuardReason,
    CipherSpokenMannerMarker,
    CipherPersonaAnchorRecord,
    CipherVoiceExpressionRecord,
    TelegramVoiceTurnRecord,
    TruthSurface,
)
from .parsers import (
    load_cipher_continuity_record,
    load_cipher_persona_anchor,
    load_cipher_voice_expression,
    load_telegram_voice_turn,
    load_truth_surface,
)


def _as_lower_strings(values: object) -> list[str]:
    if not isinstance(values, list):
        return []
    result: list[str] = []
    for value in values:
        if isinstance(value, str):
            result.append(value.lower())
    return result


def _contains_any(values: Iterable[str], needles: Iterable[str]) -> bool:
    haystack = set(values)
    return any(needle in haystack for needle in needles)


def _derive_default_tone(persona_anchor: dict[str, object], active_policy: dict[str, object]) -> str:
    tone = str(persona_anchor.get("tone", "")).lower()
    policy_text = " ".join(_as_lower_strings(active_policy.get("style_flags", [])))
    if "brisk" in tone or "brisk" in policy_text:
        return "brisk_guidance"
    if "warm" in tone:
        return "warm_guidance"
    return "calm_precision"


def _derive_persona_markers(
    *,
    default_tone: str,
    activation_ready: bool,
    active_policy: dict[str, object],
) -> list[CipherPersonaMarker]:
    markers: list[CipherPersonaMarker] = [
        "cipher_bloodline",
        "mission_control_governed",
        "support_safe",
        "owner_guidance",
    ]
    if activation_ready:
        markers.append("activation_ready")
    if default_tone == "calm_precision":
        markers.append("calm_precision")

    style_flags = _as_lower_strings(active_policy.get("style_flags", []))
    if _contains_any(style_flags, {"identity_guard_required", "bounded_identity_markers"}) and "calm_precision" not in markers:
        markers.append("calm_precision")

    ordered = [
        "cipher_bloodline",
        "mission_control_governed",
        "support_safe",
        "activation_ready",
        "owner_guidance",
        "calm_precision",
    ]
    return [marker for marker in ordered if marker in markers]


def _derive_policy_focus(active_policy: dict[str, object], drift_guard: bool, carryover: bool) -> list[str]:
    focus = [str(item) for item in active_policy.get("policy_focus", []) if isinstance(item, str)]
    style_flags = _as_lower_strings(active_policy.get("style_flags", []))
    if not focus:
        focus = ["support_safe_status_only"]
    if carryover and "carryover_allowed" not in focus:
        focus.append("carryover_allowed")
    if carryover and "bounded_identity_markers" not in focus:
        focus.append("bounded_identity_markers")
    if drift_guard and "identity_guard_required" not in focus:
        focus.append("identity_guard_required")
    if drift_guard and "style_restriction_enforced" not in focus:
        focus.append("style_restriction_enforced")
    if _contains_any(style_flags, {"policy_reason_visibility"}) and "policy_reason_visibility" not in focus:
        focus.append("policy_reason_visibility")
    return focus


def _derive_spoken_markers(
    *,
    voice_turn: TelegramVoiceTurnRecord,
    drift_guard: bool,
) -> tuple[list[CipherSpokenMannerMarker], str, str, str]:
    markers: list[CipherSpokenMannerMarker] = []
    voice_style = voice_turn["reply"]["voice_style"]
    if voice_style == "concierge_warm":
        markers.append("warmth")
        energy_label = "calm"
    else:
        markers.append("briskness")
        energy_label = "focused"

    continuity_status = voice_turn["continuity"]["continuity_status"]
    if continuity_status == "carryover":
        markers.append("carryover_callback")

    pacing_label = "measured"
    if continuity_status == "carryover":
        pacing_label = "steady"
    if voice_style == "concierge_brisk":
        pacing_label = "brisk"

    markers.append("measured_pacing")
    if voice_turn["reply"]["contains_action_prompt"] and not drift_guard:
        markers.append("confident_guidance")
    if drift_guard:
        markers.append("guarded_boundaries")
        energy_label = "focused"

    ordered = [
        "warmth",
        "briskness",
        "measured_pacing",
        "confident_guidance",
        "guarded_boundaries",
        "carryover_callback",
    ]
    return [marker for marker in ordered if marker in markers], pacing_label, energy_label, voice_style


def _derive_guardrail_reasons(
    *,
    active_policy: dict[str, object],
    voice_turn: TelegramVoiceTurnRecord,
    drift_guard: bool,
) -> list[CipherPolicyGuardReason]:
    reasons: list[CipherPolicyGuardReason] = []
    style_flags = _as_lower_strings(active_policy.get("style_flags", []))
    if _contains_any(style_flags, {"style_restriction_enforced", "policy_style_restriction"}):
        reasons.append("policy_style_restriction")
    if _contains_any(style_flags, {"identity_marker_conflict"}):
        reasons.append("identity_marker_conflict")
    if voice_turn["voice_turn_status"] == "blocked":
        reasons.append("voice_seam_guard")
    if drift_guard:
        reasons.append("drift_detected")
    return reasons or ["none"]


def derive_cipher_continuity(
    *,
    truth_surface: TruthSurface,
    voice_turn: TelegramVoiceTurnRecord,
    continuity_id: str,
    anchor_id: str,
    expression_id: str,
    continuity_notes: str,
    policy_summary: str,
    continuity_marker_summary: str,
    support_safe_voice_summary: str,
    carryover_source_ref: str | None = None,
) -> CipherContinuityRecord:
    """Compose a schema-valid Cipher continuity record from truth-surface and Telegram voice seams."""

    validated_truth_surface = load_truth_surface(truth_surface)
    validated_voice_turn = load_telegram_voice_turn(voice_turn)

    persona_anchor = validated_truth_surface["persona_anchor"]
    active_policy = validated_truth_surface["active_policy"]

    style_flags = _as_lower_strings(active_policy.get("style_flags", []))
    generic_drift_signals = _as_lower_strings(persona_anchor.get("generic_drift_signals", []))

    activation_ready = validated_voice_turn["voice_turn_status"] == "activation_ready"
    carryover = validated_voice_turn["continuity"]["continuity_status"] == "carryover"
    drift_guard = (
        validated_voice_turn["voice_turn_status"] == "blocked"
        or _contains_any(style_flags, {"identity_guard_required", "style_restriction_enforced", "policy_style_restriction"})
        or bool(generic_drift_signals)
    )

    continuity_status: CipherContinuityStatus = (
        "drift_guard" if drift_guard else "carryover" if carryover else "activation_ready"
    )
    continuity_source: CipherContinuitySource = (
        "truth_surface_only" if drift_guard else "cross_surface_carryover" if carryover else "telegram_voice_turn"
    )
    identity_safety_status: CipherIdentitySafetyStatus = (
        "guarded" if drift_guard else "identity_safe"
    )

    default_tone = _derive_default_tone(persona_anchor, active_policy)
    persona_markers = _derive_persona_markers(
        default_tone=default_tone,
        activation_ready=activation_ready,
        active_policy=active_policy,
    )
    policy_focus = _derive_policy_focus(active_policy, drift_guard=drift_guard, carryover=carryover)
    spoken_markers, pacing_label, energy_label, voice_style = _derive_spoken_markers(
        voice_turn=validated_voice_turn,
        drift_guard=drift_guard,
    )
    guardrail_reasons = _derive_guardrail_reasons(
        active_policy=active_policy,
        voice_turn=validated_voice_turn,
        drift_guard=drift_guard,
    )

    active_persona_anchor: CipherPersonaAnchorRecord = load_cipher_persona_anchor(
        {
            "anchor_id": anchor_id,
            "archetype": "cipher",
            "truth_source": "truth_surface.persona_anchor",
            "mission_control_mode": "governed",
            "default_tone": default_tone,
            "persona_markers": persona_markers,
            "policy_focus": policy_focus,
            "continuity_notes": continuity_notes,
        }
    )

    expression_source = "cross_surface_inference" if carryover or drift_guard else "telegram_voice_reply"
    active_voice_expression: CipherVoiceExpressionRecord = load_cipher_voice_expression(
        {
            "expression_id": expression_id,
            "source": expression_source,
            "voice_style": voice_style,
            "spoken_manner_markers": spoken_markers,
            "pacing_label": pacing_label,
            "energy_label": energy_label,
            "action_prompt_present": validated_voice_turn["reply"]["contains_action_prompt"] and not drift_guard,
            "support_safe_summary": support_safe_voice_summary,
        }
    )

    return load_cipher_continuity_record(
        {
            "continuity_id": continuity_id,
            "continuity_status": continuity_status,
            "continuity_source": continuity_source,
            "identity_safety_status": identity_safety_status,
            "drift_guard_triggered": drift_guard,
            "active_persona_anchor": active_persona_anchor,
            "active_voice_expression": active_voice_expression,
            "continuity_marker_summary": continuity_marker_summary,
            "carryover_source_ref": carryover_source_ref,
            "guardrail_reasons": guardrail_reasons,
            "policy_summary": policy_summary,
        }
    )
