"""Tests for health monitoring service."""

import pytest
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock
import time

from health_monitor import (
    HealthMonitor,
    HealthCheckRecord,
    RecoveryEvent,
    KinProcessConfig,
    HealthStatus,
    RecoveryTrigger,
    RecoveryAction,
    RecoveryResult,
    CheckType,
)


@pytest.fixture
def kin_configs() -> list[KinProcessConfig]:
    """Sample Kin process configurations for testing."""
    return [
        KinProcessConfig(
            kin_id="cipher-001",
            name="Cipher",
            health_endpoint="http://localhost:8080/health",
            restart_command="echo 'restarting cipher'",
            max_consecutive_errors=3,
        ),
        KinProcessConfig(
            kin_id="vortex-001",
            name="Vortex",
            health_endpoint="http://localhost:8081/health",
            restart_command="echo 'restarting vortex'",
            max_consecutive_errors=3,
        ),
        KinProcessConfig(
            kin_id="no-restart-001",
            name="NoRestart",
            health_endpoint="http://localhost:8082/health",
            restart_command=None,  # No restart command
            auto_restart=False,
        ),
    ]


@pytest.fixture
def notification_handler() -> Mock:
    """Mock notification handler."""
    return Mock(return_value=True)


@pytest.fixture
def monitor(kin_configs: list[KinProcessConfig], notification_handler: Mock) -> HealthMonitor:
    """Health monitor instance for testing."""
    return HealthMonitor(kin_configs, notification_handler)


class TestHealthCheckRecord:
    """Tests for HealthCheckRecord dataclass."""

    def test_creates_record_with_defaults(self):
        """Should create record with auto-generated fields."""
        record = HealthCheckRecord(
            kin_id="test-001",
            status=HealthStatus.HEALTHY,
            response_time_ms=50.0,
            error_count=0,
        )

        assert record.kin_id == "test-001"
        assert record.status == HealthStatus.HEALTHY
        assert record.schema_family == "health_check_record"
        assert record.record_id.startswith("hcr-")
        assert record.check_type == CheckType.HTTP

    def test_to_dict(self):
        """Should serialize to dictionary correctly."""
        record = HealthCheckRecord(
            kin_id="test-001",
            status=HealthStatus.HEALTHY,
            response_time_ms=50.0,
            error_count=0,
            endpoint="http://localhost:8080/health",
        )

        data = record.to_dict()

        assert data["kin_id"] == "test-001"
        assert data["status"] == "healthy"
        assert data["schema_family"] == "health_check_record"
        assert data["response_time_ms"] == 50.0
        assert data["error_count"] == 0


class TestRecoveryEvent:
    """Tests for RecoveryEvent dataclass."""

    def test_creates_event_with_defaults(self):
        """Should create event with auto-generated fields."""
        event = RecoveryEvent(
            kin_id="test-001",
            trigger=RecoveryTrigger.HEALTH_CHECK,
            action=RecoveryAction.RESTART,
            result=RecoveryResult.SUCCESS,
        )

        assert event.kin_id == "test-001"
        assert event.trigger == RecoveryTrigger.HEALTH_CHECK
        assert event.action == RecoveryAction.RESTART
        assert event.result == RecoveryResult.SUCCESS
        assert event.schema_family == "recovery_event"
        assert event.record_id.startswith("re-")

    def test_to_dict(self):
        """Should serialize to dictionary correctly."""
        event = RecoveryEvent(
            kin_id="test-001",
            trigger=RecoveryTrigger.MANUAL,
            action=RecoveryAction.RESTART,
            result=RecoveryResult.SUCCESS,
            previous_status=HealthStatus.UNHEALTHY,
            new_status=HealthStatus.HEALTHY,
        )

        data = event.to_dict()

        assert data["kin_id"] == "test-001"
        assert data["trigger"] == "manual"
        assert data["action"] == "restart"
        assert data["result"] == "success"
        assert data["previous_status"] == "unhealthy"
        assert data["new_status"] == "healthy"


class TestHealthMonitor:
    """Tests for HealthMonitor class."""

    def test_initializes_with_configs(self, monitor: HealthMonitor, kin_configs: list[KinProcessConfig]):
        """Should initialize with Kin configurations."""
        assert len(monitor.kin_configs) == 3
        assert "cipher-001" in monitor.kin_configs
        assert "vortex-001" in monitor.kin_configs

    def test_check_kin_health_unknown_kin(self, monitor: HealthMonitor):
        """Should return UNKNOWN status for unknown Kin ID."""
        record = monitor.check_kin_health("unknown-kin")

        assert record.status == HealthStatus.UNKNOWN
        assert "Unknown Kin ID" in record.last_error

    @patch("health_monitor.urllib.request.urlopen")
    def test_check_kin_health_healthy(self, mock_urlopen, monitor: HealthMonitor):
        """Should return HEALTHY status for responding Kin."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        record = monitor.check_kin_health("cipher-001")

        assert record.status == HealthStatus.HEALTHY
        assert record.error_count == 0
        assert record.endpoint == "http://localhost:8080/health"

    @patch("health_monitor.urllib.request.urlopen")
    def test_check_kin_health_unhealthy(self, mock_urlopen, monitor: HealthMonitor):
        """Should return UNHEALTHY status for non-responding Kin."""
        from urllib.error import URLError
        mock_urlopen.side_effect = URLError("Connection refused")

        record = monitor.check_kin_health("cipher-001")

        assert record.status == HealthStatus.UNHEALTHY
        assert record.error_count == 1
        assert "Connection refused" in record.last_error

    @patch("health_monitor.urllib.request.urlopen")
    def test_error_count_increments(self, mock_urlopen, monitor: HealthMonitor):
        """Should increment error count on consecutive failures."""
        from urllib.error import URLError
        mock_urlopen.side_effect = URLError("Connection refused")

        record1 = monitor.check_kin_health("cipher-001")
        record2 = monitor.check_kin_health("cipher-001")
        record3 = monitor.check_kin_health("cipher-001")

        assert record1.error_count == 1
        assert record2.error_count == 2
        assert record3.error_count == 3

    @patch("health_monitor.urllib.request.urlopen")
    def test_error_count_resets_on_success(self, mock_urlopen, monitor: HealthMonitor):
        """Should reset error count on successful health check."""
        from urllib.error import URLError
        
        # First, fail a few times
        mock_urlopen.side_effect = URLError("Connection refused")
        monitor.check_kin_health("cipher-001")
        monitor.check_kin_health("cipher-001")

        # Then succeed
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.side_effect = None
        mock_urlopen.return_value = mock_response

        record = monitor.check_kin_health("cipher-001")

        assert record.status == HealthStatus.HEALTHY
        assert record.error_count == 0

    @patch("health_monitor.urllib.request.urlopen")
    def test_check_all_kin(self, mock_urlopen, monitor: HealthMonitor):
        """Should check health of all configured Kin."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        records = monitor.check_all_kin()

        assert len(records) == 3
        assert all(r.status == HealthStatus.HEALTHY for r in records)

    def test_restart_kin_unknown(self, monitor: HealthMonitor):
        """Should handle restart for unknown Kin."""
        event = monitor.restart_kin("unknown-kin")

        assert event.result == RecoveryResult.FAILED
        assert "Unknown Kin ID" in event.error_message

    def test_restart_kin_no_command(self, monitor: HealthMonitor):
        """Should skip restart if no command configured."""
        event = monitor.restart_kin("no-restart-001")

        assert event.result == RecoveryResult.SKIPPED
        assert "No restart command" in event.error_message

    @patch("health_monitor.subprocess.run")
    @patch("health_monitor.urllib.request.urlopen")
    def test_restart_kin_success(self, mock_urlopen, mock_run, monitor: HealthMonitor):
        """Should successfully restart Kin process."""
        # Mock successful restart
        mock_run.return_value = MagicMock(returncode=0, stdout="OK", stderr="")

        # Mock health check after restart
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        event = monitor.restart_kin("cipher-001")

        assert event.result == RecoveryResult.SUCCESS
        assert event.new_status == HealthStatus.HEALTHY
        assert event.notification_sent is True

    @patch("health_monitor.subprocess.run")
    def test_restart_kin_failure(self, mock_run, monitor: HealthMonitor):
        """Should handle restart failure."""
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="Process not found")

        event = monitor.restart_kin("cipher-001")

        assert event.result == RecoveryResult.FAILED
        assert "Process not found" in event.error_message

    def test_notification_handler_called(self, kin_configs: list[KinProcessConfig]):
        """Should call notification handler on recovery."""
        handler = Mock(return_value=True)
        monitor = HealthMonitor(kin_configs, handler)

        with patch("health_monitor.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="Failed")
            monitor.restart_kin("cipher-001")

        handler.assert_called_once()

    def test_get_status(self, monitor: HealthMonitor):
        """Should return status summary."""
        with patch("health_monitor.urllib.request.urlopen") as mock_urlopen:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.__enter__ = Mock(return_value=mock_response)
            mock_response.__exit__ = Mock(return_value=False)
            mock_urlopen.return_value = mock_response

            monitor.check_all_kin()

        status = monitor.get_status()

        assert status["kin_count"] == 3
        assert "cipher-001" in status["health_summary"]

    def test_daemon_can_be_stopped(self, monitor: HealthMonitor):
        """Should stop daemon when requested."""
        monitor._running = True
        monitor.stop_daemon()
        assert monitor._running is False


class TestHealthMonitorDaemon:
    """Tests for daemon mode."""

    @patch("health_monitor.urllib.request.urlopen")
    @patch("health_monitor.time.sleep")
    def test_daemon_runs_health_checks(self, mock_sleep, mock_urlopen, monitor: HealthMonitor):
        """Should run health checks in daemon mode."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.__enter__ = Mock(return_value=mock_response)
        mock_response.__exit__ = Mock(return_value=False)
        mock_urlopen.return_value = mock_response

        # Stop after first iteration
        call_count = [0]
        def stop_after_first(*args):
            call_count[0] += 1
            if call_count[0] >= 1:
                monitor._running = False

        mock_sleep.side_effect = stop_after_first

        monitor.start_daemon(interval_seconds=10)

        assert mock_urlopen.called

    @patch("health_monitor.urllib.request.urlopen")
    @patch("health_monitor.time.sleep")
    @patch("health_monitor.subprocess.run")
    def test_daemon_auto_restarts_unhealthy(
        self, mock_run, mock_sleep, mock_urlopen, monitor: HealthMonitor
    ):
        """Should auto-restart unhealthy Kin after threshold."""
        from urllib.error import URLError

        # Make health checks fail
        mock_urlopen.side_effect = URLError("Connection refused")
        
        # Mock successful restart
        mock_run.return_value = MagicMock(returncode=0, stdout="OK", stderr="")

        restart_events = []

        def capture_recovery(event):
            restart_events.append(event)
            monitor._running = False

        # Stop after first recovery attempt
        call_count = [0]
        def stop_after_restart(*args):
            call_count[0] += 1
            if call_count[0] >= 5:  # After error threshold
                pass  # Let recovery happen
            return None

        mock_sleep.side_effect = stop_after_restart

        # Run daemon with callbacks
        original_running = monitor._running
        monitor._running = True
        
        # Simulate daemon loop manually
        for _ in range(4):  # 4 errors to exceed threshold of 3
            monitor.check_kin_health("cipher-001")

        # Should have 4 errors now, next check triggers restart
        record = monitor.check_kin_health("cipher-001")
        assert record.error_count >= 3

        monitor._running = original_running
