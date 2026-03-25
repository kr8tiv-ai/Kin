"""Tailscale API client for Kin platform VPN management.

Provides device listing, auth key generation, and network status
for the Tailscale Auto-Setup Flow in Mission Control.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import requests

# Configure logging
logger = logging.getLogger(__name__)


class DeviceStatus(Enum):
    """Device online status."""
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


@dataclass
class TailscaleDevice:
    """Tailscale device information."""
    device_id: str
    hostname: str
    ip_addresses: list[str]
    online: bool
    last_seen: str
    os: str
    user: str | None = None
    tags: list[str] = field(default_factory=list)
    is_kin_host: bool = False
    kin_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "device_id": self.device_id,
            "hostname": self.hostname,
            "ip_addresses": self.ip_addresses,
            "online": self.online,
            "last_seen": self.last_seen,
            "os": self.os,
        }
        if self.user is not None:
            result["user"] = self.user
        if self.tags:
            result["tags"] = self.tags
        if self.is_kin_host:
            result["is_kin_host"] = self.is_kin_host
        if self.kin_id is not None:
            result["kin_id"] = self.kin_id
        return result

    @classmethod
    def from_api_response(cls, data: dict[str, Any]) -> "TailscaleDevice":
        """Create TailscaleDevice from Tailscale API response."""
        # Extract IP addresses
        ips = []
        if "addresses" in data:
            ips = data["addresses"]
        elif "ipAddresses" in data:
            ips = data["ipAddresses"]

        # Determine if this is a Kin host based on tags or hostname
        tags = data.get("tags", [])
        hostname = data.get("hostname", "")
        is_kin_host = "tag:kin-host" in tags or "-host" in hostname

        # Extract kin_id from tags if present
        kin_id = None
        for tag in tags:
            if tag.startswith("tag:kin:"):
                kin_id = tag.replace("tag:kin:", "")
                break

        return cls(
            device_id=data.get("id", data.get("nodeId", "")),
            hostname=hostname,
            ip_addresses=ips,
            online=data.get("online", False),
            last_seen=data.get("lastSeen", datetime.now(timezone.utc).isoformat()),
            os=data.get("os", "unknown"),
            user=data.get("user", data.get("owner", None)),
            tags=tags,
            is_kin_host=is_kin_host,
            kin_id=kin_id,
        )


@dataclass
class TailscaleNetworkHealth:
    """Network health summary."""
    total_devices: int
    online_devices: int
    offline_devices: int
    health_score: float
    last_check: str

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "total_devices": self.total_devices,
            "online_devices": self.online_devices,
            "offline_devices": self.offline_devices,
            "health_score": self.health_score,
            "last_check": self.last_check,
        }

    @classmethod
    def from_devices(cls, devices: list[TailscaleDevice]) -> "TailscaleNetworkHealth":
        """Calculate network health from device list."""
        total = len(devices)
        online = sum(1 for d in devices if d.online)
        offline = total - online

        # Health score: 100 if all online, scales down with offline devices
        health_score = (online / total * 100) if total > 0 else 0

        return cls(
            total_devices=total,
            online_devices=online,
            offline_devices=offline,
            health_score=round(health_score, 1),
            last_check=datetime.now(timezone.utc).isoformat(),
        )


@dataclass
class AuthKeyInfo:
    """Information about an auth key (not the key itself)."""
    key_id: str
    expires_at: str
    reusable: bool

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "key_id": self.key_id,
            "expires_at": self.expires_at,
            "reusable": self.reusable,
        }


@dataclass
class TailscaleStatus:
    """Complete Tailscale network status."""
    record_id: str
    tailnet: str
    devices: list[TailscaleDevice]
    network_health: TailscaleNetworkHealth
    auth_key: AuthKeyInfo | None = None
    schema_family: str = "tailscale_status"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            "record_id": self.record_id,
            "schema_family": self.schema_family,
            "tailnet": self.tailnet,
            "devices": [d.to_dict() for d in self.devices],
            "network_health": self.network_health.to_dict(),
            "created_at": self.created_at,
        }
        if self.auth_key is not None:
            result["auth_key"] = self.auth_key.to_dict()
        return result


class TailscaleClient:
    """Client for Tailscale API operations.

    Provides methods for device management, auth key generation,
    and network status retrieval.
    """

    API_BASE_URL = "https://api.tailscale.com/api/v2"

    def __init__(
        self,
        api_key: str | None = None,
        tailnet: str | None = None,
        use_mock: bool = False,
    ):
        """Initialize Tailscale client.

        Args:
            api_key: Tailscale API key (or set TAILSCALE_API_KEY env var)
            tailnet: Tailnet name (or set TAILSCALE_TAILNET env var)
            use_mock: If True, return mock data instead of calling API
        """
        self.api_key = api_key or os.environ.get("TAILSCALE_API_KEY", "")
        self.tailnet = tailnet or os.environ.get("TAILSCALE_TAILNET", "kr8tiv-kin")
        self.use_mock = use_mock or not self.api_key

        if self.use_mock:
            logger.info("TailscaleClient using mock mode (no API key provided)")

    def _get_headers(self) -> dict[str, str]:
        """Get API request headers."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Make an API request to Tailscale.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            data: Request body data

        Returns:
            API response as dictionary

        Raises:
            requests.HTTPError: If API request fails
        """
        if self.use_mock:
            return self._get_mock_response(endpoint)

        url = f"{self.API_BASE_URL}{endpoint}"
        response = requests.request(
            method=method,
            url=url,
            headers=self._get_headers(),
            json=data,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def _get_mock_response(self, endpoint: str) -> dict[str, Any]:
        """Return mock responses for development/testing."""
        if "devices" in endpoint:
            return {
                "devices": [
                    {
                        "id": "dev-abc123",
                        "nodeId": "node-abc123",
                        "hostname": "cipher-host",
                        "addresses": ["100.64.0.1", "fd7a:115c:a1e0::1"],
                        "online": True,
                        "lastSeen": datetime.now(timezone.utc).isoformat(),
                        "os": "linux",
                        "user": "owner@kr8tiv.ai",
                        "tags": ["tag:kin-host", "tag:production"],
                    },
                    {
                        "id": "dev-def456",
                        "nodeId": "node-def456",
                        "hostname": "mobile-phone",
                        "addresses": ["100.64.0.2"],
                        "online": True,
                        "lastSeen": datetime.now(timezone.utc).isoformat(),
                        "os": "ios",
                        "user": "owner@kr8tiv.ai",
                        "tags": ["tag:mobile"],
                    },
                    {
                        "id": "dev-ghi789",
                        "nodeId": "node-ghi789",
                        "hostname": "laptop",
                        "addresses": ["100.64.0.3"],
                        "online": False,
                        "lastSeen": "2026-03-23T18:00:00Z",
                        "os": "macos",
                        "user": "owner@kr8tiv.ai",
                        "tags": [],
                    },
                ]
            }
        elif "keys" in endpoint:
            return {
                "id": f"key-{uuid.uuid4().hex[:8]}",
                "key": f"tskey-auth-k{uuid.uuid4().hex}",
                "expires": "2026-04-24T00:00:00Z",
                "reusable": True,
            }
        return {}

    def get_devices(self) -> list[TailscaleDevice]:
        """Get all devices in the tailnet.

        Returns:
            List of TailscaleDevice objects
        """
        endpoint = f"/tailnet/{self.tailnet}/devices"
        response = self._make_request("GET", endpoint)
        devices_data = response.get("devices", [])
        return [TailscaleDevice.from_api_response(d) for d in devices_data]

    def get_device(self, device_id: str) -> TailscaleDevice | None:
        """Get a specific device by ID.

        Args:
            device_id: Tailscale device ID

        Returns:
            TailscaleDevice or None if not found
        """
        devices = self.get_devices()
        for device in devices:
            if device.device_id == device_id:
                return device
        return None

    def generate_auth_key(
        self,
        reusable: bool = True,
        expiry_seconds: int = 2592000,  # 30 days
        tags: list[str] | None = None,
    ) -> tuple[str, AuthKeyInfo]:
        """Generate a new auth key for device authorization.

        Args:
            reusable: Whether the key can be used multiple times
            expiry_seconds: Seconds until key expires (default 30 days)
            tags: ACL tags to apply to devices using this key

        Returns:
            Tuple of (auth_key_string, AuthKeyInfo)
        """
        endpoint = f"/tailnet/{self.tailnet}/keys"
        data = {
            "capabilities": {
                "devices": {
                    "create": {
                        "reusable": reusable,
                        "ephemeral": False,
                        "preauthorized": True,
                        "tags": tags or [],
                    }
                }
            },
            "expirySeconds": expiry_seconds,
        }

        response = self._make_request("POST", endpoint, data)

        # The actual key is only returned once
        auth_key = response.get("key", "")
        key_info = AuthKeyInfo(
            key_id=response.get("id", ""),
            expires_at=response.get("expires", ""),
            reusable=reusable,
        )

        logger.info(f"Generated auth key {key_info.key_id} (reusable={reusable})")
        return auth_key, key_info

    def authorize_device(self, device_id: str) -> bool:
        """Authorize a pending device.

        Args:
            device_id: Tailscale device ID to authorize

        Returns:
            True if authorization successful
        """
        endpoint = f"/device/{device_id}/authorized"
        try:
            self._make_request("POST", endpoint, {"authorized": True})
            logger.info(f"Authorized device {device_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to authorize device {device_id}: {e}")
            return False

    def delete_device(self, device_id: str) -> bool:
        """Delete a device from the tailnet.

        Args:
            device_id: Tailscale device ID to delete

        Returns:
            True if deletion successful
        """
        endpoint = f"/device/{device_id}"
        try:
            self._make_request("DELETE", endpoint)
            logger.info(f"Deleted device {device_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete device {device_id}: {e}")
            return False

    def get_status(self) -> TailscaleStatus:
        """Get complete network status.

        Returns:
            TailscaleStatus with devices, health, and auth key info
        """
        devices = self.get_devices()
        network_health = TailscaleNetworkHealth.from_devices(devices)

        return TailscaleStatus(
            record_id=f"tss-{uuid.uuid4().hex[:8]}",
            tailnet=self.tailnet,
            devices=devices,
            network_health=network_health,
        )

    def set_device_tags(self, device_id: str, tags: list[str]) -> bool:
        """Set ACL tags for a device.

        Args:
            device_id: Tailscale device ID
            tags: List of tags to apply (e.g., ["tag:kin-host"])

        Returns:
            True if successful
        """
        endpoint = f"/device/{device_id}/tags"
        try:
            self._make_request("POST", endpoint, {"tags": tags})
            logger.info(f"Set tags {tags} for device {device_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to set tags for device {device_id}: {e}")
            return False


def derive_tailscale_status_record(
    client: TailscaleClient | None = None,
) -> dict[str, Any]:
    """Derive TailscaleStatus record for Mission Control.

    This is the main entry point for the API layer.

    Args:
        client: TailscaleClient instance (creates one if not provided)

    Returns:
        TailscaleStatus as dictionary matching schema
    """
    if client is None:
        client = TailscaleClient()

    status = client.get_status()
    return status.to_dict()
