"""Health monitoring service for Kin companion processes.

Provides health checking, recovery actions, notification capabilities,
and drift detection for the VPS health monitoring system.
"""

from __future__ import annotations

import json
import logging
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from runtime_types.drift_detector import DriftDetector, BaselineMetrics

# Configure logging
logger = logging.getLogger(__name__)


class HealthStatus(Enum):
    """Health status enum for Kin processes."""
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class RecoveryTrigger(Enum):
    """Trigger types for recovery actions."""
    HEALTH_CHECK = "health-check"
    MANUAL = "manual"
    TIMEOUT = "timeout"
    THRESHOLD_EXCEEDED = "threshold-exceeded"


class RecoveryAction(Enum):
    """Recovery action types."""
    RESTART = "restart"
    NOTIFY = "notify"
    ESCALATE = "escalate"
    NO_ACTION = "no-action"


class RecoveryResult(Enum):
    """Recovery result types."""
    SUCCESS = "success"
    FAILED = "failed"
    PENDING = "pending"
    SKIPPED = "skipped"


class CheckType(Enum):
    """Health check types."""
    PING = "ping"
    HTTP = "http"
    PROCESS = "process"
    WEBSOCKET = "websocket"


@dataclass
class HealthCheckRecord:
    """Health check result record."""
    kin_id: str
    status: HealthStatus
    response_time_ms: float
    error_count: int
    record_id: str = field(default_factory=lambda: f"hcr-{uuid.uuid4().hex[:8]}")
    schema_family: str = "health_check_record"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_error: str | None = None
    check_type: CheckType = CheckType.HTTP
    endpoint: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "record_id": self.record_id,
            "schema_family": self.schema_family,
            "kin_id": self.kin_id,
            "timestamp": self.timestamp,
            "status": self.status.value,
            "response_time_ms": self.response_time_ms,
            "error_count": self.error_count,
            "last_error": self.last_error,
            "check_type": self.check_type.value,
            "endpoint": self.endpoint,
            "metadata": self.metadata,
        }


@dataclass
class RecoveryEvent:
    """Recovery action event record."""
    kin_id: str
    trigger: RecoveryTrigger
    action: RecoveryAction
    result: RecoveryResult
    record_id: str = field(default_factory=lambda: f"re-{uuid.uuid4().hex[:8]}")
    schema_family: str = "recovery_event"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    error_message: str | None = None
    previous_status: HealthStatus | None = None
    new_status: HealthStatus | None = None
    attempts: int = 1
    notification_sent: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "record_id": self.record_id,
            "schema_family": self.schema_family,
            "kin_id": self.kin_id,
            "timestamp": self.timestamp,
            "trigger": self.trigger.value,
            "action": self.action.value,
            "result": self.result.value,
            "error_message": self.error_message,
            "previous_status": self.previous_status.value if self.previous_status else None,
            "new_status": self.new_status.value if self.new_status else None,
            "attempts": self.attempts,
            "notification_sent": self.notification_sent,
            "metadata": self.metadata,
        }


@dataclass
class KinProcessConfig:
    """Configuration for a Kin process to monitor."""
    kin_id: str
    name: str
    health_endpoint: str
    process_name: str | None = None
    restart_command: str | None = None
    health_timeout_ms: int = 5000
    max_consecutive_errors: int = 3
    auto_restart: bool = True


class HealthMonitor:
    """Health monitoring service for Kin companion processes.

    Provides:
    - Health checking via HTTP endpoints or process status
    - Automatic recovery via restart commands
    - Drift detection and alerting
    - Notification dispatch for downtime events
    """

    def __init__(
        self,
        kin_configs: list[KinProcessConfig],
        notification_handler: Callable[[RecoveryEvent], bool] | None = None,
        drift_detector: "DriftDetector | None" = None,
        drift_check_interval: int = 10,  # Check drift every N health checks
    ):
        """Initialize health monitor with Kin configurations.

        Args:
            kin_configs: List of Kin process configurations to monitor.
            notification_handler: Optional callback for sending notifications.
            drift_detector: Optional DriftDetector for behavioral drift monitoring.
            drift_check_interval: Number of health checks between drift computations.
        """
        self.kin_configs = {cfg.kin_id: cfg for cfg in kin_configs}
        self.notification_handler = notification_handler
        self.drift_detector = drift_detector
        self.drift_check_interval = drift_check_interval
        
        self._error_counts: dict[str, int] = {}
        self._last_check: dict[str, HealthCheckRecord] = {}
        self._health_history: dict[str, list[HealthCheckRecord]] = {}  # For drift computation
        self._check_counter: int = 0
        self._drift_alerts: list[Any] = []  # DriftAlert objects
        self._running = False

    def check_kin_health(self, kin_id: str) -> HealthCheckRecord:
        """Check health of a single Kin process.

        Args:
            kin_id: Identifier of the Kin to check.

        Returns:
            HealthCheckRecord with check results.
        """
        if kin_id not in self.kin_configs:
            logger.warning(f"Unknown kin_id: {kin_id}")
            return HealthCheckRecord(
                kin_id=kin_id,
                status=HealthStatus.UNKNOWN,
                response_time_ms=0,
                error_count=0,
                last_error="Unknown Kin ID",
            )

        config = self.kin_configs[kin_id]
        start_time = time.time()

        try:
            # Perform HTTP health check
            import urllib.request
            import urllib.error

            req = urllib.request.Request(
                config.health_endpoint,
                method="GET",
            )
            req.add_header("User-Agent", "KinHealthMonitor/1.0")

            with urllib.request.urlopen(req, timeout=config.health_timeout_ms / 1000) as response:
                response_time_ms = (time.time() - start_time) * 1000

                if response.status == 200:
                    # Reset error count on success
                    self._error_counts[kin_id] = 0

                    record = HealthCheckRecord(
                        kin_id=kin_id,
                        status=HealthStatus.HEALTHY,
                        response_time_ms=response_time_ms,
                        error_count=0,
                        endpoint=config.health_endpoint,
                    )
                else:
                    record = self._record_error(
                        kin_id, 
                        f"HTTP {response.status}",
                        response_time_ms,
                    )
        except urllib.error.URLError as e:
            response_time_ms = (time.time() - start_time) * 1000
            record = self._record_error(kin_id, str(e.reason), response_time_ms)
        except TimeoutError:
            response_time_ms = (time.time() - start_time) * 1000
            record = self._record_error(kin_id, "Connection timeout", response_time_ms)
        except Exception as e:
            response_time_ms = (time.time() - start_time) * 1000
            record = self._record_error(kin_id, str(e), response_time_ms)

        self._last_check[kin_id] = record
        self._store_health_history(record)  # Store for drift computation
        logger.info(f"Health check for {kin_id}: {record.status.value}")
        return record

    def _record_error(
        self, 
        kin_id: str, 
        error: str, 
        response_time_ms: float
    ) -> HealthCheckRecord:
        """Record a health check error and increment error count."""
        self._error_counts[kin_id] = self._error_counts.get(kin_id, 0) + 1
        error_count = self._error_counts[kin_id]

        return HealthCheckRecord(
            kin_id=kin_id,
            status=HealthStatus.UNHEALTHY,
            response_time_ms=response_time_ms,
            error_count=error_count,
            last_error=error,
        )

    def check_all_kin(self) -> list[HealthCheckRecord]:
        """Check health of all configured Kin processes.

        Returns:
            List of HealthCheckRecords for all Kin.
        """
        records = []
        for kin_id in self.kin_configs:
            record = self.check_kin_health(kin_id)
            records.append(record)
        return records

    def restart_kin(self, kin_id: str) -> RecoveryEvent:
        """Attempt to restart an unhealthy Kin process.

        Args:
            kin_id: Identifier of the Kin to restart.

        Returns:
            RecoveryEvent with restart results.
        """
        if kin_id not in self.kin_configs:
            return RecoveryEvent(
                kin_id=kin_id,
                trigger=RecoveryTrigger.MANUAL,
                action=RecoveryAction.RESTART,
                result=RecoveryResult.FAILED,
                error_message="Unknown Kin ID",
            )

        config = self.kin_configs[kin_id]
        previous_status = self._last_check.get(kin_id)
        previous_status_val = previous_status.status if previous_status else HealthStatus.UNKNOWN

        if not config.restart_command:
            event = RecoveryEvent(
                kin_id=kin_id,
                trigger=RecoveryTrigger.MANUAL,
                action=RecoveryAction.RESTART,
                result=RecoveryResult.SKIPPED,
                error_message="No restart command configured",
                previous_status=previous_status_val,
            )
            self._send_notification(event)
            return event

        logger.info(f"Attempting restart for {kin_id}: {config.restart_command}")

        try:
            result = subprocess.run(
                config.restart_command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode == 0:
                # Verify health after restart
                time.sleep(2)  # Wait for process to start
                health = self.check_kin_health(kin_id)

                event = RecoveryEvent(
                    kin_id=kin_id,
                    trigger=RecoveryTrigger.MANUAL,
                    action=RecoveryAction.RESTART,
                    result=RecoveryResult.SUCCESS if health.status == HealthStatus.HEALTHY else RecoveryResult.FAILED,
                    previous_status=previous_status_val,
                    new_status=health.status,
                    metadata={"stdout": result.stdout[:500] if result.stdout else None},
                )
            else:
                event = RecoveryEvent(
                    kin_id=kin_id,
                    trigger=RecoveryTrigger.MANUAL,
                    action=RecoveryAction.RESTART,
                    result=RecoveryResult.FAILED,
                    error_message=result.stderr[:500] if result.stderr else "Unknown error",
                    previous_status=previous_status_val,
                    new_status=HealthStatus.UNHEALTHY,
                )
        except subprocess.TimeoutExpired:
            event = RecoveryEvent(
                kin_id=kin_id,
                trigger=RecoveryTrigger.MANUAL,
                action=RecoveryAction.RESTART,
                result=RecoveryResult.FAILED,
                error_message="Restart command timed out",
                previous_status=previous_status_val,
            )
        except Exception as e:
            event = RecoveryEvent(
                kin_id=kin_id,
                trigger=RecoveryTrigger.MANUAL,
                action=RecoveryAction.RESTART,
                result=RecoveryResult.FAILED,
                error_message=str(e),
                previous_status=previous_status_val,
            )

        self._send_notification(event)
        return event

    def notify_stakeholders(self, event: RecoveryEvent) -> bool:
        """Send notification for a recovery event.

        Args:
            event: RecoveryEvent to notify about.

        Returns:
            True if notification was sent successfully.
        """
        return self._send_notification(event)

    def _send_notification(self, event: RecoveryEvent) -> bool:
        """Internal notification handler."""
        if self.notification_handler:
            try:
                result = self.notification_handler(event)
                event.notification_sent = result
                return result
            except Exception as e:
                logger.error(f"Notification handler failed: {e}")
                return False

        # Default: log notification
        logger.warning(
            f"NOTIFICATION: {event.kin_id} recovery {event.result.value} - "
            f"action: {event.action.value}, error: {event.error_message}"
        )
        event.notification_sent = True
        return True

    def start_daemon(
        self, 
        interval_seconds: int = 30,
        on_health_check: Callable[[list[HealthCheckRecord]], None] | None = None,
        on_recovery: Callable[[RecoveryEvent], None] | None = None,
        on_drift_alert: Callable[[list[Any]], None] | None = None,
    ) -> None:
        """Start the health monitoring daemon loop.

        Args:
            interval_seconds: Seconds between health checks.
            on_health_check: Optional callback after each health check cycle.
            on_recovery: Optional callback after each recovery action.
            on_drift_alert: Optional callback when drift alerts are generated.
        """
        self._running = True
        logger.info(f"Starting health monitor daemon (interval: {interval_seconds}s)")

        while self._running:
            try:
                # Check all Kin
                records = self.check_all_kin()
                self._check_counter += 1

                if on_health_check:
                    on_health_check(records)

                # Auto-restart unhealthy Kin
                for record in records:
                    config = self.kin_configs.get(record.kin_id)
                    if (
                        record.status == HealthStatus.UNHEALTHY
                        and config
                        and config.auto_restart
                        and record.error_count >= config.max_consecutive_errors
                    ):
                        logger.info(f"Auto-restarting {record.kin_id} (errors: {record.error_count})")
                        event = RecoveryEvent(
                            kin_id=record.kin_id,
                            trigger=RecoveryTrigger.THRESHOLD_EXCEEDED,
                            action=RecoveryAction.RESTART,
                            result=RecoveryResult.PENDING,
                            previous_status=record.status,
                        )
                        
                        # Perform restart
                        restart_event = self.restart_kin(record.kin_id)
                        restart_event.trigger = RecoveryTrigger.THRESHOLD_EXCEEDED
                        
                        if on_recovery:
                            on_recovery(restart_event)

                # Check drift periodically
                if self.drift_detector and self._check_counter % self.drift_check_interval == 0:
                    drift_alerts = self.check_drift_all_kin()
                    if drift_alerts and on_drift_alert:
                        on_drift_alert(drift_alerts)

                # Wait for next interval
                time.sleep(interval_seconds)

            except KeyboardInterrupt:
                logger.info("Received interrupt, stopping daemon")
                self._running = False
            except Exception as e:
                logger.error(f"Error in daemon loop: {e}")
                time.sleep(interval_seconds)

    def stop_daemon(self) -> None:
        """Stop the health monitoring daemon."""
        self._running = False
        logger.info("Health monitor daemon stopped")

    def get_status(self) -> dict[str, Any]:
        """Get current health status summary.

        Returns:
            Summary of all Kin health status.
        """
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "kin_count": len(self.kin_configs),
            "health_summary": {
                kin_id: {
                    "status": record.status.value,
                    "error_count": record.error_count,
                    "last_check": record.timestamp,
                }
                for kin_id, record in self._last_check.items()
            },
        }

    def _store_health_history(self, record: HealthCheckRecord) -> None:
        """Store health check record for drift computation.
        
        Keeps last 100 checks per Kin.
        """
        kin_id = record.kin_id
        if kin_id not in self._health_history:
            self._health_history[kin_id] = []
        
        self._health_history[kin_id].append(record)
        # Keep last 100 records
        self._health_history[kin_id] = self._health_history[kin_id][-100:]

    def compute_drift_for_kin(self, kin_id: str) -> float | None:
        """Compute drift score for a specific Kin.
        
        Args:
            kin_id: Identifier of the Kin.
            
        Returns:
            Drift score (0-1) or None if insufficient data.
        """
        if not self.drift_detector:
            logger.debug("No drift detector configured")
            return None
        
        history = self._health_history.get(kin_id, [])
        if len(history) < 5:
            logger.debug(f"Insufficient history for drift computation: {len(history)} checks")
            return None
        
        # Compute current metrics from health history
        recent_records = history[-10:]  # Last 10 checks
        
        avg_response_time = sum(r.response_time_ms for r in recent_records) / len(recent_records) / 1000  # Convert to seconds
        error_rate = sum(r.error_count > 0 for r in recent_records) / len(recent_records)
        
        # Task completion rate approximation based on health status
        healthy_count = sum(1 for r in recent_records if r.status == HealthStatus.HEALTHY)
        task_completion_rate = healthy_count / len(recent_records)
        
        # Specialization alignment (approximated from health + error patterns)
        specialization_alignment = task_completion_rate * (1 - error_rate)
        
        if TYPE_CHECKING:
            from runtime_types.drift_detector import BaselineMetrics
        
        current_metrics = BaselineMetrics(
            avg_response_time=avg_response_time,
            task_completion_rate=task_completion_rate,
            error_rate=error_rate,
            specialization_alignment_score=specialization_alignment,
        )
        
        drift_score = self.drift_detector.compute_drift_score(kin_id, current_metrics)
        logger.info(f"Drift score for {kin_id}: {drift_score:.3f}")
        
        return drift_score

    def check_drift_all_kin(self) -> list[Any]:
        """Compute drift scores for all Kin and generate alerts.
        
        Returns:
            List of DriftAlert objects for Kin exceeding threshold.
        """
        if not self.drift_detector:
            return []
        
        alerts = []
        for kin_id in self.kin_configs:
            drift_score = self.compute_drift_for_kin(kin_id)
            
            if drift_score is not None:
                # Get recent history for trend
                history = self._health_history.get(kin_id, [])
                trend = "stable"
                if len(history) >= 6:
                    recent_scores = [getattr(r, '_drift_score', 0) for r in history[-6:]]
                    if recent_scores and recent_scores[-1] > recent_scores[0]:
                        trend = "worsening"
                    elif recent_scores and recent_scores[-1] < recent_scores[0]:
                        trend = "improving"
                
                # Check threshold and create alert if exceeded
                alert = self.drift_detector.check_threshold(
                    kin_id, 
                    drift_score,
                    details={"trend": trend, "health_check_count": len(history)}
                )
                
                if alert:
                    alerts.append(alert)
                    self._drift_alerts.append(alert)
                    logger.warning(
                        f"Drift alert for {kin_id}: score={drift_score:.2f}, "
                        f"severity={alert.severity}"
                    )
        
        return alerts

    def get_drift_alerts(self, kin_id: str | None = None, limit: int = 50) -> list[Any]:
        """Get recent drift alerts.
        
        Args:
            kin_id: Optional filter by Kin ID.
            limit: Maximum number of alerts to return.
            
        Returns:
            List of DriftAlert objects.
        """
        alerts = self._drift_alerts
        if kin_id:
            alerts = [a for a in alerts if a.kin_id == kin_id]
        return alerts[-limit:]

    def initialize_kin_baseline(
        self, 
        kin_id: str, 
        specialization: str,
        kin_name: str | None = None,
    ) -> bool:
        """Initialize drift baseline for a Kin.
        
        Args:
            kin_id: Identifier of the Kin.
            specialization: Specialization type (e.g., "web-design").
            kin_name: Optional human-readable name.
            
        Returns:
            True if baseline was initialized successfully.
        """
        if not self.drift_detector:
            logger.warning("No drift detector configured")
            return False
        
        config = self.kin_configs.get(kin_id)
        name = kin_name or (config.name if config else kin_id)
        
        self.drift_detector.initialize_baseline(
            kin_id=kin_id,
            kin_name=name,
            specialization=specialization,
        )
        
        logger.info(f"Initialized drift baseline for {kin_id} ({specialization})")
        return True
