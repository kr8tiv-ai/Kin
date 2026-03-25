"""
DriftDetector - Detects behavioral drift in Kin companions.

Compares current behavior metrics against established baselines to detect
when a Kin companion deviates significantly from expected behavior patterns.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Configure logger
logger = logging.getLogger(__name__)


@dataclass
class BehaviorProfile:
    """Expected behavior patterns for a Kin specialization."""
    primary_task_types: list[str]
    avg_task_duration_minutes: float
    task_completion_rate_target: float
    avg_response_time_seconds: float
    response_style: str
    tone: str
    engagement_level: str
    specialization_alignment_baseline: float


@dataclass
class BaselineMetrics:
    """Quantitative baseline metrics computed from historical data."""
    avg_response_time: float
    task_completion_rate: float
    error_rate: float
    specialization_alignment_score: float
    uptime_percentage: float = 100.0
    interaction_count_7d: int = 0


@dataclass
class DriftBaseline:
    """Behavior baseline for a Kin companion."""
    record_id: str
    kin_id: str
    kin_name: str
    specialization: str
    behavior_profile: BehaviorProfile
    baseline_metrics: BaselineMetrics
    created_at: datetime
    last_updated_at: datetime
    sample_size: int = 0
    confidence_score: float = 0.0
    drift_threshold_override: Optional[float] = None


@dataclass
class DeviantMetric:
    """A metric showing significant deviation from baseline."""
    current: float
    baseline: float
    deviation_percent: float
    impact: str = "medium"


@dataclass
class DriftAlert:
    """Alert generated when drift exceeds threshold."""
    record_id: str
    kin_id: str
    kin_name: str
    timestamp: datetime
    drift_score: float
    threshold: float
    severity: str
    details: dict[str, Any]
    acknowledged: bool = False
    acknowledged_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    notification_sent: bool = False
    notification_channels: list[str] = field(default_factory=list)


@dataclass
class KinDriftScore:
    """Drift score for a single Kin companion."""
    kin_id: str
    kin_name: str
    drift_score: float
    status: str
    trend: str = "stable"
    last_alert_severity: Optional[str] = None
    last_alert_at: Optional[datetime] = None


@dataclass
class DriftStatus:
    """Aggregate drift status for all Kin companions."""
    record_id: str
    timestamp: datetime
    kin_drift_scores: list[KinDriftScore]
    alert_count_24h: int
    critical_count_24h: int
    overall_health: str
    created_at: datetime
    high_count_24h: int = 0
    medium_count_24h: int = 0
    low_count_24h: int = 0


# Specialization profiles for Genesis Six bloodlines
SPECIALIZATION_PROFILES: dict[str, BehaviorProfile] = {
    "web-design": BehaviorProfile(
        primary_task_types=["website-design", "frontend-development", "ui-review", "design-teaching"],
        avg_task_duration_minutes=25,
        task_completion_rate_target=0.95,
        avg_response_time_seconds=12,
        response_style="detailed",
        tone="friendly",
        engagement_level="high",
        specialization_alignment_baseline=0.90,
    ),
    "family-companion": BehaviorProfile(
        primary_task_types=["family-activities", "personal-brand", "scheduling", "reminders"],
        avg_task_duration_minutes=10,
        task_completion_rate_target=0.98,
        avg_response_time_seconds=8,
        response_style="balanced",
        tone="casual",
        engagement_level="very-high",
        specialization_alignment_baseline=0.95,
    ),
    "social-media": BehaviorProfile(
        primary_task_types=["content-creation", "post-scheduling", "engagement-tracking", "analytics"],
        avg_task_duration_minutes=15,
        task_completion_rate_target=0.92,
        avg_response_time_seconds=15,
        response_style="comprehensive",
        tone="enthusiastic",
        engagement_level="high",
        specialization_alignment_baseline=0.88,
    ),
    "developer-support": BehaviorProfile(
        primary_task_types=["code-review", "debugging", "architecture", "documentation"],
        avg_task_duration_minutes=30,
        task_completion_rate_target=0.90,
        avg_response_time_seconds=20,
        response_style="detailed",
        tone="professional",
        engagement_level="moderate",
        specialization_alignment_baseline=0.85,
    ),
    "creative-writing": BehaviorProfile(
        primary_task_types=["storytelling", "writing-assistance", "brainstorming", "editing"],
        avg_task_duration_minutes=20,
        task_completion_rate_target=0.94,
        avg_response_time_seconds=18,
        response_style="comprehensive",
        tone="friendly",
        engagement_level="high",
        specialization_alignment_baseline=0.92,
    ),
    "wealth-coaching": BehaviorProfile(
        primary_task_types=["financial-planning", "habit-tracking", "investment-analysis", "goal-setting"],
        avg_task_duration_minutes=25,
        task_completion_rate_target=0.93,
        avg_response_time_seconds=22,
        response_style="balanced",
        tone="professional",
        engagement_level="moderate",
        specialization_alignment_baseline=0.90,
    ),
}


class DriftDetector:
    """
    Detects behavioral drift in Kin companions.
    
    Drift is computed by comparing current behavior metrics against
    established baselines. Significant deviation triggers alerts.
    
    Usage:
        detector = DriftDetector(config_path="config/drift-detection.json")
        baseline = detector.initialize_baseline("cipher-001", "web-design")
        score = detector.compute_drift_score("cipher-001", health_checks)
        alert = detector.check_threshold("cipher-001", score)
    """

    def __init__(
        self,
        config_path: Optional[str] = None,
        baselines: Optional[dict[str, DriftBaseline]] = None,
        alerts: Optional[list[DriftAlert]] = None,
    ):
        """
        Initialize the drift detector.
        
        Args:
            config_path: Path to drift detection configuration file
            baselines: Pre-existing baseline data (for testing)
            alerts: Pre-existing alert history (for testing)
        """
        self.baselines: dict[str, DriftBaseline] = baselines or {}
        self.alerts: list[DriftAlert] = alerts or []
        self.recent_scores: dict[str, list[float]] = {}  # For trend computation
        
        # Load configuration
        self.config = self._load_config(config_path)
        self.default_threshold = self.config.get("default_threshold", 0.20)
        self.severity_thresholds = self.config.get("severity_thresholds", {
            "low": 0.20,
            "medium": 0.30,
            "high": 0.40,
            "critical": 0.50,
        })

    def _load_config(self, config_path: Optional[str]) -> dict[str, Any]:
        """Load configuration from file."""
        if config_path:
            path = Path(config_path)
            if path.exists():
                with open(path, "r") as f:
                    return json.load(f)
        return {}

    def initialize_baseline(
        self,
        kin_id: str,
        kin_name: str,
        specialization: str,
        initial_metrics: Optional[BaselineMetrics] = None,
    ) -> DriftBaseline:
        """
        Initialize a behavior baseline for a Kin companion.
        
        Args:
            kin_id: Unique identifier for the Kin
            kin_name: Human-readable name
            specialization: Specialization type (e.g., "web-design")
            initial_metrics: Optional initial metrics; defaults to specialization profile
            
        Returns:
            The created DriftBaseline
        """
        if specialization not in SPECIALIZATION_PROFILES:
            logger.warning(
                f"Unknown specialization '{specialization}', using web-design profile"
            )
            specialization = "web-design"

        profile = SPECIALIZATION_PROFILES[specialization]
        
        if initial_metrics is None:
            # Create default metrics from profile
            initial_metrics = BaselineMetrics(
                avg_response_time=profile.avg_response_time_seconds,
                task_completion_rate=profile.task_completion_rate_target,
                error_rate=0.02,  # Default low error rate
                specialization_alignment_score=profile.specialization_alignment_baseline,
            )

        now = datetime.now(timezone.utc)
        baseline = DriftBaseline(
            record_id=f"drift-baseline-{kin_id.replace('-', '')}",
            kin_id=kin_id,
            kin_name=kin_name,
            specialization=specialization,
            behavior_profile=profile,
            baseline_metrics=initial_metrics,
            created_at=now,
            last_updated_at=now,
            sample_size=1,
            confidence_score=0.5,
        )

        self.baselines[kin_id] = baseline
        logger.info(f"Initialized baseline for {kin_name} ({kin_id})")
        return baseline

    def compute_drift_score(
        self,
        kin_id: str,
        current_metrics: BaselineMetrics,
    ) -> float:
        """
        Compute drift score for a Kin companion.
        
        Drift score is a weighted average of deviations across metrics.
        Score ranges from 0 (no drift) to 1 (maximum drift).
        
        Args:
            kin_id: Unique identifier for the Kin
            current_metrics: Current observed metrics
            
        Returns:
            Drift score between 0 and 1
        """
        if kin_id not in self.baselines:
            logger.warning(f"No baseline for {kin_id}, initializing with defaults")
            self.initialize_baseline(kin_id, kin_id, "web-design")

        baseline = self.baselines[kin_id]
        base_metrics = baseline.baseline_metrics

        # Compute deviations for each metric
        # Weights: response_time=0.2, completion_rate=0.3, error_rate=0.25, alignment=0.25
        deviations = {}

        # Response time: higher is worse
        if base_metrics.avg_response_time > 0:
            rt_deviation = abs(current_metrics.avg_response_time - base_metrics.avg_response_time) / base_metrics.avg_response_time
            deviations["response_time"] = min(rt_deviation, 1.0) * 0.2

        # Task completion: lower is worse
        if base_metrics.task_completion_rate > 0:
            tc_deviation = (base_metrics.task_completion_rate - current_metrics.task_completion_rate) / base_metrics.task_completion_rate
            deviations["task_completion"] = max(tc_deviation, 0) * 0.3

        # Error rate: higher is worse
        if base_metrics.error_rate > 0:
            er_deviation = (current_metrics.error_rate - base_metrics.error_rate) / base_metrics.error_rate
            deviations["error_rate"] = max(min(er_deviation, 1.0), 0) * 0.25
        else:
            # If baseline error rate is 0, any error is full deviation
            deviations["error_rate"] = min(current_metrics.error_rate, 1.0) * 0.25

        # Specialization alignment: lower is worse
        if base_metrics.specialization_alignment_score > 0:
            sa_deviation = (base_metrics.specialization_alignment_score - current_metrics.specialization_alignment_score) / base_metrics.specialization_alignment_score
            deviations["specialization_alignment"] = max(sa_deviation, 0) * 0.25

        # Weighted average
        drift_score = sum(deviations.values())
        
        # Track for trend computation
        if kin_id not in self.recent_scores:
            self.recent_scores[kin_id] = []
        self.recent_scores[kin_id].append(drift_score)
        # Keep last 10 scores
        self.recent_scores[kin_id] = self.recent_scores[kin_id][-10:]

        return min(max(drift_score, 0.0), 1.0)

    def check_threshold(
        self,
        kin_id: str,
        drift_score: float,
        details: Optional[dict[str, Any]] = None,
    ) -> Optional[DriftAlert]:
        """
        Check if drift score exceeds threshold and create alert if so.
        
        Args:
            kin_id: Unique identifier for the Kin
            drift_score: Computed drift score
            details: Optional details about the deviation
            
        Returns:
            DriftAlert if threshold exceeded, None otherwise
        """
        if kin_id not in self.baselines:
            return None

        baseline = self.baselines[kin_id]
        threshold = baseline.drift_threshold_override or self.default_threshold

        if drift_score <= threshold:
            logger.debug(f"Drift score {drift_score:.2f} within threshold for {kin_id}")
            return None

        # Determine severity
        severity = "low"
        for sev, thresh in sorted(self.severity_thresholds.items(), key=lambda x: -x[1]):
            if drift_score >= thresh:
                severity = sev
                break

        now = datetime.now(timezone.utc)
        alert = DriftAlert(
            record_id=f"drift-alert-{kin_id.replace('-', '')}-{now.strftime('%Y%m%d%H%M%S')}",
            kin_id=kin_id,
            kin_name=baseline.kin_name,
            timestamp=now,
            drift_score=drift_score,
            threshold=threshold,
            severity=severity,
            details=details or {},
            created_at=now,
        )

        self.alerts.append(alert)
        logger.warning(
            f"Drift alert for {baseline.kin_name}: score={drift_score:.2f}, "
            f"threshold={threshold:.2f}, severity={severity}"
        )
        return alert

    def create_alert(
        self,
        kin_id: str,
        drift_score: float,
        deviant_metrics: dict[str, DeviantMetric],
        trend: str = "stable",
    ) -> DriftAlert:
        """
        Create a drift alert with detailed breakdown.
        
        Args:
            kin_id: Unique identifier for the Kin
            drift_score: Computed drift score
            deviant_metrics: Metrics showing significant deviation
            trend: Current trend direction
            
        Returns:
            The created DriftAlert
        """
        if kin_id not in self.baselines:
            raise ValueError(f"No baseline for {kin_id}")

        baseline = self.baselines[kin_id]
        threshold = baseline.drift_threshold_override or self.default_threshold

        # Determine severity
        severity = "low"
        for sev, thresh in sorted(self.severity_thresholds.items(), key=lambda x: -x[1]):
            if drift_score >= thresh:
                severity = sev
                break

        # Find worst deviation
        worst_metric = max(deviant_metrics.items(), key=lambda x: x[1].deviation_percent)

        now = datetime.now(timezone.utc)
        details = {
            "deviant_metrics": {
                name: {
                    "current": m.current,
                    "baseline": m.baseline,
                    "deviation_percent": m.deviation_percent,
                    "impact": m.impact,
                }
                for name, m in deviant_metrics.items()
            },
            "baseline_comparison": {
                "metrics_above_threshold": list(deviant_metrics.keys()),
                "worst_deviation": {
                    "metric_name": worst_metric[0],
                    "deviation_percent": worst_metric[1].deviation_percent,
                },
                "trend": trend,
            },
        }

        alert = DriftAlert(
            record_id=f"drift-alert-{kin_id.replace('-', '')}-{now.strftime('%Y%m%d%H%M%S')}",
            kin_id=kin_id,
            kin_name=baseline.kin_name,
            timestamp=now,
            drift_score=drift_score,
            threshold=threshold,
            severity=severity,
            details=details,
            created_at=now,
        )

        self.alerts.append(alert)
        return alert

    def get_drift_status(self) -> DriftStatus:
        """
        Get aggregate drift status for all Kin.
        
        Returns:
            DriftStatus with scores for all tracked Kin
        """
        now = datetime.now(timezone.utc)
        kin_scores: list[KinDriftScore] = []

        # Get recent alerts for 24h counts
        cutoff_24h = datetime.now(timezone.utc).timestamp() - 86400
        recent_alerts = [
            a for a in self.alerts
            if a.timestamp.timestamp() > cutoff_24h
        ]

        for kin_id, baseline in self.baselines.items():
            recent = self.recent_scores.get(kin_id, [])
            current_score = recent[-1] if recent else 0.0
            
            # Determine trend
            if len(recent) >= 3:
                recent_three = recent[-3:]
                if recent_three[-1] > recent_three[0]:
                    trend = "worsening"
                elif recent_three[-1] < recent_three[0]:
                    trend = "improving"
                else:
                    trend = "stable"
            else:
                trend = "stable"

            # Determine status
            threshold = baseline.drift_threshold_override or self.default_threshold
            if current_score < threshold * 0.5:
                status = "healthy"
            elif current_score < threshold:
                status = "warning"
            elif current_score < threshold * 1.5:
                status = "alert"
            else:
                status = "critical"

            # Find last alert for this Kin
            kin_alerts = [a for a in recent_alerts if a.kin_id == kin_id]
            last_alert = kin_alerts[-1] if kin_alerts else None

            kin_scores.append(KinDriftScore(
                kin_id=kin_id,
                kin_name=baseline.kin_name,
                drift_score=current_score,
                status=status,
                trend=trend,
                last_alert_severity=last_alert.severity if last_alert else None,
                last_alert_at=last_alert.timestamp if last_alert else None,
            ))

        # Count by severity
        severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for alert in recent_alerts:
            severity_counts[alert.severity] = severity_counts.get(alert.severity, 0) + 1

        # Determine overall health
        critical_kin = sum(1 for s in kin_scores if s.status == "critical")
        alert_kin = sum(1 for s in kin_scores if s.status == "alert")
        
        if critical_kin > 0:
            overall_health = "critical"
        elif alert_kin > 0 or severity_counts["high"] > 0:
            overall_health = "warning"
        else:
            overall_health = "stable"

        return DriftStatus(
            record_id=f"drift-status-{now.strftime('%Y%m%d')}",
            timestamp=now,
            kin_drift_scores=kin_scores,
            alert_count_24h=len(recent_alerts),
            critical_count_24h=severity_counts["critical"],
            overall_health=overall_health,
            created_at=now,
            high_count_24h=severity_counts["high"],
            medium_count_24h=severity_counts["medium"],
            low_count_24h=severity_counts["low"],
        )

    def reset_baseline(
        self,
        kin_id: str,
        new_metrics: Optional[BaselineMetrics] = None,
    ) -> DriftBaseline:
        """
        Reset baseline for a Kin companion.
        
        Args:
            kin_id: Unique identifier for the Kin
            new_metrics: Optional new metrics; if not provided, uses current baseline
            
        Returns:
            The updated DriftBaseline
        """
        if kin_id not in self.baselines:
            raise ValueError(f"No baseline for {kin_id}")

        baseline = self.baselines[kin_id]
        now = datetime.now(timezone.utc)

        baseline.baseline_metrics = new_metrics or baseline.baseline_metrics
        baseline.last_updated_at = now
        baseline.sample_size += 1
        baseline.confidence_score = min(baseline.confidence_score + 0.1, 1.0)

        logger.info(f"Reset baseline for {baseline.kin_name} ({kin_id})")
        return baseline

    def acknowledge_alert(
        self,
        alert_id: str,
        acknowledged_by: str = "owner",
    ) -> Optional[DriftAlert]:
        """
        Acknowledge a drift alert.
        
        Args:
            alert_id: Unique identifier for the alert
            acknowledged_by: Who acknowledged (owner, operator, system)
            
        Returns:
            The acknowledged DriftAlert, or None if not found
        """
        for alert in self.alerts:
            if alert.record_id == alert_id:
                alert.acknowledged = True
                alert.acknowledged_at = datetime.now(timezone.utc)
                # Note: acknowledged_by not in dataclass, storing in details
                alert.details["acknowledged_by"] = acknowledged_by
                logger.info(f"Acknowledged alert {alert_id} by {acknowledged_by}")
                return alert
        return None

    def get_kin_baseline(self, kin_id: str) -> Optional[DriftBaseline]:
        """Get baseline for a specific Kin."""
        return self.baselines.get(kin_id)

    def get_recent_alerts(self, kin_id: Optional[str] = None, limit: int = 50) -> list[DriftAlert]:
        """
        Get recent alerts, optionally filtered by Kin.
        
        Args:
            kin_id: Optional Kin ID to filter by
            limit: Maximum number of alerts to return
            
        Returns:
            List of recent DriftAlerts, newest first
        """
        alerts = self.alerts
        if kin_id:
            alerts = [a for a in alerts if a.kin_id == kin_id]
        return sorted(alerts, key=lambda a: a.timestamp, reverse=True)[:limit]
