"""Unit tests for TailscaleClient."""

import pytest
from datetime import datetime, timezone

from runtime_types.tailscale_client import (
    TailscaleClient,
    TailscaleDevice,
    TailscaleNetworkHealth,
    TailscaleStatus,
    AuthKeyInfo,
    derive_tailscale_status_record,
)


class TestTailscaleDevice:
    """Tests for TailscaleDevice dataclass."""

    def test_to_dict_includes_required_fields(self):
        """Test that to_dict includes all required fields."""
        device = TailscaleDevice(
            device_id="dev-123",
            hostname="test-host",
            ip_addresses=["100.64.0.1"],
            online=True,
            last_seen="2026-03-24T00:00:00Z",
            os="linux",
        )
        result = device.to_dict()

        assert result["device_id"] == "dev-123"
        assert result["hostname"] == "test-host"
        assert result["ip_addresses"] == ["100.64.0.1"]
        assert result["online"] is True
        assert result["last_seen"] == "2026-03-24T00:00:00Z"
        assert result["os"] == "linux"

    def test_to_dict_omits_optional_fields_when_none(self):
        """Test that optional fields are omitted when None."""
        device = TailscaleDevice(
            device_id="dev-123",
            hostname="test-host",
            ip_addresses=["100.64.0.1"],
            online=True,
            last_seen="2026-03-24T00:00:00Z",
            os="linux",
        )
        result = device.to_dict()

        assert "user" not in result
        assert "kin_id" not in result
        assert "is_kin_host" not in result

    def test_to_dict_includes_kin_fields_when_set(self):
        """Test that Kin-related fields are included when set."""
        device = TailscaleDevice(
            device_id="dev-123",
            hostname="cipher-host",
            ip_addresses=["100.64.0.1"],
            online=True,
            last_seen="2026-03-24T00:00:00Z",
            os="linux",
            is_kin_host=True,
            kin_id="kin-cipher",
        )
        result = device.to_dict()

        assert result["is_kin_host"] is True
        assert result["kin_id"] == "kin-cipher"

    def test_from_api_response_extracts_ips(self):
        """Test that IP addresses are extracted from API response."""
        data = {
            "id": "dev-456",
            "hostname": "my-device",
            "addresses": ["100.64.0.5", "fd7a:115c:a1e0::5"],
            "online": True,
            "lastSeen": "2026-03-24T01:00:00Z",
            "os": "windows",
        }
        device = TailscaleDevice.from_api_response(data)

        assert device.device_id == "dev-456"
        assert device.ip_addresses == ["100.64.0.5", "fd7a:115c:a1e0::5"]

    def test_from_api_response_detects_kin_host_by_tag(self):
        """Test that Kin hosts are detected via tags."""
        data = {
            "id": "dev-789",
            "hostname": "server",
            "addresses": ["100.64.0.10"],
            "online": True,
            "lastSeen": "2026-03-24T02:00:00Z",
            "os": "linux",
            "tags": ["tag:kin-host", "tag:production"],
        }
        device = TailscaleDevice.from_api_response(data)

        assert device.is_kin_host is True

    def test_from_api_response_detects_kin_host_by_hostname(self):
        """Test that Kin hosts are detected via hostname pattern."""
        data = {
            "id": "dev-abc",
            "hostname": "cipher-host",
            "addresses": ["100.64.0.11"],
            "online": True,
            "lastSeen": "2026-03-24T02:00:00Z",
            "os": "linux",
            "tags": [],
        }
        device = TailscaleDevice.from_api_response(data)

        assert device.is_kin_host is True

    def test_from_api_response_extracts_kin_id_from_tag(self):
        """Test that kin_id is extracted from tag:kin:* tag."""
        data = {
            "id": "dev-xyz",
            "hostname": "server",
            "addresses": ["100.64.0.12"],
            "online": True,
            "lastSeen": "2026-03-24T02:00:00Z",
            "os": "linux",
            "tags": ["tag:kin:cipher", "tag:production"],
        }
        device = TailscaleDevice.from_api_response(data)

        assert device.kin_id == "cipher"


class TestTailscaleNetworkHealth:
    """Tests for TailscaleNetworkHealth dataclass."""

    def test_from_devices_calculates_health(self):
        """Test health calculation from device list."""
        devices = [
            TailscaleDevice("d1", "h1", [], True, "", "linux"),
            TailscaleDevice("d2", "h2", [], True, "", "linux"),
            TailscaleDevice("d3", "h3", [], False, "", "linux"),
        ]
        health = TailscaleNetworkHealth.from_devices(devices)

        assert health.total_devices == 3
        assert health.online_devices == 2
        assert health.offline_devices == 1
        assert health.health_score == 66.7

    def test_from_devices_empty_list(self):
        """Test health calculation with empty device list."""
        health = TailscaleNetworkHealth.from_devices([])

        assert health.total_devices == 0
        assert health.online_devices == 0
        assert health.offline_devices == 0
        assert health.health_score == 0

    def test_from_devices_all_online(self):
        """Test health calculation with all devices online."""
        devices = [
            TailscaleDevice("d1", "h1", [], True, "", "linux"),
            TailscaleDevice("d2", "h2", [], True, "", "linux"),
        ]
        health = TailscaleNetworkHealth.from_devices(devices)

        assert health.health_score == 100.0


class TestTailscaleStatus:
    """Tests for TailscaleStatus dataclass."""

    def test_to_dict_structure(self):
        """Test that status to_dict matches schema structure."""
        devices = [
            TailscaleDevice("d1", "h1", ["100.64.0.1"], True, "", "linux"),
        ]
        health = TailscaleNetworkHealth.from_devices(devices)
        status = TailscaleStatus(
            record_id="tss-test123",
            tailnet="test-tailnet",
            devices=devices,
            network_health=health,
        )
        result = status.to_dict()

        assert result["record_id"] == "tss-test123"
        assert result["schema_family"] == "tailscale_status"
        assert result["tailnet"] == "test-tailnet"
        assert "devices" in result
        assert "network_health" in result
        assert "created_at" in result

    def test_to_dict_omits_auth_key_when_none(self):
        """Test that auth_key is omitted when None."""
        devices = []
        health = TailscaleNetworkHealth.from_devices(devices)
        status = TailscaleStatus(
            record_id="tss-test",
            tailnet="test",
            devices=devices,
            network_health=health,
        )
        result = status.to_dict()

        assert "auth_key" not in result


class TestTailscaleClient:
    """Tests for TailscaleClient."""

    def test_initializes_with_mock_mode_when_no_api_key(self):
        """Test that client uses mock mode without API key."""
        client = TailscaleClient(api_key="", tailnet="test")

        assert client.use_mock is True

    def test_get_devices_returns_mock_data(self):
        """Test that get_devices returns mock data in mock mode."""
        client = TailscaleClient(api_key="", tailnet="test", use_mock=True)
        devices = client.get_devices()

        assert len(devices) >= 1
        assert all(isinstance(d, TailscaleDevice) for d in devices)

    def test_get_device_finds_by_id(self):
        """Test that get_device finds a specific device."""
        client = TailscaleClient(api_key="", tailnet="test", use_mock=True)
        device = client.get_device("dev-abc123")

        assert device is not None
        assert device.device_id == "dev-abc123"

    def test_get_device_returns_none_for_unknown(self):
        """Test that get_device returns None for unknown ID."""
        client = TailscaleClient(api_key="", tailnet="test", use_mock=True)
        device = client.get_device("nonexistent")

        assert device is None

    def test_generate_auth_key_returns_key_and_info(self):
        """Test that generate_auth_key returns key string and info."""
        client = TailscaleClient(api_key="", tailnet="test", use_mock=True)
        key, info = client.generate_auth_key()

        assert isinstance(key, str)
        assert key.startswith("tskey-auth-")
        assert isinstance(info, AuthKeyInfo)
        assert info.reusable is True

    def test_authorize_device_returns_true_in_mock(self):
        """Test that authorize_device succeeds in mock mode."""
        client = TailscaleClient(api_key="", tailnet="test", use_mock=True)
        result = client.authorize_device("dev-abc123")

        assert result is True

    def test_get_status_returns_complete_status(self):
        """Test that get_status returns TailscaleStatus."""
        client = TailscaleClient(api_key="", tailnet="test", use_mock=True)
        status = client.get_status()

        assert isinstance(status, TailscaleStatus)
        assert status.tailnet == "test"
        assert len(status.devices) >= 1
        assert isinstance(status.network_health, TailscaleNetworkHealth)

    def test_delete_device_returns_true_in_mock(self):
        """Test that delete_device succeeds in mock mode."""
        client = TailscaleClient(api_key="", tailnet="test", use_mock=True)
        result = client.delete_device("dev-abc123")

        assert result is True

    def test_set_device_tags_returns_true_in_mock(self):
        """Test that set_device_tags succeeds in mock mode."""
        client = TailscaleClient(api_key="", tailnet="test", use_mock=True)
        result = client.set_device_tags("dev-abc123", ["tag:test"])

        assert result is True


class TestDeriveTailscaleStatusRecord:
    """Tests for derive_tailscale_status_record function."""

    def test_returns_dict_matching_schema(self):
        """Test that returned dict matches schema structure."""
        client = TailscaleClient(api_key="", tailnet="test", use_mock=True)
        result = derive_tailscale_status_record(client)

        assert "record_id" in result
        assert result["schema_family"] == "tailscale_status"
        assert "tailnet" in result
        assert "devices" in result
        assert "network_health" in result
        assert "created_at" in result

    def test_creates_client_if_not_provided(self):
        """Test that function creates client when not provided."""
        # Should not raise
        result = derive_tailscale_status_record()

        assert isinstance(result, dict)
        assert "devices" in result


class TestAuthKeyInfo:
    """Tests for AuthKeyInfo dataclass."""

    def test_to_dict_structure(self):
        """Test that to_dict returns expected structure."""
        info = AuthKeyInfo(
            key_id="key-123",
            expires_at="2026-04-24T00:00:00Z",
            reusable=True,
        )
        result = info.to_dict()

        assert result["key_id"] == "key-123"
        assert result["expires_at"] == "2026-04-24T00:00:00Z"
        assert result["reusable"] is True
