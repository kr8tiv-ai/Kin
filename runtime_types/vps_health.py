"""VPS Health Status derivation for Mission Control dashboard.

Derives aggregate VPS health status from Kin health checks and system metrics.
This module bridges the Python health monitor daemon to the Node.js API.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, TypedDict

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False


class VpsMetrics(TypedDict):
    """System-level VPS metrics."""
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    uptime_seconds: int
    load_average: list[float]
    network_in_bytes: int
    network_out_bytes: int


class KinSummary(TypedDict):
    """Summary of Kin companion health."""
    active_kin_count: int
    total_kin_count: int
    healthy_count: int
    unhealthy_count: int
    unknown_count: int


class Alert(TypedDict):
    """Alert for VPS health issues."""
    alert_id: str
    severity: str  # info, warning, critical
    message: str
    timestamp: str


class VpsHealthStatusDict(TypedDict):
    """VpsHealthStatus as dictionary matching JSON schema."""
    record_id: str
    schema_family: str
    vps_id: str
    vps_name: str | None
    overall_status: str  # healthy, degraded, critical, unknown
    system_metrics: VpsMetrics
    kin_summary: KinSummary
    alerts: list[Alert]
    last_check_timestamp: str
    created_at: str
    schema_version: str


@dataclass
class VpsHealthStatus:
    """Aggregate health status of a VPS hosting Kin companions.
    
    Provides system metrics and Kin health summary for Mission Control dashboard.
    Matches the VpsHealthData TypeScript interface expected by useVpsHealth.ts.
    """
    vps_id: str
    overall_status: str
    kin_summary: KinSummary
    system_metrics: VpsMetrics
    record_id: str = field(default_factory=lambda: f"vhs-{uuid.uuid4().hex[:8]}")
    schema_family: str = "vps_health_status"
    vps_name: str | None = None
    alerts: list[Alert] = field(default_factory=list)
    last_check_timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    schema_version: str = "1.0.0"

    def to_dict(self) -> VpsHealthStatusDict:
        """Convert to dictionary for JSON serialization."""
        return {
            "record_id": self.record_id,
            "schema_family": self.schema_family,
            "vps_id": self.vps_id,
            "vps_name": self.vps_name,
            "overall_status": self.overall_status,
            "system_metrics": self.system_metrics,
            "kin_summary": self.kin_summary,
            "alerts": self.alerts,
            "last_check_timestamp": self.last_check_timestamp,
            "created_at": self.created_at,
            "schema_version": self.schema_version,
        }

    def to_json(self) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), indent=2)


def get_system_metrics() -> VpsMetrics:
    """Collect current system metrics using psutil.
    
    Returns default values if psutil is not available.
    """
    if not PSUTIL_AVAILABLE:
        return VpsMetrics(
            cpu_percent=0.0,
            memory_percent=0.0,
            disk_percent=0.0,
            uptime_seconds=0,
            load_average=[0.0, 0.0, 0.0],
            network_in_bytes=0,
            network_out_bytes=0,
        )
    
    # CPU usage
    cpu_percent = psutil.cpu_percent(interval=0.1)
    
    # Memory usage
    memory = psutil.virtual_memory()
    memory_percent = memory.percent
    
    # Disk usage (root partition)
    try:
        disk = psutil.disk_usage('/')
        disk_percent = disk.percent
    except Exception:
        disk_percent = 0.0
    
    # System uptime
    uptime_seconds = int(psutil.boot_time())
    current_time = int(datetime.now().timestamp())
    uptime = current_time - uptime_seconds
    
    # Load average (1, 5, 15 minutes)
    try:
        load_avg = list(psutil.getloadavg())
    except AttributeError:
        # Windows doesn't have getloadavg
        load_avg = [0.0, 0.0, 0.0]
    
    # Network I/O
    try:
        net_io = psutil.net_io_counters()
        network_in = net_io.bytes_recv if net_io else 0
        network_out = net_io.bytes_sent if net_io else 0
    except Exception:
        network_in = 0
        network_out = 0
    
    return VpsMetrics(
        cpu_percent=round(cpu_percent, 1),
        memory_percent=round(memory_percent, 1),
        disk_percent=round(disk_percent, 1),
        uptime_seconds=uptime,
        load_average=[round(x, 2) for x in load_avg],
        network_in_bytes=network_in,
        network_out_bytes=network_out,
    )


def derive_vps_health_status(
    health_monitor_status: dict[str, Any],
    vps_id: str = "vps-default",
    vps_name: str | None = None,
) -> VpsHealthStatus:
    """Derive VpsHealthStatus from HealthMonitor status and system metrics.
    
    Args:
        health_monitor_status: Output from HealthMonitor.get_status() containing
            kin_count and health_summary.
        vps_id: Identifier for the VPS instance.
        vps_name: Human-readable name for the VPS.
        
    Returns:
        VpsHealthStatus with aggregate health and system metrics.
    """
    # Extract Kin health summary
    health_summary = health_monitor_status.get("health_summary", {})
    kin_count = health_monitor_status.get("kin_count", 0)
    
    # Count Kin by status
    healthy_count = sum(
        1 for k in health_summary.values() 
        if k.get("status") == "healthy"
    )
    unhealthy_count = sum(
        1 for k in health_summary.values() 
        if k.get("status") == "unhealthy"
    )
    unknown_count = sum(
        1 for k in health_summary.values() 
        if k.get("status") == "unknown"
    )
    
    kin_summary: KinSummary = {
        "active_kin_count": healthy_count + unhealthy_count,
        "total_kin_count": kin_count,
        "healthy_count": healthy_count,
        "unhealthy_count": unhealthy_count,
        "unknown_count": unknown_count,
    }
    
    # Collect system metrics
    system_metrics = get_system_metrics()
    
    # Determine overall status
    overall_status = determine_overall_status(
        kin_summary, 
        system_metrics,
        health_summary,
    )
    
    # Generate alerts for issues
    alerts = generate_alerts(
        kin_summary,
        system_metrics,
        health_summary,
    )
    
    return VpsHealthStatus(
        vps_id=vps_id,
        vps_name=vps_name,
        overall_status=overall_status,
        kin_summary=kin_summary,
        system_metrics=system_metrics,
        alerts=alerts,
    )


def determine_overall_status(
    kin_summary: KinSummary,
    system_metrics: VpsMetrics,
    health_summary: dict[str, Any],
) -> str:
    """Determine overall VPS health status based on Kin and system metrics.
    
    Priority: critical > degraded > healthy
    
    - critical: Any Kin with 3+ consecutive errors OR system metrics in danger zone
    - degraded: Any unhealthy Kin OR elevated system metrics
    - healthy: All Kin healthy and system metrics normal
    - unknown: No Kin configured
    """
    # Check for critical conditions
    for kin_id, health in health_summary.items():
        if health.get("error_count", 0) >= 3:
            return "critical"
    
    # Check system metrics for critical
    if (
        system_metrics["cpu_percent"] > 90
        or system_metrics["memory_percent"] > 95
        or system_metrics["disk_percent"] > 95
    ):
        return "critical"
    
    # Check for degraded conditions
    if kin_summary["unhealthy_count"] > 0 or kin_summary["unknown_count"] > 0:
        return "degraded"
    
    if (
        system_metrics["cpu_percent"] > 75
        or system_metrics["memory_percent"] > 80
        or system_metrics["disk_percent"] > 85
    ):
        return "degraded"
    
    # Check for unknown (no Kin)
    if kin_summary["total_kin_count"] == 0:
        return "unknown"
    
    return "healthy"


def generate_alerts(
    kin_summary: KinSummary,
    system_metrics: VpsMetrics,
    health_summary: dict[str, Any],
) -> list[Alert]:
    """Generate alerts for health issues."""
    alerts: list[Alert] = []
    now = datetime.now(timezone.utc).isoformat()
    
    # Alert for unhealthy Kin
    for kin_id, health in health_summary.items():
        if health.get("status") == "unhealthy":
            severity = "critical" if health.get("error_count", 0) >= 3 else "warning"
            alerts.append(Alert(
                alert_id=f"alert-{uuid.uuid4().hex[:8]}",
                severity=severity,
                message=f"Kin {kin_id} is unhealthy: {health.get('last_error', 'Unknown error')}",
                timestamp=now,
            ))
    
    # Alert for high CPU
    if system_metrics["cpu_percent"] > 80:
        alerts.append(Alert(
            alert_id=f"alert-{uuid.uuid4().hex[:8]}",
            severity="critical" if system_metrics["cpu_percent"] > 90 else "warning",
            message=f"High CPU usage: {system_metrics['cpu_percent']:.1f}%",
            timestamp=now,
        ))
    
    # Alert for high memory
    if system_metrics["memory_percent"] > 85:
        alerts.append(Alert(
            alert_id=f"alert-{uuid.uuid4().hex[:8]}",
            severity="critical" if system_metrics["memory_percent"] > 95 else "warning",
            message=f"High memory usage: {system_metrics['memory_percent']:.1f}%",
            timestamp=now,
        ))
    
    # Alert for high disk
    if system_metrics["disk_percent"] > 85:
        alerts.append(Alert(
            alert_id=f"alert-{uuid.uuid4().hex[:8]}",
            severity="critical" if system_metrics["disk_percent"] > 95 else "warning",
            message=f"High disk usage: {system_metrics['disk_percent']:.1f}%",
            timestamp=now,
        ))
    
    return alerts


def validate_vps_health_status(data: dict[str, Any]) -> bool:
    """Validate that data conforms to VpsHealthStatus schema.
    
    Performs basic validation of required fields and types.
    For full validation, use jsonschema with the schema file.
    """
    required_fields = [
        "record_id",
        "schema_family",
        "vps_id",
        "overall_status",
        "last_check_timestamp",
        "created_at",
    ]
    
    for field in required_fields:
        if field not in data:
            return False
    
    # Validate schema_family
    if data.get("schema_family") != "vps_health_status":
        return False
    
    # Validate overall_status
    valid_statuses = {"healthy", "degraded", "critical", "unknown"}
    if data.get("overall_status") not in valid_statuses:
        return False
    
    # Validate record_id pattern
    record_id = data.get("record_id", "")
    if not record_id.startswith("vhs-"):
        return False
    
    return True
