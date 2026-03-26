from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.disclosure import format_provenance_disclosure
from runtime_types.feedback_selection import select_relevant_feedback
from runtime_types.telegram_voice_loop import derive_telegram_voice_turn
from runtime_types.website_specialist_harness import derive_website_specialist_harness_record
from runtime_types.parsers import (
    load_adaptation_decision_summary,
    load_behavior_signal_entry,
    load_cipher_continuity_record,
    load_cipher_persona_anchor,
    load_cipher_voice_expression,
    load_concierge_claim_lifecycle,
    load_concierge_setup_guidance,
    load_design_research_summary,
    load_design_teaching_research_record,
    load_design_teaching_summary,
    load_runtime_step_artifacts,
    load_spec_precedence_summary,
    load_taste_adaptation_record,
    load_taste_signal_summary,
    load_telegram_voice_continuity,
    load_telegram_voice_reply,
    load_telegram_voice_transcript,
    load_telegram_voice_turn,
    load_truth_surface,
    load_routing_provenance_event,
    load_website_specialist_execution,
    load_website_specialist_harness_record,
    load_website_specialist_request,
)
from runtime_types.precedence import resolve_precedence
from runtime_types.promotion import evaluate_feedback_promotion
from runtime_types.promotion_audit import format_promotion_audit
from runtime_types.runtime_step import resolve_runtime_step
from runtime_types.schema_validation import validate_examples


def base_truth_surface() -> dict:
    return {
        "active_spec": {},
        "active_policy": {},
        "current_task": {},
        "persona_anchor": {},
        "routing_policy": {},
        "fallback_policy": {},
        "critique_policy": {},
        "revision_budget": {},
        "active_project_preferences": [],
        "active_owner_preferences": [],
        "recent_explicit_feedback": [],
        "recent_behavior_signals": [],
        "disclosure_state": {},
    }


def base_feedback() -> dict:
    return {
        "feedback_id": "f1",
        "feedback_text": "less glossy",
        "timestamp": "2026-03-20T00:00:00Z",
        "scope_requested": "turn",
        "target": "design",
        "polarity": "correction",
        "source": "user",
        "applied_to": "x",
        "promotion_status": "local-only",
        "provenance": "not-yet-proven",
    }


def concierge_lifecycle_payload() -> dict:
    return {
        "claim_id": "claim-concierge-001",
        "claimant_label": "demo-owner-cipher",
        "claim_status": "claimed",
        "setup_stage": "awaiting_device_setup",
        "blocking_reason": None,
        "manual_checkpoint": None,
        "activation_ready": False,
        "next_user_step": "Complete the device setup steps sent by support.",
        "setup_guidance": {
            "guidance_id": "guide-concierge-001",
            "guidance_status": "needs_user_action",
            "plain_language_summary": "Your claim is approved and the next step is device setup with support.",
            "next_user_step": "Complete the device setup steps sent by support.",
            "blocking_reason": None,
            "manual_checkpoint": None,
            "support_safe_notes": "Support is waiting for device setup confirmation before activation.",
        },
    }


def concierge_setup_guidance_payload() -> dict:
    return {
        "guidance_id": "guide-concierge-001",
        "guidance_status": "blocked",
        "plain_language_summary": "Support still needs to verify your identity before setup can continue.",
        "next_user_step": "Wait for support to confirm your identity and next steps.",
        "blocking_reason": "identity_verification_pending",
        "manual_checkpoint": "await_support_followup",
        "support_safe_notes": "Do not continue setup until support confirms the checkpoint is cleared.",
    }


def telegram_voice_transcript_payload() -> dict:
    return {
        "transcript_status": "available",
        "transcript_language": "en",
        "transcript_summary": "Owner asked whether activation can start after today's support check-in.",
        "intent_summary": "Confirm activation readiness and next support step.",
        "confidence_label": "high",
        "redaction_level": "support_safe_summary_only",
    }


def telegram_voice_reply_payload() -> dict:
    return {
        "reply_status": "voiced",
        "delivery_channel": "telegram_voice_note",
        "voice_style": "concierge_warm",
        "reply_summary": "Explains that activation can proceed once support confirms the final checkpoint.",
        "audio_duration_seconds": 18,
        "contains_action_prompt": True,
    }


def telegram_voice_continuity_payload() -> dict:
    return {
        "continuity_status": "same_session",
        "session_reference": "tg-session-042",
        "turns_in_session": 3,
        "carryover_summary": "Continues the same activation thread from the owner's earlier voice note.",
        "prior_turn_reference": "tg-turn-041",
        "memory_scope": "session_only",
    }


def telegram_voice_turn_payload() -> dict:
    return {
        "voice_turn_id": "tg-turn-042",
        "platform": "telegram",
        "chat_id": "tg-chat-1001",
        "user_id": "tg-user-88",
        "voice_message_id": "tg-voice-msg-42",
        "voice_turn_status": "activation_ready",
        "activation_gate_status": "ready",
        "blocked_reason": None,
        "support_safe_status_summary": "Activation is ready and the owner received a voiced next-step reply.",
        "inbound_voice_note": {
            "telegram_file_id": "file_abc123",
            "telegram_file_unique_id": "unique_abc123",
            "audio_duration_seconds": 21,
            "mime_type": "audio/ogg",
            "message_timestamp": "2026-03-21T12:00:00Z",
            "source": "telegram_voice_note",
        },
        "transcript": telegram_voice_transcript_payload(),
        "reply": telegram_voice_reply_payload(),
        "continuity": telegram_voice_continuity_payload(),
    }
def website_specialist_request_payload() -> dict:
    return {
        "request_id": "ws-request-001",
        "request_source": "telegram_voice_turn",
        "request_status": "activation_ready",
        "support_safe_request_summary": "Owner wants Cipher to help with a website update after activation was confirmed.",
        "desired_outcome_summary": "Prepare the next website-specialist step while preserving Cipher continuity and route honesty.",
        "activation_ready": True,
        "activation_ref": "claim-concierge-001",
        "voice_turn_ref": "tg-turn-042",
        "continuity_ref": "cipher-continuity-carryover-001",
        "requested_capability": "website_update",
    }


def website_specialist_execution_payload() -> dict:
    return {
        "execution_id": "ws-execution-001",
        "specialist_status": "completed",
        "task_phase": "fulfilled",
        "route": {
            "event_id": "route-website-001",
            "provider": "local-runtime",
            "model": "llama-local",
            "mode": "local",
            "route_reason": "Local website specialist satisfied the request without escalation.",
            "fallback_used": False,
            "fallback_refused": False,
            "learned_effect_allowed": True,
        },
        "disclosure_level": "brief",
        "disclosure_text": "This website step stayed on the local specialist path.",
        "support_safe_status_summary": "Website-specialist work completed locally with bounded continuity markers.",
        "continuity_carryover_refs": ["tg-session-042", "cipher-continuity-carryover-001"],
        "persona_markers": ["cipher_bloodline", "support_safe", "calm_precision"],
        "spoken_manner_markers": ["warmth", "measured_pacing", "carryover_callback"],
        "fallback_refused": False,
    }


def website_specialist_harness_payload() -> dict:
    return {
        "harness_id": "ws-harness-001",
        "request": website_specialist_request_payload(),
        "execution": website_specialist_execution_payload(),
        "support_safe_outcome_summary": "Local website-specialist execution completed with continuity intact and no external fallback.",
        "activation_handoff_status": "activation_ready",
    }


def design_teaching_summary_payload() -> dict:
    return {
        "teaching_status": "available",
        "lesson_summary": "Explains why stronger hierarchy and tighter section pacing would make the page feel more intentional.",
        "design_choice_explanation": "Connect the visual treatment to a clearer concept so the page reads designed instead of assembled.",
        "anti_slop_rationale": "Avoid generic hero-feature boilerplate and trend cargo culting by grounding advice in hierarchy, pacing, and purpose.",
        "next_step_guidance": "Revise the hero and first supporting section before introducing any extra decorative flourishes.",
    }


def design_research_summary_payload() -> dict:
    return {
        "research_status": "local_only",
        "provenance_mode": "local",
        "freshness_label": "not_applicable",
        "disclosure_level": "none",
        "disclosure_text": "No current-reference research was needed for this teaching pass.",
        "signal_summary": "Uses only local design-rubric and bounded synthesis signals already available in the runtime.",
        "provenance_summary": "No external or hybrid reference gathering occurred for this record.",
    }


def design_teaching_research_record_payload() -> dict:
    return {
        "record_id": "design-teaching-research-001",
        "schema_family": "s05_design_teaching_research",
        "harness": website_specialist_harness_payload(),
        "teaching": design_teaching_summary_payload(),
        "research": design_research_summary_payload(),
        "support_safe_summary": "Cipher can explain the design direction using local teaching signals without claiming live research occurred.",
    }


def taste_signal_summary_payload() -> dict:
    return {
        "signal_id": "taste-signal-001",
        "status": "active",
        "target": "design",
        "scope": "project",
        "source_kind": "preference_record",
        "source_reference": "pref-project-001",
        "provenance_level": "local-proven",
        "evidence_class": "durable_preference",
        "summary": "Project favors restrained, less glossy design direction.",
        "rationale": "Repeated local confirmations established a durable project taste signal.",
        "suppression_reason": None,
        "precedence_reference": "precedence-design-001",
        "warning_flags": [],
    }


def adaptation_decision_summary_payload() -> dict:
    return {
        "decision_id": "adaptation-decision-001",
        "decision_status": "preserved",
        "target": "design",
        "decision_summary": "Preserve the restrained hero treatment that already matches confirmed project taste.",
        "reason": "The prior design direction matched current project taste and the active spec did not require a change.",
        "evidence_class": "accepted_behavior",
        "source_reference": "taste-signal-001",
        "provenance_level": "local-proven",
        "route_mode": "local",
        "warning_flags": [],
    }


def spec_precedence_summary_payload() -> dict:
    return {
        "precedence_id": "precedence-design-001",
        "target": "design",
        "winner_source": "active_spec",
        "winner_summary": "Active website spec requires a documentation-first layout treatment.",
        "suppressed_signal_id": "taste-signal-002",
        "suppression_reason": "active_spec_override",
        "reason": "The current project spec is more specific than the learned taste signal for this turn.",
        "project_preference_applied": False,
        "owner_preference_applied": False,
        "feedback_applied": False,
    }


def taste_adaptation_record_payload() -> dict:
    return {
        "record_id": "taste-adaptation-record-001",
        "schema_family": "s06_taste_adaptation_memory_boundary",
        "design_teaching_research": design_teaching_research_record_payload(),
        "active_taste_signals": [taste_signal_summary_payload()],
        "suppressed_taste_signals": [
            {
                **taste_signal_summary_payload(),
                "signal_id": "taste-signal-002",
                "status": "suppressed",
                "scope": "owner",
                "source_kind": "feedback_ledger",
                "source_reference": "fb-202",
                "provenance_level": "hybrid-proven",
                "evidence_class": "explicit_feedback",
                "summary": "Owner often prefers more explanatory teaching during design passes.",
                "rationale": "Recent owner feedback suggests a stronger teaching layer, but the current spec narrowed the deliverable.",
                "suppression_reason": "active_spec_override",
                "warning_flags": [],
            }
        ],
        "preserved_decisions": [adaptation_decision_summary_payload()],
        "changed_decisions": [
            {
                **adaptation_decision_summary_payload(),
                "decision_id": "adaptation-decision-002",
                "decision_status": "changed",
                "target": "teaching",
                "decision_summary": "Reduce explanatory teaching for this deliverable.",
                "reason": "The active spec requested a concise output, so the owner teaching preference stayed visible but suppressed.",
                "evidence_class": "spec_constraint",
                "source_reference": "precedence-teaching-001",
                "provenance_level": "hybrid-proven",
                "route_mode": "hybrid",
                "warning_flags": ["suppressed_by_spec"],
            }
        ],
        "precedence_summaries": [
            spec_precedence_summary_payload(),
            {
                **spec_precedence_summary_payload(),
                "precedence_id": "precedence-teaching-001",
                "target": "teaching",
                "winner_summary": "Active deliverable scope limits teaching detail in this turn.",
                "suppressed_signal_id": "taste-signal-002",
            },
        ],
        "support_safe_summary": "Adaptation preserved confirmed restrained design taste, suppressed broader teaching taste because the active spec narrowed this deliverable, and kept provenance warnings explicit.",
    }


class TasteAdaptationParserTests(unittest.TestCase):
    def test_load_taste_signal_summary_accepts_valid_payload(self) -> None:
        result = load_taste_signal_summary(taste_signal_summary_payload())

        self.assertEqual(result["status"], "active")
        self.assertEqual(result["source_kind"], "preference_record")

    def test_load_adaptation_decision_summary_accepts_valid_payload(self) -> None:
        result = load_adaptation_decision_summary(adaptation_decision_summary_payload())

        self.assertEqual(result["decision_status"], "preserved")
        self.assertEqual(result["route_mode"], "local")

    def test_load_spec_precedence_summary_accepts_valid_payload(self) -> None:
        result = load_spec_precedence_summary(spec_precedence_summary_payload())

        self.assertEqual(result["winner_source"], "active_spec")
        self.assertEqual(result["suppression_reason"], "active_spec_override")

    def test_load_taste_adaptation_record_accepts_valid_payload(self) -> None:
        result = load_taste_adaptation_record(taste_adaptation_record_payload())

        self.assertEqual(result["schema_family"], "s06_taste_adaptation_memory_boundary")
        self.assertEqual(len(result["active_taste_signals"]), 1)
        self.assertEqual(len(result["suppressed_taste_signals"]), 1)

    def test_load_taste_signal_summary_rejects_raw_feedback_leak(self) -> None:
        payload = taste_signal_summary_payload()
        payload["raw_feedback_text"] = "less glossy. exact owner words."

        with self.assertRaises(ValueError):
            load_taste_signal_summary(payload)

    def test_load_adaptation_decision_summary_rejects_invalid_warning_flag(self) -> None:
        payload = adaptation_decision_summary_payload()
        payload["warning_flags"] = ["mystery-warning"]

        with self.assertRaises(ValueError):
            load_adaptation_decision_summary(payload)

    def test_load_spec_precedence_summary_rejects_invalid_suppression_reason(self) -> None:
        payload = spec_precedence_summary_payload()
        payload["suppression_reason"] = "mystery_reason"

        with self.assertRaises(ValueError):
            load_spec_precedence_summary(payload)

    def test_load_taste_adaptation_record_rejects_private_memory_leak_field(self) -> None:
        payload = taste_adaptation_record_payload()
        payload["private_memory_payload"] = {"secret": "unsafe memory dump"}

        with self.assertRaises(ValueError):
            load_taste_adaptation_record(payload)

    def test_load_taste_adaptation_record_accepts_spec_suppressed_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "taste-adaptation-record.spec-suppressed.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_taste_adaptation_record(payload)

        self.assertEqual(result["suppressed_taste_signals"][0]["suppression_reason"], "active_spec_override")
        self.assertEqual(result["precedence_summaries"][1]["winner_source"], "active_spec")

    def test_load_taste_adaptation_record_accepts_preserved_decisions_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "taste-adaptation-record.preserved-decisions.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_taste_adaptation_record(payload)

        self.assertEqual(result["preserved_decisions"][0]["decision_status"], "preserved")
        self.assertEqual(result["changed_decisions"][0]["warning_flags"], ["suppressed_by_spec"])

    def test_load_taste_adaptation_record_accepts_hybrid_guarded_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "taste-adaptation-record.hybrid-guarded.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_taste_adaptation_record(payload)

        self.assertEqual(result["active_taste_signals"][0]["warning_flags"], ["promotion_guarded"])
        self.assertIn("hybrid", result["support_safe_summary"].lower())


class DesignTeachingResearchParserTests(unittest.TestCase):
    def test_load_design_teaching_summary_accepts_valid_payload(self) -> None:
        result = load_design_teaching_summary(design_teaching_summary_payload())

        self.assertEqual(result["teaching_status"], "available")
        self.assertIn("hierarchy", result["lesson_summary"].lower())

    def test_load_design_research_summary_accepts_valid_payload(self) -> None:
        result = load_design_research_summary(design_research_summary_payload())

        self.assertEqual(result["research_status"], "local_only")
        self.assertEqual(result["provenance_mode"], "local")

    def test_load_design_teaching_research_record_accepts_valid_payload(self) -> None:
        result = load_design_teaching_research_record(design_teaching_research_record_payload())

        self.assertEqual(result["schema_family"], "s05_design_teaching_research")
        self.assertEqual(result["harness"]["execution"]["route"]["mode"], "local")

    def test_load_design_teaching_summary_rejects_unsafe_extra_field(self) -> None:
        payload = design_teaching_summary_payload()
        payload["raw_critique_dump"] = "full critique transcript"

        with self.assertRaises(ValueError):
            load_design_teaching_summary(payload)

    def test_load_design_research_summary_rejects_raw_reference_dump(self) -> None:
        payload = design_research_summary_payload()
        payload["raw_reference_dump"] = ["https://example.com/a", "https://example.com/b"]

        with self.assertRaises(ValueError):
            load_design_research_summary(payload)

    def test_load_design_teaching_research_record_rejects_missing_disclosure_field(self) -> None:
        payload = design_teaching_research_record_payload()
        del payload["research"]["disclosure_text"]

        with self.assertRaises(ValueError):
            load_design_teaching_research_record(payload)

    def test_load_design_teaching_research_record_rejects_missing_freshness_label(self) -> None:
        payload = design_teaching_research_record_payload()
        del payload["research"]["freshness_label"]

        with self.assertRaises(ValueError):
            load_design_teaching_research_record(payload)

    def test_load_design_teaching_research_record_rejects_private_memory_leak_field(self) -> None:
        payload = design_teaching_research_record_payload()
        payload["private_memory_payload"] = {"secret": "support-safe seams must never expose this"}

        with self.assertRaises(ValueError):
            load_design_teaching_research_record(payload)

    def test_load_design_teaching_research_record_rejects_invalid_schema_family(self) -> None:
        payload = design_teaching_research_record_payload()
        payload["schema_family"] = "s04_website_specialist_harness"

        with self.assertRaises(ValueError):
            load_design_teaching_research_record(payload)

    def test_load_design_teaching_research_record_accepts_local_teaching_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "design-teaching-research-record.local-teaching.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_design_teaching_research_record(payload)

        self.assertEqual(result["teaching"]["teaching_status"], "available")
        self.assertEqual(result["research"]["research_status"], "local_only")

    def test_load_design_teaching_research_record_accepts_hybrid_research_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "design-teaching-research-record.hybrid-research.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_design_teaching_research_record(payload)

        self.assertEqual(result["research"]["research_status"], "hybrid_support")
        self.assertEqual(result["research"]["disclosure_level"], "explicit")

    def test_load_design_teaching_research_record_accepts_blocked_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "design-teaching-research-record.blocked.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_design_teaching_research_record(payload)

        self.assertEqual(result["teaching"]["teaching_status"], "suppressed")
        self.assertEqual(result["research"]["research_status"], "blocked")


class FeedbackSelectionTests(unittest.TestCase):
    def test_prefers_turn_scope_over_broader_scope_when_both_match(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-project",
                "feedback_text": "less glossy at the project level",
                "scope_requested": "project",
                "target": "design",
                "timestamp": "2026-03-20T00:00:00Z",
            },
            {
                **base_feedback(),
                "feedback_id": "f-turn",
                "feedback_text": "less glossy for this turn",
                "scope_requested": "turn",
                "target": "design",
                "timestamp": "2026-03-19T00:00:00Z",
            },
        ]

        result = select_relevant_feedback("design", ts)

        self.assertIsNotNone(result)
        self.assertEqual(result["feedback_id"], "f-turn")

    def test_ignores_expired_and_rejected_feedback(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-expired",
                "promotion_status": "expired",
                "target": "design",
            },
            {
                **base_feedback(),
                "feedback_id": "f-rejected",
                "promotion_status": "rejected",
                "target": "design",
            },
        ]

        result = select_relevant_feedback("design", ts)

        self.assertIsNone(result)

    def test_prefers_more_recent_feedback_when_scope_is_equal(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-old",
                "feedback_text": "older feedback",
                "scope_requested": "turn",
                "target": "design",
                "timestamp": "2026-03-19T00:00:00Z",
            },
            {
                **base_feedback(),
                "feedback_id": "f-new",
                "feedback_text": "newer feedback",
                "scope_requested": "turn",
                "target": "design",
                "timestamp": "2026-03-20T00:00:00Z",
            },
        ]

        result = select_relevant_feedback("design", ts)

        self.assertIsNotNone(result)
        self.assertEqual(result["feedback_id"], "f-new")


class ParserBoundaryTests(unittest.TestCase):
    def test_load_behavior_signal_entry_accepts_valid_payload(self) -> None:
        payload = {
            "signal_id": "sig-201",
            "timestamp": "2026-03-20T18:50:00Z",
            "target": "design",
            "signal_type": "user_repair",
            "strength": 0.9,
            "applied_to": "example-task-001",
            "source_route": "local",
            "notes": "User manually simplified the generated hero treatment after review.",
        }

        result = load_behavior_signal_entry(payload)

        self.assertEqual(result["signal_type"], "user_repair")
        self.assertEqual(result["target"], "design")

    def test_load_behavior_signal_entry_rejects_invalid_signal_type(self) -> None:
        payload = {
            "signal_id": "sig-bad",
            "timestamp": "2026-03-20T18:50:00Z",
            "target": "design",
            "signal_type": "mystery_signal",
            "strength": 0.9,
            "applied_to": "example-task-001",
            "source_route": "local",
            "notes": "Invalid signal type.",
        }

        with self.assertRaises(ValueError):
            load_behavior_signal_entry(payload)

    def test_load_truth_surface_requires_recent_behavior_signals(self) -> None:
        payload = base_truth_surface()
        del payload["recent_behavior_signals"]

        with self.assertRaises(ValueError):
            load_truth_surface(payload)

    def test_load_truth_surface_accepts_repo_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "truth-surface.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_truth_surface(payload)

        self.assertEqual(result["current_task"]["task_id"], "example-task-001")
        self.assertEqual(len(result["recent_explicit_feedback"]), 2)
        self.assertEqual(len(result["recent_behavior_signals"]), 2)

    def test_load_concierge_claim_lifecycle_accepts_valid_payload(self) -> None:
        result = load_concierge_claim_lifecycle(concierge_lifecycle_payload())

        self.assertEqual(result["claim_status"], "claimed")
        self.assertEqual(result["setup_stage"], "awaiting_device_setup")
        self.assertEqual(result["setup_guidance"]["guidance_status"], "needs_user_action")

    def test_load_concierge_setup_guidance_accepts_valid_payload(self) -> None:
        result = load_concierge_setup_guidance(concierge_setup_guidance_payload())

        self.assertEqual(result["guidance_status"], "blocked")
        self.assertEqual(result["manual_checkpoint"], "await_support_followup")

    def test_load_concierge_claim_lifecycle_rejects_invalid_claim_status(self) -> None:
        payload = concierge_lifecycle_payload()
        payload["claim_status"] = "mystery"

        with self.assertRaises(ValueError):
            load_concierge_claim_lifecycle(payload)

    def test_load_telegram_voice_transcript_accepts_valid_payload(self) -> None:
        result = load_telegram_voice_transcript(telegram_voice_transcript_payload())

        self.assertEqual(result["transcript_status"], "available")
        self.assertEqual(result["confidence_label"], "high")

    def test_load_telegram_voice_reply_accepts_valid_payload(self) -> None:
        result = load_telegram_voice_reply(telegram_voice_reply_payload())

        self.assertEqual(result["reply_status"], "voiced")
        self.assertTrue(result["contains_action_prompt"])

    def test_load_telegram_voice_continuity_accepts_valid_payload(self) -> None:
        result = load_telegram_voice_continuity(telegram_voice_continuity_payload())

        self.assertEqual(result["continuity_status"], "same_session")
        self.assertEqual(result["memory_scope"], "session_only")

    def test_load_telegram_voice_turn_accepts_valid_payload(self) -> None:
        result = load_telegram_voice_turn(telegram_voice_turn_payload())

        self.assertEqual(result["voice_turn_status"], "activation_ready")
        self.assertEqual(result["activation_gate_status"], "ready")
        self.assertEqual(result["reply"]["reply_status"], "voiced")

    def test_load_telegram_voice_turn_rejects_invalid_gate_status(self) -> None:
        payload = telegram_voice_turn_payload()
        payload["activation_gate_status"] = "maybe"

        with self.assertRaises(ValueError):
            load_telegram_voice_turn(payload)

    def test_load_telegram_voice_turn_rejects_raw_transcript_leak_field(self) -> None:
        payload = telegram_voice_turn_payload()
        payload["transcript"]["raw_transcript_text"] = "full verbatim transcript"

        with self.assertRaises(ValueError):
            load_telegram_voice_turn(payload)

    def test_load_telegram_voice_reply_rejects_missing_required_field(self) -> None:
        payload = telegram_voice_reply_payload()
        del payload["reply_summary"]

        with self.assertRaises(ValueError):
            load_telegram_voice_reply(payload)

    def test_load_telegram_voice_continuity_rejects_invalid_status(self) -> None:
        payload = telegram_voice_continuity_payload()
        payload["continuity_status"] = "unknown"

        with self.assertRaises(ValueError):
            load_telegram_voice_continuity(payload)

    def test_load_telegram_voice_turn_accepts_blocked_repo_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "telegram-voice-turn.blocked.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_telegram_voice_turn(payload)

        self.assertEqual(result["voice_turn_status"], "blocked")
        self.assertEqual(result["activation_gate_status"], "blocked")

    def test_load_cipher_persona_anchor_accepts_activation_fixture_fragment(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "cipher-continuity-record.activation-ready.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_cipher_persona_anchor(payload["active_persona_anchor"])

        self.assertEqual(result["archetype"], "cipher")
        self.assertIn("mission_control_governed", result["persona_markers"])

    def test_load_cipher_voice_expression_accepts_carryover_fixture_fragment(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "cipher-continuity-record.carryover.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_cipher_voice_expression(payload["active_voice_expression"])

        self.assertEqual(result["source"], "cross_surface_inference")
        self.assertIn("carryover_callback", result["spoken_manner_markers"])

    def test_load_cipher_continuity_record_accepts_activation_ready_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "cipher-continuity-record.activation-ready.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_cipher_continuity_record(payload)

        self.assertEqual(result["continuity_status"], "activation_ready")
        self.assertEqual(result["identity_safety_status"], "identity_safe")
        self.assertEqual(result["active_voice_expression"]["voice_style"], "concierge_warm")

    def test_load_cipher_continuity_record_accepts_carryover_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "cipher-continuity-record.carryover.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_cipher_continuity_record(payload)

        self.assertEqual(result["continuity_status"], "carryover")
        self.assertEqual(result["continuity_source"], "cross_surface_carryover")
        self.assertEqual(result["carryover_source_ref"], "tg-session-042")

    def test_load_cipher_continuity_record_accepts_drift_guard_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "cipher-continuity-record.drift-guard.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_cipher_continuity_record(payload)

        self.assertEqual(result["continuity_status"], "drift_guard")
        self.assertTrue(result["drift_guard_triggered"])
        self.assertIn("drift_detected", result["guardrail_reasons"])

    def test_load_cipher_continuity_record_rejects_raw_transcript_leak_field(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "cipher-continuity-record.activation-ready.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))
        payload["active_voice_expression"]["raw_transcript_text"] = "full transcript should never appear here"

        with self.assertRaises(ValueError):
            load_cipher_continuity_record(payload)

    def test_load_cipher_continuity_record_rejects_private_memory_leak_field(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "cipher-continuity-record.carryover.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))
        payload["private_memory_payload"] = {"secret": "hidden detail"}

        with self.assertRaises(ValueError):
            load_cipher_continuity_record(payload)

    def test_load_cipher_voice_expression_rejects_invalid_marker(self) -> None:
        payload = {
            "expression_id": "bad-expression-001",
            "source": "telegram_voice_reply",
            "voice_style": "concierge_warm",
            "spoken_manner_markers": ["warmth", "improv_riffing"],
            "pacing_label": "measured",
            "energy_label": "calm",
            "action_prompt_present": False,
            "support_safe_summary": "Invalid marker payload.",
        }

        with self.assertRaises(ValueError):
            load_cipher_voice_expression(payload)

    def test_load_cipher_persona_anchor_rejects_invalid_archetype(self) -> None:
        payload = {
            "anchor_id": "bad-anchor-001",
            "archetype": "assistant",
            "truth_source": "truth_surface.persona_anchor",
            "mission_control_mode": "governed",
            "default_tone": "calm_precision",
            "persona_markers": ["cipher_bloodline", "support_safe"],
            "policy_focus": ["support_safe_status_only"],
            "continuity_notes": "Invalid archetype payload.",
        }

        with self.assertRaises(ValueError):
            load_cipher_persona_anchor(payload)

    def test_load_website_specialist_request_accepts_valid_payload(self) -> None:
        result = load_website_specialist_request(website_specialist_request_payload())

        self.assertEqual(result["request_status"], "activation_ready")
        self.assertEqual(result["requested_capability"], "website_update")

    def test_load_website_specialist_execution_accepts_valid_payload(self) -> None:
        result = load_website_specialist_execution(website_specialist_execution_payload())

        self.assertEqual(result["specialist_status"], "completed")
        self.assertEqual(result["route"]["mode"], "local")
        self.assertFalse(result["fallback_refused"])

    def test_load_website_specialist_harness_record_accepts_valid_payload(self) -> None:
        result = load_website_specialist_harness_record(website_specialist_harness_payload())

        self.assertEqual(result["request"]["request_source"], "telegram_voice_turn")
        self.assertEqual(result["execution"]["task_phase"], "fulfilled")

    def test_load_website_specialist_request_rejects_private_memory_leak_field(self) -> None:
        payload = website_specialist_request_payload()
        payload["private_memory_payload"] = {"secret": "keep out of support-safe records"}

        with self.assertRaises(ValueError):
            load_website_specialist_request(payload)

    def test_load_website_specialist_execution_rejects_raw_transcript_leak_field(self) -> None:
        payload = website_specialist_execution_payload()
        payload["raw_transcript_text"] = "verbatim owner transcript"

        with self.assertRaises(ValueError):
            load_website_specialist_execution(payload)

    def test_load_website_specialist_harness_record_rejects_extra_top_level_field(self) -> None:
        payload = website_specialist_harness_payload()
        payload["raw_memory_dump"] = "should never validate"

        with self.assertRaises(ValueError):
            load_website_specialist_harness_record(payload)

    def test_load_website_specialist_harness_record_accepts_local_success_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "website-specialist-harness-record.local-success.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_website_specialist_harness_record(payload)

        self.assertEqual(result["execution"]["route"]["mode"], "local")
        self.assertEqual(result["execution"]["disclosure_level"], "brief")

    def test_load_website_specialist_harness_record_accepts_hybrid_escalation_example_fixture(self) -> None:
        example_path = ROOT / "schemas" / "examples" / "website-specialist-harness-record.hybrid-escalation.example.json"
        payload = json.loads(example_path.read_text(encoding="utf-8"))

        result = load_website_specialist_harness_record(payload)

        self.assertEqual(result["execution"]["route"]["mode"], "hybrid")
        self.assertEqual(result["execution"]["disclosure_level"], "explicit")

    def test_derive_website_specialist_harness_record_composes_validated_upstream_records(self) -> None:
        lifecycle = load_concierge_claim_lifecycle(
            {
                "claim_id": "claim-concierge-001",
                "claimant_label": "demo-owner-cipher",
                "claim_status": "activation_ready",
                "setup_stage": "setup_complete",
                "blocking_reason": None,
                "manual_checkpoint": None,
                "activation_ready": True,
                "next_user_step": "Reply to support to schedule activation.",
                "setup_guidance": {
                    "guidance_id": "guide-concierge-001",
                    "guidance_status": "ready",
                    "plain_language_summary": "Everything is complete and you are ready to schedule activation.",
                    "next_user_step": "Reply to support to schedule activation.",
                    "blocking_reason": None,
                    "manual_checkpoint": None,
                    "support_safe_notes": "Support can now schedule the activation handoff.",
                },
            }
        )
        voice_turn = load_telegram_voice_turn(telegram_voice_turn_payload())
        continuity = load_cipher_continuity_record(
            json.loads(
                (ROOT / "schemas" / "examples" / "cipher-continuity-record.carryover.example.json").read_text(
                    encoding="utf-8"
                )
            )
        )
        route_event = load_routing_provenance_event(
            {
                "event_id": "route-local-success-derived-001",
                "provider": "local-runtime",
                "model": "llama-local",
                "mode": "local",
                "route_reason": "Local website specialist completed the request without external help.",
                "fallback_used": False,
                "fallback_refused": False,
                "learned_effect_allowed": True,
            }
        )

        result = derive_website_specialist_harness_record(
            harness_id="ws-harness-local-success-derived-001",
            request_id="ws-request-local-success-derived-001",
            execution_id="ws-execution-local-success-derived-001",
            lifecycle=lifecycle,
            voice_turn=voice_turn,
            continuity=continuity,
            route_event=route_event,
            requested_capability="website_update",
            request_source="telegram_voice_turn",
            support_safe_request_summary="Owner wants Cipher to help with a website update after activation was confirmed.",
            desired_outcome_summary="Prepare the next website-specialist step while preserving Cipher continuity and route honesty.",
        )

        self.assertEqual(result["request"]["request_status"], "activation_ready")
        self.assertEqual(result["execution"]["route"]["mode"], "local")
        self.assertEqual(result["execution"]["disclosure_level"], "brief")
        self.assertIn("cipher_bloodline", result["execution"]["persona_markers"])
        self.assertIn("tg-session-042", result["execution"]["continuity_carryover_refs"])

    def test_derive_website_specialist_harness_record_reports_fallback_refusal_honestly(self) -> None:
        lifecycle = load_concierge_claim_lifecycle(
            {
                "claim_id": "claim-concierge-001",
                "claimant_label": "demo-owner-cipher",
                "claim_status": "activation_ready",
                "setup_stage": "setup_complete",
                "blocking_reason": None,
                "manual_checkpoint": None,
                "activation_ready": True,
                "next_user_step": "Reply to support to schedule activation.",
                "setup_guidance": {
                    "guidance_id": "guide-concierge-001",
                    "guidance_status": "ready",
                    "plain_language_summary": "Everything is complete and you are ready to schedule activation.",
                    "next_user_step": "Reply to support to schedule activation.",
                    "blocking_reason": None,
                    "manual_checkpoint": None,
                    "support_safe_notes": "Support can now schedule the activation handoff.",
                },
            }
        )
        voice_turn = load_telegram_voice_turn(telegram_voice_turn_payload())
        continuity = load_cipher_continuity_record(
            json.loads(
                (ROOT / "schemas" / "examples" / "cipher-continuity-record.carryover.example.json").read_text(
                    encoding="utf-8"
                )
            )
        )
        route_event = load_routing_provenance_event(
            {
                "event_id": "route-fallback-refused-001",
                "provider": "local-runtime",
                "model": "llama-local",
                "mode": "local",
                "route_reason": "Local specialist could not expand coverage because external fallback was refused.",
                "fallback_used": False,
                "fallback_refused": True,
                "learned_effect_allowed": False,
            }
        )

        result = derive_website_specialist_harness_record(
            harness_id="ws-harness-refused-derived-001",
            request_id="ws-request-refused-derived-001",
            execution_id="ws-execution-refused-derived-001",
            lifecycle=lifecycle,
            voice_turn=voice_turn,
            continuity=continuity,
            route_event=route_event,
            requested_capability="diagnostic_review",
            request_source="telegram_voice_turn",
            support_safe_request_summary="Owner asked Cipher to keep the website diagnostic local even if fallback would help.",
            desired_outcome_summary="Refuse external fallback honestly and preserve support-safe continuity markers.",
        )

        self.assertEqual(result["execution"]["specialist_status"], "refused_fallback")
        self.assertTrue(result["execution"]["fallback_refused"])
        self.assertIn("refused", result["execution"]["disclosure_text"].lower())

    def test_validate_examples_accepts_repo_schema_and_examples(self) -> None:
        errors, schema_count, example_count = validate_examples()

        self.assertEqual(errors, [])
        self.assertGreaterEqual(schema_count, 8)
        self.assertGreaterEqual(example_count, 9)

    def test_load_runtime_step_artifacts_accepts_empty_case_payload(self) -> None:
        payload = {
            "provenance": {
                "route_mode": "local",
                "route_reason": "local path satisfied the request",
                "fallback_used": False,
                "fallback_refused": False,
                "disclosure_level": "brief",
                "disclosure_text": "This step ran on the local path.",
                "mention_external_help": False,
            },
            "feedback_selection": {
                "selected": False,
                "selected_feedback_id": None,
                "scope_requested": None,
                "target": None,
                "selection_reason": "No relevant explicit feedback matched the key for this step.",
            },
            "promotion_analysis": {
                "evaluated": False,
                "status": "not-evaluated",
                "decision": None,
                "reason": "No relevant feedback was available to evaluate for promotion.",
                "provenance_warning": False,
                "blocking_signal_type": None,
                "supporting_signal_used": False,
                "audit_summary": "decision=not-evaluated; signal=no_behavioral_signal; provenance=provenance_clear; reason=No relevant feedback was available to evaluate for promotion.",
            },
        }

        result = load_runtime_step_artifacts(payload)

        self.assertFalse(result["feedback_selection"]["selected"])
        self.assertEqual(result["promotion_analysis"]["status"], "not-evaluated")

    def test_load_runtime_step_artifacts_rejects_missing_feedback_selection_reason(self) -> None:
        payload = {
            "provenance": {
                "route_mode": "local",
                "route_reason": "local path satisfied the request",
                "fallback_used": False,
                "fallback_refused": False,
                "disclosure_level": "brief",
                "disclosure_text": "This step ran on the local path.",
                "mention_external_help": False,
            },
            "feedback_selection": {
                "selected": False,
                "selected_feedback_id": None,
                "scope_requested": None,
                "target": None,
            },
            "promotion_analysis": {
                "evaluated": False,
                "status": "not-evaluated",
                "decision": None,
                "reason": "No relevant feedback was available to evaluate for promotion.",
                "provenance_warning": False,
                "blocking_signal_type": None,
                "supporting_signal_used": False,
                "audit_summary": "decision=not-evaluated; signal=no_behavioral_signal; provenance=provenance_clear; reason=No relevant feedback was available to evaluate for promotion.",
            },
        }

        with self.assertRaises(ValueError):
            load_runtime_step_artifacts(payload)


class PrecedenceTests(unittest.TestCase):
    def test_active_spec_wins_over_feedback_and_default(self) -> None:
        ts = base_truth_surface()
        ts["active_spec"] = {"resolved_rules": {"routing.prefer_local": True}}
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_text": "Use external help if it is faster.",
                "target": "routing.prefer_local",
            }
        ]

        result = resolve_precedence("routing.prefer_local", ts, default=False)

        self.assertEqual(result["winner_source"], "active_spec")
        self.assertTrue(result["winner_value"])

    def test_latest_matching_feedback_wins_when_spec_is_silent(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-old",
                "feedback_text": "keep it glossy",
                "target": "design",
            },
            {
                **base_feedback(),
                "feedback_id": "f-new",
                "feedback_text": "less glossy",
                "target": "design",
            },
        ]

        result = resolve_precedence("design", ts, default="neutral")

        self.assertEqual(result["winner_source"], "explicit_feedback")
        self.assertEqual(result["winner_value"], "less glossy")

    def test_superseded_project_preference_is_ignored(self) -> None:
        ts = base_truth_surface()
        ts["active_project_preferences"] = [
            {
                "preference_id": "pref-stale",
                "rule": "design.dark_mode",
                "scope": "project",
                "confidence": 0.9,
                "evidence_count": 4,
                "last_confirmed_at": "2026-03-20T18:30:00Z",
                "conflict_status": "superseded",
                "origin_feedback_ids": ["fb-101"],
                "provenance_level": "local-proven",
            }
        ]

        result = resolve_precedence("design.dark_mode", ts, default="light")

        self.assertEqual(result["winner_source"], "default")
        self.assertEqual(result["winner_value"], "light")

    def test_active_project_preference_beats_owner_preference(self) -> None:
        ts = base_truth_surface()
        ts["active_project_preferences"] = [
            {
                "preference_id": "pref-project",
                "rule": "teaching.more_explanatory",
                "scope": "project",
                "confidence": 0.9,
                "evidence_count": 3,
                "last_confirmed_at": "2026-03-20T18:30:00Z",
                "conflict_status": "active",
                "origin_feedback_ids": ["fb-101"],
                "provenance_level": "local-proven",
            }
        ]
        ts["active_owner_preferences"] = [
            {
                "preference_id": "pref-owner",
                "rule": "teaching.minimal",
                "scope": "owner",
                "confidence": 0.7,
                "evidence_count": 5,
                "last_confirmed_at": "2026-03-20T18:00:00Z",
                "conflict_status": "active",
                "origin_feedback_ids": ["fb-050"],
                "provenance_level": "hybrid-proven",
            }
        ]

        result = resolve_precedence("teaching.more_explanatory", ts, default="neutral")

        self.assertEqual(result["winner_source"], "project_preference")
        self.assertEqual(result["winner_value"], "teaching.more_explanatory")


class PromotionTests(unittest.TestCase):
    def test_external_only_feedback_sets_provenance_warning(self) -> None:
        result = evaluate_feedback_promotion(
            {**base_feedback(), "provenance": "external-only"},
            project_repeat_count=2,
        )

        self.assertEqual(result["decision"], "project")
        self.assertTrue(result["provenance_warning"])

    def test_unsafe_feedback_is_rejected_even_with_repeat_counts(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=5,
            cross_project_repeat_count=3,
            explicit_durable=True,
            safe_to_learn=False,
        )

        self.assertEqual(result["decision"], "reject")

    def test_behavioral_repair_signal_blocks_promotion(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=5,
            behavior_signals=[
                {
                    "signal_id": "sig-repair-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "user_repair",
                    "strength": 0.9,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User manually simplified the hero after generation.",
                }
            ],
        )

        self.assertEqual(result["decision"], "reject")
        self.assertIn("repair", result["reason"].lower())
        self.assertEqual(result["blocking_signal_type"], "user_repair")
        self.assertFalse(result["supporting_signal_used"])

    def test_behavioral_non_adoption_signal_blocks_promotion(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=5,
            behavior_signals=[
                {
                    "signal_id": "sig-skip-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "suggestion_not_adopted",
                    "strength": 0.8,
                    "applied_to": "x",
                    "source_route": "hybrid",
                    "notes": "Suggested treatment was not carried forward.",
                }
            ],
        )

        self.assertEqual(result["decision"], "reject")
        self.assertIn("not adopted", result["reason"].lower())
        self.assertEqual(result["blocking_signal_type"], "suggestion_not_adopted")
        self.assertFalse(result["supporting_signal_used"])

    def test_accepted_without_edit_can_support_project_promotion(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=1,
            behavior_signals=[
                {
                    "signal_id": "sig-accept-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "accepted_without_edit",
                    "strength": 0.85,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User accepted the generated treatment without edits.",
                }
            ],
        )

        self.assertEqual(result["decision"], "project")
        self.assertIn("accepted", result["reason"].lower())
        self.assertIsNone(result["blocking_signal_type"])
        self.assertTrue(result["supporting_signal_used"])

    def test_accepted_without_edit_does_not_override_safety_or_negative_evidence(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=1,
            safe_to_learn=False,
            behavior_signals=[
                {
                    "signal_id": "sig-accept-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "accepted_without_edit",
                    "strength": 0.95,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User accepted the generated treatment without edits.",
                },
                {
                    "signal_id": "sig-repair-1",
                    "timestamp": "2026-03-20T00:06:00Z",
                    "target": "design",
                    "signal_type": "user_repair",
                    "strength": 0.95,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User later repaired the generated treatment.",
                },
            ],
        )

        self.assertEqual(result["decision"], "reject")
        self.assertIsNone(result["blocking_signal_type"])
        self.assertFalse(result["supporting_signal_used"])

    def test_blocking_signal_still_wins_when_acceptance_signal_is_present(self) -> None:
        result = evaluate_feedback_promotion(
            base_feedback(),
            project_repeat_count=1,
            behavior_signals=[
                {
                    "signal_id": "sig-accept-1",
                    "timestamp": "2026-03-20T00:05:00Z",
                    "target": "design",
                    "signal_type": "accepted_without_edit",
                    "strength": 0.95,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User accepted the generated treatment without edits.",
                },
                {
                    "signal_id": "sig-repair-1",
                    "timestamp": "2026-03-20T00:06:00Z",
                    "target": "design",
                    "signal_type": "user_repair",
                    "strength": 0.95,
                    "applied_to": "x",
                    "source_route": "local",
                    "notes": "User later repaired the generated treatment.",
                },
            ],
        )

        self.assertEqual(result["decision"], "reject")
        self.assertIn("repair", result["reason"].lower())
        self.assertEqual(result["blocking_signal_type"], "user_repair")
        self.assertTrue(result["supporting_signal_used"])

    def test_local_only_result_reports_no_behavioral_audit_flags(self) -> None:
        result = evaluate_feedback_promotion(base_feedback())

        self.assertEqual(result["decision"], "local-only")
        self.assertIsNone(result["blocking_signal_type"])
        self.assertFalse(result["supporting_signal_used"])


class PromotionAuditFormatterTests(unittest.TestCase):
    def test_formats_blocked_promotion_audit(self) -> None:
        summary = format_promotion_audit(
            {
                "decision": "reject",
                "reason": "Feedback should not be promoted because the user had to repair the resulting work after application.",
                "provenance_warning": False,
                "blocking_signal_type": "user_repair",
                "supporting_signal_used": False,
            }
        )

        self.assertIn("reject", summary)
        self.assertIn("user_repair", summary)

    def test_formats_supported_project_promotion_audit(self) -> None:
        summary = format_promotion_audit(
            {
                "decision": "project",
                "reason": "Feedback can promote project-wide because it repeated and was accepted without edit in practice.",
                "provenance_warning": False,
                "blocking_signal_type": None,
                "supporting_signal_used": True,
            }
        )

        self.assertIn("project", summary)
        self.assertIn("accepted_without_edit", summary)

    def test_formats_neutral_local_only_audit(self) -> None:
        summary = format_promotion_audit(
            {
                "decision": "local-only",
                "reason": "Feedback should affect the current unit but lacks evidence for broader promotion.",
                "provenance_warning": False,
                "blocking_signal_type": None,
                "supporting_signal_used": False,
            }
        )

        self.assertIn("local-only", summary)
        self.assertIn("no_behavioral_signal", summary)


class DisclosureTests(unittest.TestCase):
    def test_hybrid_route_requires_explicit_disclosure(self) -> None:
        event = {
            "event_id": "e1",
            "provider": "p",
            "model": "m",
            "mode": "hybrid",
            "route_reason": "quality support",
            "fallback_used": True,
            "fallback_refused": False,
            "learned_effect_allowed": True,
        }

        result = format_provenance_disclosure(event)

        self.assertEqual(result["level"], "explicit")
        self.assertTrue(result["mention_external_help"])

    def test_fallback_refusal_stays_brief_and_non_external(self) -> None:
        event = {
            "event_id": "e2",
            "provider": "p",
            "model": "m",
            "mode": "local",
            "route_reason": "policy lock",
            "fallback_used": False,
            "fallback_refused": True,
            "learned_effect_allowed": False,
        }

        result = format_provenance_disclosure(event)

        self.assertEqual(result["level"], "brief")
        self.assertFalse(result["mention_external_help"])


class RuntimeStepTests(unittest.TestCase):
    def test_runtime_step_composes_precedence_disclosure_and_promotion(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-runtime",
                "feedback_text": "less glossy",
                "target": "design",
            }
        ]
        route_event = {
            "event_id": "e-runtime",
            "provider": "p",
            "model": "m",
            "mode": "hybrid",
            "route_reason": "quality support",
            "fallback_used": True,
            "fallback_refused": False,
            "learned_effect_allowed": True,
        }

        result = resolve_runtime_step(
            "design",
            ts,
            route_event=route_event,
            default="neutral",
            evaluate_promotion=True,
            project_repeat_count=2,
        )

        self.assertEqual(result["precedence"]["winner_source"], "explicit_feedback")
        self.assertEqual(result["disclosure"]["level"], "explicit")
        self.assertEqual(result["promotion"]["decision"], "project")
        self.assertIsNone(result["promotion"]["blocking_signal_type"])
        self.assertFalse(result["promotion"]["supporting_signal_used"])
        self.assertEqual(result["artifacts"]["provenance"]["route_mode"], "hybrid")
        self.assertTrue(result["artifacts"]["feedback_selection"]["selected"])
        self.assertEqual(result["artifacts"]["feedback_selection"]["selected_feedback_id"], "f-runtime")
        self.assertEqual(result["artifacts"]["promotion_analysis"]["status"], "evaluated")
        self.assertEqual(result["artifacts"]["promotion_analysis"]["decision"], "project")

    def test_runtime_step_omits_promotion_when_feedback_absent(self) -> None:
        ts = base_truth_surface()

        result = resolve_runtime_step(
            "routing.prefer_local",
            ts,
            default=True,
            evaluate_promotion=True,
        )

        self.assertEqual(result["precedence"]["winner_source"], "default")
        self.assertNotIn("promotion", result)
        self.assertFalse(result["artifacts"]["feedback_selection"]["selected"])
        self.assertEqual(result["artifacts"]["promotion_analysis"]["status"], "not-evaluated")

    def test_runtime_step_uses_selected_feedback_for_promotion_instead_of_last_entry(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-relevant",
                "feedback_text": "less glossy",
                "scope_requested": "turn",
                "target": "design",
                "promotion_status": "local-only",
                "provenance": "not-yet-proven",
            },
            {
                **base_feedback(),
                "feedback_id": "f-last-but-irrelevant",
                "feedback_text": "teach more",
                "scope_requested": "turn",
                "target": "teaching",
                "promotion_status": "local-only",
                "provenance": "external-only",
            },
        ]

        result = resolve_runtime_step(
            "design",
            ts,
            default="neutral",
            evaluate_promotion=True,
            project_repeat_count=2,
        )

        self.assertEqual(result["precedence"]["winner_source"], "explicit_feedback")
        self.assertEqual(result["precedence"]["winner_value"], "less glossy")
        self.assertEqual(result["promotion"]["decision"], "project")
        self.assertFalse(result["promotion"]["provenance_warning"])
        self.assertIsNone(result["promotion"]["blocking_signal_type"])
        self.assertFalse(result["promotion"]["supporting_signal_used"])
        self.assertEqual(result["artifacts"]["feedback_selection"]["selected_feedback_id"], "f-relevant")

    def test_runtime_step_omits_promotion_when_only_irrelevant_feedback_exists(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-teaching-only",
                "target": "teaching",
                "feedback_text": "teach more",
            }
        ]

        result = resolve_runtime_step(
            "design",
            ts,
            default="neutral",
            evaluate_promotion=True,
        )

        self.assertEqual(result["precedence"]["winner_source"], "default")
        self.assertNotIn("promotion", result)
        self.assertFalse(result["artifacts"]["feedback_selection"]["selected"])
        self.assertEqual(result["artifacts"]["promotion_analysis"]["status"], "not-evaluated")

    def test_runtime_step_blocks_promotion_when_behavioral_signal_shows_user_repair(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-runtime",
                "feedback_text": "less glossy",
                "target": "design",
            }
        ]
        ts["recent_behavior_signals"] = [
            {
                "signal_id": "sig-runtime-repair",
                "timestamp": "2026-03-20T00:05:00Z",
                "target": "design",
                "signal_type": "user_repair",
                "strength": 0.95,
                "applied_to": "x",
                "source_route": "local",
                "notes": "User manually corrected the generated treatment.",
            }
        ]

        result = resolve_runtime_step(
            "design",
            ts,
            default="neutral",
            evaluate_promotion=True,
            project_repeat_count=3,
        )

        self.assertEqual(result["precedence"]["winner_source"], "explicit_feedback")
        self.assertEqual(result["promotion"]["decision"], "reject")
        self.assertEqual(result["promotion"]["blocking_signal_type"], "user_repair")
        self.assertFalse(result["promotion"]["supporting_signal_used"])
        self.assertEqual(result["artifacts"]["promotion_analysis"]["decision"], "reject")
        self.assertEqual(result["artifacts"]["promotion_analysis"]["blocking_signal_type"], "user_repair")

    def test_runtime_step_reports_supporting_acceptance_audit_fields(self) -> None:
        ts = base_truth_surface()
        ts["recent_explicit_feedback"] = [
            {
                **base_feedback(),
                "feedback_id": "f-runtime-accept",
                "feedback_text": "less glossy",
                "target": "design",
            }
        ]
        ts["recent_behavior_signals"] = [
            {
                "signal_id": "sig-runtime-accept",
                "timestamp": "2026-03-20T00:05:00Z",
                "target": "design",
                "signal_type": "accepted_without_edit",
                "strength": 0.9,
                "applied_to": "x",
                "source_route": "local",
                "notes": "User accepted the generated treatment without edits.",
            }
        ]

        result = resolve_runtime_step(
            "design",
            ts,
            default="neutral",
            evaluate_promotion=True,
            project_repeat_count=1,
        )

        self.assertEqual(result["promotion"]["decision"], "project")
        self.assertIsNone(result["promotion"]["blocking_signal_type"])
        self.assertTrue(result["promotion"]["supporting_signal_used"])
        self.assertTrue(result["artifacts"]["promotion_analysis"]["supporting_signal_used"])

    def test_runtime_step_artifacts_reflect_local_empty_case_without_route_event(self) -> None:
        ts = base_truth_surface()

        result = resolve_runtime_step(
            "routing.prefer_local",
            ts,
            default=True,
            evaluate_promotion=True,
        )

        self.assertEqual(result["artifacts"]["provenance"]["route_mode"], "local")
        self.assertEqual(
            result["artifacts"]["feedback_selection"]["selection_reason"],
            "No relevant explicit feedback matched the key for this step.",
        )
        self.assertEqual(result["artifacts"]["promotion_analysis"]["decision"], None)
        self.assertIn("not-evaluated", result["artifacts"]["promotion_analysis"]["audit_summary"])


if __name__ == "__main__":
    unittest.main()
