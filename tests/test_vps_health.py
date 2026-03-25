"""Tests for VPS Health Status derivation."""

import pytest
from datetime import datetime
from unittest.mock import Mock, patch, MagicMock
import sys
from pathlib import Path

# Add runtime_types to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from runtime_types.vps_health import (
    VpsHealthStatus,
    VpsMetrics,
    KinSummary,
    Alert,
    get_system_metrics,
    derive_vps_health_status,
    determine_overall_status,
    generate_alerts,
    validate_vps_health_status,
)


@pytest.fixture
def mock_health_monitor_status() -> dict:
    """Sample health monitor status for testing."""
    return {
        "timestamp": "2024-01-15T10:30:00Z",
        "kin_count": 3,
        "health_summary": {
            "cipher-001": {
                "status": "healthy",
                "error_count": 0,
                "last_check": "2024-01-15T10:30:00Z",
            },
            "mischief-001": {
                "status": "healthy",
                "error_count": 0,
                "last_check": "2024-01-15T10:30:00Z",
            },
            "vortex-001": {
                "status": "unhealthy",
                "error_count": 1,
                "last_check": "2024-01-15T10:29:30Z",
                "last_error": "Connection refused",
            },
        },
    }


@pytest.fixture
def healthy_system_metrics() -> VpsMetrics:
    """System metrics for a healthy VPS."""
    return VpsMetrics(
        cpu_percent=25.5,
        memory_percent=45.0,
        disk_percent=60.0,
        uptime_seconds=86400,
        load_average=[0.5, 0.6, 0.7],
        network_in_bytes=1000000,
        network_out_bytes=500000,
    )


@pytest.fixture
def degraded_system_metrics() -> VpsMetrics:
    """System metrics for a degraded VPS."""
    return VpsMetrics(
        cpu_percent=85.0,
        memory_percent=88.0,
        disk_percent=70.0,
        uptime_seconds=3600,
        load_average=[4.0, 3.5, 3.0],
        network_in_bytes=10000000,
        network_out_bytes=5000000,
    )


class TestVpsHealthStatus:
    """Tests for VpsHealthStatus dataclass."""

    def test_creates_status_with_defaults(self):
        """Should create status with auto-generated fields."""
        status = VpsHealthStatus(
            vps_id="vps-test",
            overall_status="healthy",
            kin_summary={"active_kin_count": 1, "total_kin_count": 1, "healthy_count": 1, "unhealthy_count": 0, "unknown_count": 0},
            system_metrics={"cpu_percent": 10, "memory_percent": 20, "disk_percent": 30, "uptime_seconds": 100, "load_average": [0.1, 0.2, 0.3], "network_in_bytes": 0, "network_out_bytes": 0},
        )

        assert status.vps_id == "vps-test"
        assert status.overall_status == "healthy"
        assert status.schema_family == "vps_health_status"
        assert status.record_id.startswith("vhs-")
        assert status.schema_version == "1.0.0"

    def test_to_dict(self):
        """Should serialize to dictionary correctly."""
        status = VpsHealthStatus(
            vps_id="vps-test",
            overall_status="healthy",
            kin_summary={"active_kin_count": 1, "total_kin_count": 1, "healthy_count": 1, "unhealthy_count": 0, "unknown_count": 0},
            system_metrics={"cpu_percent": 10, "memory_percent": 20, "disk_percent": 30, "uptime_seconds": 100, "load_average": [0.1, 0.2, 0.3], "network_in_bytes": 0, "network_out_bytes": 0},
            vps_name="Test VPS",
        )

        data = status.to_dict()

        assert data["vps_id"] == "vps-test"
        assert data["vps_name"] == "Test VPS"
        assert data["overall_status"] == "healthy"
        assert data["schema_family"] == "vps_health_status"
        assert "record_id" in data
        assert "system_metrics" in data
        assert "kin_summary" in data

    def test_to_json(self):
        """Should serialize to JSON string."""
        status = VpsHealthStatus(
            vps_id="vps-test",
            overall_status="healthy",
            kin_summary={"active_kin_count": 1, "total_kin_count": 1, "healthy_count": 1, "unhealthy_count": 0, "unknown_count": 0},
            system_metrics={"cpu_percent": 10, "memory_percent": 20, "disk_percent": 30, "uptime_seconds": 100, "load_average": [0.1, 0.2, 0.3], "network_in_bytes": 0, "network_out_bytes": 0},
        )

        json_str = status.to_json()

        assert isinstance(json_str, str)
        assert '"vps_id": "vps-test"' in json_str
        assert '"overall_status": "healthy"' in json_str


class TestGetSystemMetrics:
    """Tests for get_system_metrics function."""

    @patch("runtime_types.vps_health.PSUTIL_AVAILABLE", False)
    def test_returns_defaults_without_psutil(self):
        """Should return default values when psutil is unavailable."""
        metrics = get_system_metrics()

        assert metrics["cpu_percent"] == 0.0
        assert metrics["memory_percent"] == 0.0
        assert metrics["disk_percent"] == 0.0
        assert metrics["uptime_seconds"] == 0
        assert metrics["load_average"] == [0.0, 0.0, 0.0]

    @patch("runtime_types.vps_health.PSUTIL_AVAILABLE", True)
    @patch("runtime_types.vps_health.psutil")
    def test_collects_metrics_with_psutil(self, mock_psutil):
        """Should collect metrics using psutil."""
        mock_psutil.cpu_percent.return_value = 25.5
        mock_psutil.virtual_memory.return_value = MagicMock(percent=45.0)
        mock_psutil.disk_usage.return_value = MagicMock(percent=60.0)
        mock_psutil.boot_time.return_value = 1700000000
        mock_psutil.getloadavg.return_value = (0.5, 0.6, 0.7)
        mock_psutil.net_io_counters.return_value = MagicMock(
            bytes_recv=1000000,
            bytes_sent=500000
        )

        metrics = get_system_metrics()

        assert metrics["cpu_percent"] == 25.5
        assert metrics["memory_percent"] == 45.0
        assert metrics["disk_percent"] == 60.0
        assert metrics["load_average"] == [0.5, 0.6, 0.7]
        assert metrics["network_in_bytes"] == 1000000
        assert metrics["network_out_bytes"] == 500000


class TestDeriveVpsHealthStatus:
    """Tests for derive_vps_health_status function."""

    @patch("runtime_types.vps_health.get_system_metrics")
    def test_derives_from_health_monitor_status(
        self, mock_get_metrics, mock_health_monitor_status, healthy_system_metrics
    ):
        """Should derive VpsHealthStatus from health monitor output."""
        mock_get_metrics.return_value = healthy_system_metrics

        status = derive_vps_health_status(
            mock_health_monitor_status,
            vps_id="vps-prod-01",
            vps_name="Production VPS",
        )

        assert status.vps_id == "vps-prod-01"
        assert status.vps_name == "Production VPS"
        assert status.overall_status == "degraded"  # One unhealthy Kin
        assert status.kin_summary["total_kin_count"] == 3
        assert status.kin_summary["healthy_count"] == 2
        assert status.kin_summary["unhealthy_count"] == 1
        assert status.schema_family == "vps_health_status"

    @patch("runtime_types.vps_health.get_system_metrics")
    def test_handles_empty_health_summary(self, mock_get_metrics, healthy_system_metrics):
        """Should handle empty health summary gracefully."""
        mock_get_metrics.return_value = healthy_system_metrics

        status = derive_vps_health_status(
            {"timestamp": "2024-01-15T10:30:00Z", "kin_count": 0, "health_summary": {}},
            vps_id="vps-empty",
        )

        assert status.overall_status == "unknown"
        assert status.kin_summary["total_kin_count"] == 0
        assert status.kin_summary["healthy_count"] == 0


class TestDetermineOverallStatus:
    """Tests for determine_overall_status function."""

    def test_healthy_status(self, healthy_system_metrics):
        """Should return healthy when all Kin are healthy and metrics normal."""
        kin_summary: KinSummary = {
            "active_kin_count": 3,
            "total_kin_count": 3,
            "healthy_count": 3,
            "unhealthy_count": 0,
            "unknown_count": 0,
        }
        health_summary = {
            "kin-1": {"status": "healthy", "error_count": 0},
            "kin-2": {"status": "healthy", "error_count": 0},
            "kin-3": {"status": "healthy", "error_count": 0},
        }

        status = determine_overall_status(kin_summary, healthy_system_metrics, health_summary)

        assert status == "healthy"

    def test_degraded_with_unhealthy_kin(self, healthy_system_metrics):
        """Should return degraded when Kin is unhealthy."""
        kin_summary: KinSummary = {
            "active_kin_count": 3,
            "total_kin_count": 3,
            "healthy_count": 2,
            "unhealthy_count": 1,
            "unknown_count": 0,
        }
        health_summary = {
            "kin-1": {"status": "healthy", "error_count": 0},
            "kin-2": {"status": "healthy", "error_count": 0},
            "kin-3": {"status": "unhealthy", "error_count": 1},
        }

        status = determine_overall_status(kin_summary, healthy_system_metrics, health_summary)

        assert status == "degraded"

    def test_critical_with_high_error_count(self, healthy_system_metrics):
        """Should return critical when Kin has 3+ errors."""
        kin_summary: KinSummary = {
            "active_kin_count": 1,
            "total_kin_count": 1,
            "healthy_count": 0,
            "unhealthy_count": 1,
            "unknown_count": 0,
        }
        health_summary = {
            "kin-1": {"status": "unhealthy", "error_count": 3},
        }

        status = determine_overall_status(kin_summary, healthy_system_metrics, health_summary)

        assert status == "critical"

    def test_critical_with_high_cpu(self):
        """Should return critical when CPU is above 90%."""
        kin_summary: KinSummary = {
            "active_kin_count": 1,
            "total_kin_count": 1,
            "healthy_count": 1,
            "unhealthy_count": 0,
            "unknown_count": 0,
        }
        metrics: VpsMetrics = {
            "cpu_percent": 95.0,
            "memory_percent": 50.0,
            "disk_percent": 50.0,
            "uptime_seconds": 1000,
            "load_average": [4.0, 3.5, 3.0],
            "network_in_bytes": 0,
            "network_out_bytes": 0,
        }
        health_summary = {"kin-1": {"status": "healthy", "error_count": 0}}

        status = determine_overall_status(kin_summary, metrics, health_summary)

        assert status == "critical"

    def test_degraded_with_elevated_metrics(self):
        """Should return degraded when metrics are elevated."""
        kin_summary: KinSummary = {
            "active_kin_count": 1,
            "total_kin_count": 1,
            "healthy_count": 1,
            "unhealthy_count": 0,
            "unknown_count": 0,
        }
        metrics: VpsMetrics = {
            "cpu_percent": 80.0,
            "memory_percent": 50.0,
            "disk_percent": 50.0,
            "uptime_seconds": 1000,
            "load_average": [2.0, 1.5, 1.0],
            "network_in_bytes": 0,
            "network_out_bytes": 0,
        }
        health_summary = {"kin-1": {"status": "healthy", "error_count": 0}}

        status = determine_overall_status(kin_summary, metrics, health_summary)

        assert status == "degraded"

    def test_unknown_when_no_kin(self, healthy_system_metrics):
        """Should return unknown when no Kin configured."""
        kin_summary: KinSummary = {
            "active_kin_count": 0,
            "total_kin_count": 0,
            "healthy_count": 0,
            "unhealthy_count": 0,
            "unknown_count": 0,
        }

        status = determine_overall_status(kin_summary, healthy_system_metrics, {})

        assert status == "unknown"


class TestGenerateAlerts:
    """Tests for generate_alerts function."""

    def test_no_alerts_when_healthy(self, healthy_system_metrics):
        """Should generate no alerts when everything is healthy."""
        kin_summary: KinSummary = {
            "active_kin_count": 1,
            "total_kin_count": 1,
            "healthy_count": 1,
            "unhealthy_count": 0,
            "unknown_count": 0,
        }
        health_summary = {"kin-1": {"status": "healthy", "error_count": 0}}

        alerts = generate_alerts(kin_summary, healthy_system_metrics, health_summary)

        assert len(alerts) == 0

    def test_alert_for_unhealthy_kin(self, healthy_system_metrics):
        """Should generate alert for unhealthy Kin."""
        kin_summary: KinSummary = {
            "active_kin_count": 1,
            "total_kin_count": 1,
            "healthy_count": 0,
            "unhealthy_count": 1,
            "unknown_count": 0,
        }
        health_summary = {
            "kin-1": {"status": "unhealthy", "error_count": 1, "last_error": "Connection refused"}
        }

        alerts = generate_alerts(kin_summary, healthy_system_metrics, health_summary)

        assert len(alerts) == 1
        assert alerts[0]["severity"] == "warning"
        assert "kin-1" in alerts[0]["message"]
        assert "Connection refused" in alerts[0]["message"]

    def test_critical_alert_for_high_error_count(self, healthy_system_metrics):
        """Should generate critical alert for 3+ consecutive errors."""
        kin_summary: KinSummary = {
            "active_kin_count": 1,
            "total_kin_count": 1,
            "healthy_count": 0,
            "unhealthy_count": 1,
            "unknown_count": 0,
        }
        health_summary = {
            "kin-1": {"status": "unhealthy", "error_count": 3, "last_error": "Failed"}
        }

        alerts = generate_alerts(kin_summary, healthy_system_metrics, health_summary)

        assert len(alerts) == 1
        assert alerts[0]["severity"] == "critical"

    def test_alert_for_high_cpu(self):
        """Should generate alert for high CPU usage."""
        kin_summary: KinSummary = {
            "active_kin_count": 1,
            "total_kin_count": 1,
            "healthy_count": 1,
            "unhealthy_count": 0,
            "unknown_count": 0,
        }
        metrics: VpsMetrics = {
            "cpu_percent": 85.0,
            "memory_percent": 50.0,
            "disk_percent": 50.0,
            "uptime_seconds": 1000,
            "load_average": [2.0, 1.5, 1.0],
            "network_in_bytes": 0,
            "network_out_bytes": 0,
        }
        health_summary = {"kin-1": {"status": "healthy", "error_count": 0}}

        alerts = generate_alerts(kin_summary, metrics, health_summary)

        assert len(alerts) == 1
        assert alerts[0]["severity"] == "warning"
        assert "CPU" in alerts[0]["message"]

    def test_critical_alert_for_high_memory(self):
        """Should generate critical alert for very high memory usage."""
        kin_summary: KinSummary = {
            "active_kin_count": 1,
            "total_kin_count": 1,
            "healthy_count": 1,
            "unhealthy_count": 0,
            "unknown_count": 0,
        }
        metrics: VpsMetrics = {
            "cpu_percent": 50.0,
            "memory_percent": 96.0,
            "disk_percent": 50.0,
            "uptime_seconds": 1000,
            "load_average": [1.0, 1.0, 1.0],
            "network_in_bytes": 0,
            "network_out_bytes": 0,
        }
        health_summary = {"kin-1": {"status": "healthy", "error_count": 0}}

        alerts = generate_alerts(kin_summary, metrics, health_summary)

        assert len(alerts) == 1
        assert alerts[0]["severity"] == "critical"
        assert "memory" in alerts[0]["message"].lower()


class TestValidateVpsHealthStatus:
    """Tests for validate_vps_health_status function."""

    def test_validates_correct_data(self):
        """Should return True for valid data."""
        data = {
            "record_id": "vhs-abc12345",
            "schema_family": "vps_health_status",
            "vps_id": "vps-test",
            "overall_status": "healthy",
            "last_check_timestamp": "2024-01-15T10:30:00Z",
            "created_at": "2024-01-15T10:30:00Z",
        }

        assert validate_vps_health_status(data) is True

    def test_rejects_missing_required_field(self):
        """Should return False when required field is missing."""
        data = {
            "record_id": "vhs-abc12345",
            "schema_family": "vps_health_status",
            "vps_id": "vps-test",
            # missing overall_status
            "last_check_timestamp": "2024-01-15T10:30:00Z",
            "created_at": "2024-01-15T10:30:00Z",
        }

        assert validate_vps_health_status(data) is False

    def test_rejects_invalid_schema_family(self):
        """Should return False for wrong schema_family."""
        data = {
            "record_id": "vhs-abc12345",
            "schema_family": "wrong_family",
            "vps_id": "vps-test",
            "overall_status": "healthy",
            "last_check_timestamp": "2024-01-15T10:30:00Z",
            "created_at": "2024-01-15T10:30:00Z",
        }

        assert validate_vps_health_status(data) is False

    def test_rejects_invalid_overall_status(self):
        """Should return False for invalid overall_status."""
        data = {
            "record_id": "vhs-abc12345",
            "schema_family": "vps_health_status",
            "vps_id": "vps-test",
            "overall_status": "invalid_status",
            "last_check_timestamp": "2024-01-15T10:30:00Z",
            "created_at": "2024-01-15T10:30:00Z",
        }

        assert validate_vps_health_status(data) is False

    def test_rejects_invalid_record_id_format(self):
        """Should return False for record_id without vhs- prefix."""
        data = {
            "record_id": "wrong-prefix-123",
            "schema_family": "vps_health_status",
            "vps_id": "vps-test",
            "overall_status": "healthy",
            "last_check_timestamp": "2024-01-15T10:30:00Z",
            "created_at": "2024-01-15T10:30:00Z",
        }

        assert validate_vps_health_status(data) is False
