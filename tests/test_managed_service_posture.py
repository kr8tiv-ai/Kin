"""S07 managed-service posture tests.

Tests for schema validation, derivation, and CLI inspection of the S07
managed-service posture record family.
"""

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime_types.managed_service_posture import derive_managed_service_posture_record


class ManagedServicePostureSchemaTests(unittest.TestCase):
    """Tests for S07 schema validation and parser loading."""

    def test_healthy_fixture_loads_and_validates(self) -> None:
        """The healthy example fixture must load and validate through the parser seam."""
        import json

        fixture_path = ROOT / "schemas" / "examples" / "managed-service-posture-record.healthy.example.json"
        data = json.loads(fixture_path.read_text(encoding="utf-8"))

        record = derive_managed_service_posture_record(
            record_id=data["record_id"],
            concierge_lifecycle=data["concierge_lifecycle"],
            website_specialist_harness=data.get("website_specialist_harness"),
            tailscale_access=data["tailscale_access"],
            computer_setup_guidance=data["computer_setup_guidance"],
            backup_state=data["backup_state"],
            intervention_state=data["intervention_state"],
            support_readiness=data["support_readiness"],
            overall_posture=data["overall_posture"],
            support_safe_summary=data["support_safe_summary"],
        )

        self.assertEqual(record["record_id"], "managed-service-posture-healthy-001")
        self.assertEqual(record["schema_family"], "s07_managed_service_posture")
        self.assertEqual(record["overall_posture"], "healthy")
        self.assertEqual(record["tailscale_access"]["status"], "connected")
        self.assertEqual(record["backup_state"]["status"], "healthy")
        self.assertEqual(record["intervention_state"]["status"], "none")
        self.assertTrue(record["support_readiness"]["can_receive_support"])

    def test_needs_attention_fixture_loads_and_validates(self) -> None:
        """The needs-attention example fixture must load and validate through the parser seam."""
        import json

        fixture_path = ROOT / "schemas" / "examples" / "managed-service-posture-record.needs-attention.example.json"
        data = json.loads(fixture_path.read_text(encoding="utf-8"))

        record = derive_managed_service_posture_record(
            record_id=data["record_id"],
            concierge_lifecycle=data["concierge_lifecycle"],
            website_specialist_harness=data.get("website_specialist_harness"),
            tailscale_access=data["tailscale_access"],
            computer_setup_guidance=data["computer_setup_guidance"],
            backup_state=data["backup_state"],
            intervention_state=data["intervention_state"],
            support_readiness=data["support_readiness"],
            overall_posture=data["overall_posture"],
            support_safe_summary=data["support_safe_summary"],
        )

        self.assertEqual(record["record_id"], "managed-service-posture-needs-attention-001")
        self.assertEqual(record["overall_posture"], "needs_attention")
        self.assertEqual(record["tailscale_access"]["status"], "needs_setup")
        self.assertEqual(record["backup_state"]["status"], "stale")
        self.assertTrue(record["intervention_state"]["owner_action_required"])
        self.assertEqual(record["support_readiness"]["status"], "degraded")

    def test_recovering_fixture_loads_and_validates(self) -> None:
        """The recovering example fixture must load and validate through the parser seam."""
        import json

        fixture_path = ROOT / "schemas" / "examples" / "managed-service-posture-record.recovering.example.json"
        data = json.loads(fixture_path.read_text(encoding="utf-8"))

        record = derive_managed_service_posture_record(
            record_id=data["record_id"],
            concierge_lifecycle=data["concierge_lifecycle"],
            website_specialist_harness=data.get("website_specialist_harness"),
            tailscale_access=data["tailscale_access"],
            computer_setup_guidance=data["computer_setup_guidance"],
            backup_state=data["backup_state"],
            intervention_state=data["intervention_state"],
            support_readiness=data["support_readiness"],
            overall_posture=data["overall_posture"],
            support_safe_summary=data["support_safe_summary"],
        )

        self.assertEqual(record["record_id"], "managed-service-posture-recovering-001")
        self.assertEqual(record["overall_posture"], "recovering")
        self.assertEqual(record["intervention_state"]["status"], "in_progress")
        self.assertEqual(record["intervention_state"]["intervention_type"], "service_recovery")
        self.assertFalse(record["intervention_state"]["owner_action_required"])

    def test_invalid_overall_posture_raises_value_error(self) -> None:
        """Invalid overall_posture values must raise ValueError."""
        import json

        fixture_path = ROOT / "schemas" / "examples" / "managed-service-posture-record.healthy.example.json"
        data = json.loads(fixture_path.read_text(encoding="utf-8"))

        with self.assertRaises(ValueError) as ctx:
            derive_managed_service_posture_record(
                record_id=data["record_id"],
                concierge_lifecycle=data["concierge_lifecycle"],
                website_specialist_harness=data.get("website_specialist_harness"),
                tailscale_access=data["tailscale_access"],
                computer_setup_guidance=data["computer_setup_guidance"],
                backup_state=data["backup_state"],
                intervention_state=data["intervention_state"],
                support_readiness=data["support_readiness"],
                overall_posture="invalid_status",  # Invalid value
                support_safe_summary=data["support_safe_summary"],
            )

        self.assertIn("Invalid overall_posture", str(ctx.exception))


class ManagedServicePostureDerivationTests(unittest.TestCase):
    """Tests for S07 derivation helper behavior."""

    def test_derive_healthy_posture_from_canonical_inputs(self) -> None:
        """Derivation must produce healthy posture when all components are healthy."""
        from runtime_types.concierge_claims import derive_concierge_lifecycle

        # Build canonical S01 input
        concierge = derive_concierge_lifecycle(
            claim_id="claim-test-001",
            claimant_label="test-owner",
            claim_submitted=True,
            identity_verified=True,
            device_setup_complete=True,
            owner_confirmation_complete=True,
            support_intervention_required=False,
        )

        record = derive_managed_service_posture_record(
            record_id="test-posture-001",
            concierge_lifecycle=concierge,
            tailscale_access={
                "status": "connected",
                "device_name": "test-device",
                "tailnet_name": "test-tailnet",
                "last_seen_summary": "Just now",
                "setup_step": "complete",
                "support_safe_notes": "Connected",
            },
            computer_setup_guidance={
                "guidance_id": "guide-001",
                "guidance_status": "ready",
                "plain_language_summary": "Setup complete",
                "next_owner_step": "No action needed",
                "estimated_time_summary": "No time needed - setup complete",
                "support_safe_notes": "Ready",
            },
            backup_state={
                "status": "healthy",
                "last_backup_summary": "Today",
                "backup_health_summary": "Good",
                "recommended_action": "No action needed",
                "support_safe_notes": "Healthy",
            },
            intervention_state={
                "status": "none",
                "intervention_type": None,
                "plain_language_summary": "No issues",
                "owner_action_required": False,
                "estimated_resolution_summary": None,
                "support_safe_notes": "None needed",
            },
            support_readiness={
                "status": "ready",
                "can_receive_support": True,
                "support_channel_summary": "Available",
                "known_limitations": [],
            },
            overall_posture="healthy",
            support_safe_summary="All systems healthy",
        )

        self.assertEqual(record["overall_posture"], "healthy")
        self.assertEqual(record["concierge_lifecycle"]["claim_status"], "activation_ready")
        self.assertEqual(record["tailscale_access"]["status"], "connected")

    def test_derive_needs_attention_posture_with_tailscale_setup_required(self) -> None:
        """Derivation must preserve needs_attention posture when setup is incomplete."""
        from runtime_types.concierge_claims import derive_concierge_lifecycle

        concierge = derive_concierge_lifecycle(
            claim_id="claim-test-002",
            claimant_label="test-owner-needs-setup",
            claim_submitted=True,
            identity_verified=True,
            device_setup_complete=False,
            owner_confirmation_complete=False,
            support_intervention_required=False,
        )

        record = derive_managed_service_posture_record(
            record_id="test-posture-002",
            concierge_lifecycle=concierge,
            tailscale_access={
                "status": "needs_setup",
                "device_name": None,
                "tailnet_name": "test-tailnet",
                "last_seen_summary": "Never",
                "setup_step": "authorize_device",
                "support_safe_notes": "Needs device authorization",
            },
            computer_setup_guidance={
                "guidance_id": "guide-002",
                "guidance_status": "needs_user_action",
                "plain_language_summary": "One step needed",
                "next_owner_step": "Authorize device",
                "estimated_time_summary": "2 minutes",
                "support_safe_notes": "Pending owner action",
            },
            backup_state={
                "status": "stale",
                "last_backup_summary": "5 days ago",
                "backup_health_summary": "Behind schedule",
                "recommended_action": "Check backup drive",
                "support_safe_notes": "Stale backups",
            },
            intervention_state={
                "status": "none",
                "intervention_type": None,
                "plain_language_summary": "Waiting for owner",
                "owner_action_required": True,
                "estimated_resolution_summary": "After authorization",
                "support_safe_notes": "Owner action needed",
            },
            support_readiness={
                "status": "degraded",
                "can_receive_support": True,
                "support_channel_summary": "Limited until setup complete",
                "known_limitations": ["Remote access unavailable"],
            },
            overall_posture="needs_attention",
            support_safe_summary="Needs device authorization",
        )

        self.assertEqual(record["overall_posture"], "needs_attention")
        self.assertEqual(record["tailscale_access"]["status"], "needs_setup")
        self.assertTrue(record["intervention_state"]["owner_action_required"])


class ManagedServicePostureCLITests(unittest.TestCase):
    """Tests for the S07 inspection CLI."""

    def test_inspection_script_reports_all_scenarios(self) -> None:
        """The CLI must report support-safe summaries for all three scenarios."""
        result = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "inspect_managed_service_posture.py")],
            check=True,
            capture_output=True,
            text=True,
        )

        output = result.stdout

        # Healthy scenario
        self.assertIn("S07 Healthy Scenario", output)
        self.assertIn("managed-service-posture-healthy-001", output)
        self.assertIn("Overall Posture: healthy", output)
        self.assertIn("Tailscale Status: connected", output)
        self.assertIn("Backup Status: healthy", output)

        # Needs attention scenario
        self.assertIn("S07 Needs Attention Scenario", output)
        self.assertIn("managed-service-posture-needs-attention-001", output)
        self.assertIn("Overall Posture: needs_attention", output)
        self.assertIn("Tailscale Status: needs_setup", output)
        self.assertIn("Owner Action Required: True", output)

        # Recovering scenario
        self.assertIn("S07 Recovering Scenario", output)
        self.assertIn("managed-service-posture-recovering-001", output)
        self.assertIn("Overall Posture: recovering", output)
        self.assertIn("Intervention Type: service_recovery", output)

        # Final success message
        self.assertIn("All S07 scenarios inspected successfully", output)


if __name__ == "__main__":
    unittest.main()
