from __future__ import annotations

from collections import defaultdict

from .behavior_signals import summarize_behavior_signals
from .contracts import (
    AdaptationDecisionSummary,
    BehaviorSignalEntry,
    DesignTeachingResearchRecord,
    FeedbackLedgerEntry,
    PreferenceRecord,
    ProvenanceLevel,
    SpecPrecedenceSummary,
    TasteAdaptationRecord,
    TasteSignalSummary,
)
from .parsers import (
    load_adaptation_decision_summary,
    load_design_teaching_research_record,
    load_feedback_ledger_entry,
    load_preference_record,
    load_spec_precedence_summary,
    load_taste_adaptation_record,
    load_taste_signal_summary,
    load_truth_surface,
)
from .precedence import resolve_precedence
from .promotion import evaluate_feedback_promotion


def _scope_for_target(target: str, preference_records: list[PreferenceRecord]) -> str:
    for preference in preference_records:
        if preference["rule"] == target:
            return preference["scope"]
    return "project"


def _provenance_for_target(
    target: str,
    preference_records: list[PreferenceRecord],
    feedback_entries: list[FeedbackLedgerEntry],
    fallback: ProvenanceLevel,
) -> ProvenanceLevel:
    for preference in preference_records:
        if preference["rule"] == target:
            return preference["provenance_level"]
    for feedback in feedback_entries:
        if feedback["target"] == target:
            return feedback["provenance"]
    return fallback


def _active_signal_from_preference(
    *,
    signal_id: str,
    target: str,
    preference: PreferenceRecord,
    precedence_reference: str,
    summary: str,
    rationale: str,
    warning_flags: list[str] | None = None,
) -> TasteSignalSummary:
    return load_taste_signal_summary(
        {
            "signal_id": signal_id,
            "status": "active",
            "target": target,
            "scope": preference["scope"],
            "source_kind": "preference_record",
            "source_reference": preference["preference_id"],
            "provenance_level": preference["provenance_level"],
            "evidence_class": "durable_preference",
            "summary": summary,
            "rationale": rationale,
            "suppression_reason": None,
            "precedence_reference": precedence_reference,
            "warning_flags": warning_flags or [],
        }
    )


def _suppressed_signal_from_preference(
    *,
    signal_id: str,
    target: str,
    preference: PreferenceRecord,
    precedence_reference: str,
    summary: str,
    rationale: str,
    suppression_reason: str,
    warning_flags: list[str] | None = None,
) -> TasteSignalSummary:
    return load_taste_signal_summary(
        {
            "signal_id": signal_id,
            "status": "suppressed",
            "target": target,
            "scope": preference["scope"],
            "source_kind": "preference_record",
            "source_reference": preference["preference_id"],
            "provenance_level": preference["provenance_level"],
            "evidence_class": "durable_preference",
            "summary": summary,
            "rationale": rationale,
            "suppression_reason": suppression_reason,
            "precedence_reference": precedence_reference,
            "warning_flags": warning_flags or [],
        }
    )


def _suppressed_signal_from_feedback(
    *,
    signal_id: str,
    target: str,
    feedback: FeedbackLedgerEntry,
    precedence_reference: str,
    summary: str,
    rationale: str,
    suppression_reason: str,
    warning_flags: list[str] | None = None,
) -> TasteSignalSummary:
    return load_taste_signal_summary(
        {
            "signal_id": signal_id,
            "status": "suppressed",
            "target": target,
            "scope": "owner",
            "source_kind": "feedback_ledger",
            "source_reference": feedback["feedback_id"],
            "provenance_level": feedback["provenance"],
            "evidence_class": "explicit_feedback",
            "summary": summary,
            "rationale": rationale,
            "suppression_reason": suppression_reason,
            "precedence_reference": precedence_reference,
            "warning_flags": warning_flags or [],
        }
    )


def _active_signal_from_design_record(
    *,
    signal_id: str,
    precedence_reference: str,
    design_teaching_research: DesignTeachingResearchRecord,
) -> TasteSignalSummary:
    research = design_teaching_research["research"]
    return load_taste_signal_summary(
        {
            "signal_id": signal_id,
            "status": "active",
            "target": "design",
            "scope": "project",
            "source_kind": "design_teaching_research",
            "source_reference": design_teaching_research["record_id"],
            "provenance_level": "hybrid-proven",
            "evidence_class": "derived_pattern",
            "summary": "Freshness guidance can inform this project pass, but it remains tied to bounded hybrid provenance.",
            "rationale": "Hybrid research produced useful bounded guidance for the current project without converting outside wins into generic owner memory.",
            "suppression_reason": None,
            "precedence_reference": precedence_reference,
            "warning_flags": ["promotion_guarded"],
        }
    )


def _suppressed_signal_from_behavior(
    *,
    signal_id: str,
    precedence_reference: str,
    behavior_signal: BehaviorSignalEntry,
) -> TasteSignalSummary:
    return load_taste_signal_summary(
        {
            "signal_id": signal_id,
            "status": "suppressed",
            "target": behavior_signal["target"],
            "scope": "owner",
            "source_kind": "behavior_signal",
            "source_reference": behavior_signal["signal_id"],
            "provenance_level": "hybrid-proven",
            "evidence_class": "behavior_signal",
            "summary": "A hybrid-assisted design win might look like owner taste at first glance.",
            "rationale": "Because the success depended on hybrid support, it cannot be laundered into durable owner memory without local confirmation.",
            "suppression_reason": "route_provenance_guard",
            "precedence_reference": precedence_reference,
            "warning_flags": ["promotion_guarded", "hybrid_not_promoted"],
        }
    )


def _precedence_summary(
    *,
    precedence_id: str,
    target: str,
    winner_source: str,
    winner_summary: str,
    reason: str,
    project_preference_applied: bool,
    owner_preference_applied: bool,
    feedback_applied: bool,
    suppressed_signal_id: str | None = None,
    suppression_reason: str | None = None,
) -> SpecPrecedenceSummary:
    return load_spec_precedence_summary(
        {
            "precedence_id": precedence_id,
            "target": target,
            "winner_source": winner_source,
            "winner_summary": winner_summary,
            "suppressed_signal_id": suppressed_signal_id,
            "suppression_reason": suppression_reason,
            "reason": reason,
            "project_preference_applied": project_preference_applied,
            "owner_preference_applied": owner_preference_applied,
            "feedback_applied": feedback_applied,
        }
    )


def _decision_summary(
    *,
    decision_id: str,
    decision_status: str,
    target: str,
    decision_summary: str,
    reason: str,
    evidence_class: str,
    source_reference: str,
    provenance_level: ProvenanceLevel,
    route_mode: str,
    warning_flags: list[str] | None = None,
) -> AdaptationDecisionSummary:
    return load_adaptation_decision_summary(
        {
            "decision_id": decision_id,
            "decision_status": decision_status,
            "target": target,
            "decision_summary": decision_summary,
            "reason": reason,
            "evidence_class": evidence_class,
            "source_reference": source_reference,
            "provenance_level": provenance_level,
            "route_mode": route_mode,
            "warning_flags": warning_flags or [],
        }
    )


def derive_taste_adaptation_record(
    *,
    record_id: str,
    design_teaching_research: DesignTeachingResearchRecord,
    truth_surface: dict,
    preference_records: list[PreferenceRecord],
    feedback_entries: list[FeedbackLedgerEntry],
    behavior_signals: list[BehaviorSignalEntry],
) -> TasteAdaptationRecord:
    design_record = load_design_teaching_research_record(design_teaching_research)
    validated_truth_surface = load_truth_surface(truth_surface)
    validated_preferences = [load_preference_record(preference) for preference in preference_records]
    validated_feedback = [load_feedback_ledger_entry(entry) for entry in feedback_entries]

    active_taste_signals: list[TasteSignalSummary] = []
    suppressed_taste_signals: list[TasteSignalSummary] = []
    preserved_decisions: list[AdaptationDecisionSummary] = []
    changed_decisions: list[AdaptationDecisionSummary] = []
    precedence_summaries: list[SpecPrecedenceSummary] = []

    preference_by_rule: dict[str, PreferenceRecord] = {preference["rule"]: preference for preference in validated_preferences}
    feedback_by_target: dict[str, list[FeedbackLedgerEntry]] = defaultdict(list)
    for entry in validated_feedback:
        feedback_by_target[entry["target"]].append(entry)

    behavior_by_target: dict[str, list[BehaviorSignalEntry]] = defaultdict(list)
    for signal in behavior_signals:
        behavior_by_target[signal["target"]].append(signal)

    route = design_record["harness"]["execution"]["route"]
    route_mode = route["mode"]

    if "design" in preference_by_rule:
        preference = preference_by_rule["design"]
        precedence_id = "precedence-design-project-001" if design_record["research"]["research_status"] == "blocked" else "precedence-design-project-002"
        active_signal_id = "taste-signal-design-project-001" if design_record["research"]["research_status"] == "blocked" else "taste-signal-design-project-002"
        active_taste_signals.append(
            _active_signal_from_preference(
                signal_id=active_signal_id,
                target="design",
                preference=preference,
                precedence_reference=precedence_id,
                summary="Project taste still favors restrained, less glossy design work." if design_record["research"]["research_status"] == "blocked" else "Project taste favors restrained, less glossy design direction.",
                rationale="Repeated local confirmations established a durable project preference that does not conflict with the current spec." if design_record["research"]["research_status"] == "blocked" else "Multiple project-level confirmations and clean acceptance kept this rule active.",
            )
        )
        precedence_summaries.append(
            _precedence_summary(
                precedence_id=precedence_id,
                target="design",
                winner_source="project_preference",
                winner_summary="Confirmed project preference for restrained design remains in force." if design_record["research"]["research_status"] == "blocked" else "Project preference for restrained design stayed active and matched the latest accepted work.",
                reason="No active spec conflict existed, so the stable project preference could stay active." if design_record["research"]["research_status"] == "blocked" else "Confirmed project taste and accepted behavior aligned, so no higher-priority source needed to override it.",
                project_preference_applied=True,
                owner_preference_applied=False,
                feedback_applied=bool(feedback_by_target.get("design")),
            )
        )
        design_feedback = feedback_by_target.get("design", [])
        design_behavior = behavior_by_target.get("design", [])
        if design_feedback:
            promotion = evaluate_feedback_promotion(
                design_feedback[0],
                project_repeat_count=1,
                cross_project_repeat_count=0,
                explicit_durable=False,
                safe_to_learn=True,
                behavior_signals=design_behavior,
            )
            evidence_class = "accepted_behavior" if promotion["supporting_signal_used"] else "durable_preference"
            reason = "Project taste, explicit feedback, and accepted behavior all pointed in the same direction." if evidence_class == "accepted_behavior" else "The confirmed project preference fit the current work and the active spec did not require a different direction."
        else:
            evidence_class = "durable_preference"
            reason = "The confirmed project preference fit the current work and the active spec did not require a different direction."
        preserved_decisions.append(
            _decision_summary(
                decision_id="adaptation-decision-preserved-design-001" if design_record["research"]["research_status"] == "blocked" else "adaptation-decision-design-preserved-002",
                decision_status="preserved",
                target="design",
                decision_summary="Preserve the restrained hero direction already aligned with project taste." if design_record["research"]["research_status"] == "blocked" else "Preserve the restrained hero and section pacing direction.",
                reason=reason,
                evidence_class=evidence_class,
                source_reference=active_signal_id,
                provenance_level=preference["provenance_level"],
                route_mode=route_mode,
            )
        )

    teaching_preference = preference_by_rule.get("teaching")
    if teaching_preference is not None:
        spec_value = validated_truth_surface.get("active_spec", {}).get("resolved_rules", {}).get("teaching")
        if spec_value is not None:
            suppressed_signal_id = "taste-signal-teaching-owner-001"
            precedence_id = "precedence-teaching-owner-001"
            suppressed_taste_signals.append(
                _suppressed_signal_from_preference(
                    signal_id=suppressed_signal_id,
                    target="teaching",
                    preference=teaching_preference,
                    precedence_reference=precedence_id,
                    summary="Owner often prefers more explanatory teaching during design passes.",
                    rationale="That taste signal remains visible, but the active deliverable asked for a concise support-safe response instead of a fuller lesson pass.",
                    suppression_reason="active_spec_override",
                    warning_flags=["suppressed_by_spec"],
                )
            )
            precedence_summaries.append(
                _precedence_summary(
                    precedence_id=precedence_id,
                    target="teaching",
                    winner_source="active_spec",
                    winner_summary="Active deliverable scope limits teaching detail for this turn.",
                    reason="Current project intent outranks learned teaching taste when the deliverable requires a concise response.",
                    project_preference_applied=False,
                    owner_preference_applied=False,
                    feedback_applied=False,
                    suppressed_signal_id=suppressed_signal_id,
                    suppression_reason="active_spec_override",
                )
            )
            changed_decisions.append(
                _decision_summary(
                    decision_id="adaptation-decision-changed-teaching-001",
                    decision_status="changed",
                    target="teaching",
                    decision_summary="Hold back the broader teaching layer for this turn.",
                    reason="The active spec narrowed the response, so the owner teaching signal stayed inspectable but did not control the output.",
                    evidence_class="spec_constraint",
                    source_reference=precedence_id,
                    provenance_level=teaching_preference["provenance_level"],
                    route_mode=route_mode,
                    warning_flags=["suppressed_by_spec"],
                )
            )
        else:
            active_signal_id = "taste-signal-teaching-owner-002"
            precedence_id = "precedence-teaching-owner-002"
            active_taste_signals.append(
                _active_signal_from_preference(
                    signal_id=active_signal_id,
                    target="teaching",
                    preference=teaching_preference,
                    precedence_reference=precedence_id,
                    summary="Owner likes more teaching while the work is being built.",
                    rationale="Owner-level confirmations remain active because this design-teaching pass explicitly allows explanation.",
                )
            )
            precedence_summaries.append(
                _precedence_summary(
                    precedence_id=precedence_id,
                    target="teaching",
                    winner_source="owner_preference",
                    winner_summary="Owner teaching preference remained active for this lesson-oriented pass.",
                    reason="The active deliverable allowed explanatory teaching, so the owner preference could stay visible and active.",
                    project_preference_applied=False,
                    owner_preference_applied=True,
                    feedback_applied=False,
                )
            )
            preserved_decisions.append(
                _decision_summary(
                    decision_id="adaptation-decision-teaching-preserved-002",
                    decision_status="preserved",
                    target="teaching",
                    decision_summary="Preserve the more explanatory teaching layer for this pass.",
                    reason="The owner teaching preference aligned with the current lesson-oriented deliverable.",
                    evidence_class="durable_preference",
                    source_reference=active_signal_id,
                    provenance_level=teaching_preference["provenance_level"],
                    route_mode=route_mode,
                )
            )

    routing_feedback = feedback_by_target.get("routing", [])
    if routing_feedback:
        feedback = routing_feedback[0]
        precedence_result = resolve_precedence("routing", validated_truth_surface, default="local-first")
        suppressed_signal_id = "taste-signal-routing-owner-001"
        precedence_id = "precedence-routing-owner-001"
        suppressed_taste_signals.append(
            _suppressed_signal_from_feedback(
                signal_id=suppressed_signal_id,
                target="routing",
                feedback=feedback,
                precedence_reference=precedence_id,
                summary="Owner recently asked to keep the work local when possible.",
                rationale="The request stayed visible, but there was not enough durable evidence to promote it beyond the current turn.",
                suppression_reason="insufficient_evidence",
            )
        )
        precedence_summaries.append(
            _precedence_summary(
                precedence_id=precedence_id,
                target="routing",
                winner_source="active_spec",
                winner_summary="Current routing policy stays local-first without creating a durable owner-memory rule from one turn.",
                reason="Single-turn routing feedback can guide the current run without automatically becoming durable owner taste.",
                project_preference_applied=False,
                owner_preference_applied=False,
                feedback_applied=False,
                suppressed_signal_id=suppressed_signal_id,
                suppression_reason="insufficient_evidence",
            )
        )
        changed_decisions.append(
            _decision_summary(
                decision_id="adaptation-decision-routing-changed-002",
                decision_status="changed",
                target="routing",
                decision_summary="Do not treat a single local-only request as durable owner memory.",
                reason="The request was useful for the current turn but lacked sufficient evidence for promotion into a stable preference.",
                evidence_class="explicit_feedback",
                source_reference=precedence_id,
                provenance_level=feedback["provenance"],
                route_mode=route_mode,
                warning_flags=["suppressed_by_spec"],
            )
        )

    if route_mode == "hybrid" and not route["learned_effect_allowed"]:
        active_signal_id = "taste-signal-research-freshness-001"
        precedence_id = "precedence-research-freshness-001"
        active_taste_signals.append(
            _active_signal_from_design_record(
                signal_id=active_signal_id,
                precedence_reference=precedence_id,
                design_teaching_research=design_record,
            )
        )
        precedence_summaries.append(
            _precedence_summary(
                precedence_id=precedence_id,
                target="design",
                winner_source="project_preference",
                winner_summary="Bounded project-scoped freshness guidance may stay active for this design pass.",
                reason="Hybrid help can inform the current project when explicitly disclosed, but the resulting signal remains project-scoped and guarded.",
                project_preference_applied=True,
                owner_preference_applied=False,
                feedback_applied=False,
            )
        )
        accepted_hybrid = next((signal for signal in behavior_by_target.get("design", []) if signal["source_route"] == "hybrid"), None)
        if accepted_hybrid is not None:
            suppressed_signal_id = "taste-signal-owner-memory-001"
            precedence_id = "precedence-owner-memory-001"
            suppressed_taste_signals.append(
                _suppressed_signal_from_behavior(
                    signal_id=suppressed_signal_id,
                    precedence_reference=precedence_id,
                    behavior_signal=accepted_hybrid,
                )
            )
            precedence_summaries.append(
                _precedence_summary(
                    precedence_id=precedence_id,
                    target="design",
                    winner_source="active_spec",
                    winner_summary="Memory-boundary policy blocks promotion of hybrid-assisted wins into owner taste without local proof.",
                    reason="The adaptation seam keeps hybrid provenance visible and useful without flattening it into generic owner memory.",
                    project_preference_applied=False,
                    owner_preference_applied=False,
                    feedback_applied=False,
                    suppressed_signal_id=suppressed_signal_id,
                    suppression_reason="route_provenance_guard",
                )
            )
            preserved_decisions.append(
                _decision_summary(
                    decision_id="adaptation-decision-freshness-preserved-001",
                    decision_status="preserved",
                    target="design",
                    decision_summary="Preserve the bounded freshness guidance for this specific project pass.",
                    reason="Hybrid research was disclosed and permitted for the current pass, so the derived project guidance could remain active without becoming owner memory.",
                    evidence_class="spec_constraint",
                    source_reference=active_signal_id,
                    provenance_level="hybrid-proven",
                    route_mode=route_mode,
                    warning_flags=["promotion_guarded"],
                )
            )
            changed_decisions.append(
                _decision_summary(
                    decision_id="adaptation-decision-owner-memory-changed-001",
                    decision_status="changed",
                    target="design",
                    decision_summary="Do not promote the hybrid-assisted success into durable owner taste.",
                    reason="Route provenance guarding keeps bounded hybrid wins inspectable while preventing them from masquerading as stable owner preference.",
                    evidence_class="accepted_behavior",
                    source_reference=precedence_id,
                    provenance_level="hybrid-proven",
                    route_mode=route_mode,
                    warning_flags=["promotion_guarded", "hybrid_not_promoted"],
                )
            )

    support_safe_summary_parts: list[str] = []
    if active_taste_signals:
        support_safe_summary_parts.append(
            f"active={', '.join(signal['target'] for signal in active_taste_signals)}"
        )
    if suppressed_taste_signals:
        support_safe_summary_parts.append(
            f"suppressed={', '.join(signal['target'] for signal in suppressed_taste_signals)}"
        )
    if route_mode == "hybrid":
        support_safe_summary_parts.append("hybrid provenance remains guarded")
    support_safe_summary = "; ".join(support_safe_summary_parts) or "No adaptation signals were derived."

    payload = {
        "record_id": record_id,
        "schema_family": "s06_taste_adaptation_memory_boundary",
        "design_teaching_research": design_record,
        "active_taste_signals": active_taste_signals,
        "suppressed_taste_signals": suppressed_taste_signals,
        "preserved_decisions": preserved_decisions,
        "changed_decisions": changed_decisions,
        "precedence_summaries": precedence_summaries,
        "support_safe_summary": support_safe_summary,
    }
    return load_taste_adaptation_record(payload)
