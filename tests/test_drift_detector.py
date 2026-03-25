"""
Tests for DriftDetector class.
"""

import pytest
from datetime import datetime, timezone, timedelta

from runtime_types.drift_detector import (
    DriftDetector,
    DriftBaseline,
    DriftAlert,
    DriftStatus,
    BaselineMetrics,
    BehaviorProfile,
    KinDriftScore,
    SPECIALIZATION_PROFILES,
)


@pytest.fixture
def detector() -> DriftDetector:
    """Create a fresh DriftDetector instance for testing."""
    return DriftDetector()


@pytest.fixture
def detector_with_baseline() -> DriftDetector:
    """Create a DriftDetector with an initialized baseline."""
    detector = DriftDetector()
    detector.initialize_baseline(
        kin_id="cipher-001",
        kin_name="Cipher",
        specialization="web-design",
    )
    return detector


class TestDriftDetectorInit:
    """Test DriftDetector initialization."""

    def test_init_empty(self):
        """Detector initializes with empty state."""
        detector = DriftDetector()
        assert detector.baselines == {}
        assert detector.alerts == []
        assert detector.default_threshold == 0.20

    def test_init_with_config(self, tmp_path):
        """Detector loads configuration from file."""
        config_file = tmp_path / "drift-detection.json"
        config_file.write_text('{"default_threshold": 0.15, "severity_thresholds": {"low": 0.15, "medium": 0.25, "high": 0.35, "critical": 0.45}}')
        
        detector = DriftDetector(config_path=str(config_file))
        assert detector.default_threshold == 0.15

    def test_specialization_profiles_exist(self):
        """All Genesis Six specializations have profiles."""
        expected = {"web-design", "family-companion", "social-media", "developer-support", "creative-writing", "wealth-coaching"}
        assert set(SPECIALIZATION_PROFILES.keys()) == expected


class TestInitializeBaseline:
    """Test baseline initialization."""

    def test_initialize_baseline_creates_entry(self, detector):
        """Initializing a baseline creates a baseline entry."""
        baseline = detector.initialize_baseline(
            kin_id="cipher-001",
            kin_name="Cipher",
            specialization="web-design",
        )
        
        assert baseline.kin_id == "cipher-001"
        assert baseline.kin_name == "Cipher"
        assert baseline.specialization == "web-design"
        assert "cipher-001" in detector.baselines

    def test_initialize_baseline_uses_profile(self, detector):
        """Baseline uses specialization profile defaults."""
        baseline = detector.initialize_baseline(
            kin_id="mischief-001",
            kin_name="Mischief",
            specialization="family-companion",
        )
        
        profile = SPECIALIZATION_PROFILES["family-companion"]
        assert baseline.behavior_profile.primary_task_types == profile.primary_task_types
        assert baseline.baseline_metrics.avg_response_time == profile.avg_response_time_seconds

    def test_initialize_baseline_unknown_specialization(self, detector):
        """Unknown specialization falls back to web-design."""
        baseline = detector.initialize_baseline(
            kin_id="test-001",
            kin_name="Test",
            specialization="unknown-specialization",
        )
        
        assert baseline.specialization == "web-design"

    def test_initialize_baseline_with_custom_metrics(self, detector):
        """Custom metrics can be provided during initialization."""
        custom_metrics = BaselineMetrics(
            avg_response_time=5.0,
            task_completion_rate=0.99,
            error_rate=0.01,
            specialization_alignment_score=0.95,
        )
        
        baseline = detector.initialize_baseline(
            kin_id="vortex-001",
            kin_name="Vortex",
            specialization="social-media",
            initial_metrics=custom_metrics,
        )
        
        assert baseline.baseline_metrics.avg_response_time == 5.0
        assert baseline.baseline_metrics.task_completion_rate == 0.99


class TestComputeDriftScore:
    """Test drift score computation."""

    def test_zero_drift_when_metrics_match_baseline(self, detector_with_baseline):
        """Drift score is 0 when current metrics match baseline exactly."""
        baseline = detector_with_baseline.baselines["cipher-001"]
        matching_metrics = BaselineMetrics(
            avg_response_time=baseline.baseline_metrics.avg_response_time,
            task_completion_rate=baseline.baseline_metrics.task_completion_rate,
            error_rate=baseline.baseline_metrics.error_rate,
            specialization_alignment_score=baseline.baseline_metrics.specialization_alignment_score,
        )
        
        score = detector_with_baseline.compute_drift_score("cipher-001", matching_metrics)
        assert score == pytest.approx(0.0, abs=0.01)

    def test_high_drift_when_error_rate_increases(self, detector_with_baseline):
        """Higher error rate increases drift score."""
        baseline = detector_with_baseline.baselines["cipher-001"]
        bad_metrics = BaselineMetrics(
            avg_response_time=baseline.baseline_metrics.avg_response_time,
            task_completion_rate=baseline.baseline_metrics.task_completion_rate,
            error_rate=0.50,  # Much higher than baseline
            specialization_alignment_score=baseline.baseline_metrics.specialization_alignment_score,
        )
        
        score = detector_with_baseline.compute_drift_score("cipher-001", bad_metrics)
        assert score > 0.1

    def test_high_drift_when_completion_rate_drops(self, detector_with_baseline):
        """Lower task completion rate increases drift score."""
        baseline = detector_with_baseline.baselines["cipher-001"]
        bad_metrics = BaselineMetrics(
            avg_response_time=baseline.baseline_metrics.avg_response_time,
            task_completion_rate=0.50,  # Much lower than baseline
            error_rate=baseline.baseline_metrics.error_rate,
            specialization_alignment_score=baseline.baseline_metrics.specialization_alignment_score,
        )
        
        score = detector_with_baseline.compute_drift_score("cipher-001", bad_metrics)
        assert score > 0.1

    def test_drift_score_bounded_0_to_1(self, detector_with_baseline):
        """Drift score is always between 0 and 1."""
        extreme_metrics = BaselineMetrics(
            avg_response_time=1000.0,
            task_completion_rate=0.0,
            error_rate=1.0,
            specialization_alignment_score=0.0,
        )
        
        score = detector_with_baseline.compute_drift_score("cipher-001", extreme_metrics)
        assert 0.0 <= score <= 1.0

    def test_drift_score_tracked_for_trend(self, detector_with_baseline):
        """Drift scores are tracked for trend computation."""
        metrics = BaselineMetrics(
            avg_response_time=20.0,
            task_completion_rate=0.85,
            error_rate=0.10,
            specialization_alignment_score=0.80,
        )
        
        detector_with_baseline.compute_drift_score("cipher-001", metrics)
        detector_with_baseline.compute_drift_score("cipher-001", metrics)
        
        assert len(detector_with_baseline.recent_scores["cipher-001"]) == 2

    def test_compute_drift_auto_initializes_missing_baseline(self, detector):
        """Computing drift for unknown Kin auto-initializes baseline."""
        metrics = BaselineMetrics(
            avg_response_time=15.0,
            task_completion_rate=0.90,
            error_rate=0.05,
            specialization_alignment_score=0.85,
        )
        
        score = detector.compute_drift_score("unknown-001", metrics)
        assert "unknown-001" in detector.baselines
        assert 0.0 <= score <= 1.0


class TestCheckThreshold:
    """Test threshold checking and alert creation."""

    def test_no_alert_below_threshold(self, detector_with_baseline):
        """No alert when drift score is below threshold."""
        alert = detector_with_baseline.check_threshold("cipher-001", 0.10)
        assert alert is None

    def test_alert_created_above_threshold(self, detector_with_baseline):
        """Alert created when drift score exceeds threshold."""
        alert = detector_with_baseline.check_threshold("cipher-001", 0.35)
        
        assert alert is not None
        assert alert.kin_id == "cipher-001"
        assert alert.drift_score == 0.35
        assert alert.threshold == 0.20
        assert not alert.acknowledged

    def test_severity_determined_correctly(self, detector):
        """Alert severity matches drift score magnitude."""
        detector.initialize_baseline("test-001", "Test", "web-design")
        
        # Low severity (0.20-0.30)
        alert = detector.check_threshold("test-001", 0.25)
        assert alert.severity == "low"
        
        # Medium severity (0.30-0.40)
        alert = detector.check_threshold("test-001", 0.35)
        assert alert.severity == "medium"
        
        # High severity (0.40-0.50)
        alert = detector.check_threshold("test-001", 0.45)
        assert alert.severity == "high"
        
        # Critical severity (0.50+)
        alert = detector.check_threshold("test-001", 0.60)
        assert alert.severity == "critical"

    def test_alert_added_to_list(self, detector_with_baseline):
        """Alert is added to the alerts list."""
        initial_count = len(detector_with_baseline.alerts)
        detector_with_baseline.check_threshold("cipher-001", 0.35)
        
        assert len(detector_with_baseline.alerts) == initial_count + 1

    def test_custom_threshold_override(self, detector):
        """Custom threshold override is respected."""
        detector.initialize_baseline("test-001", "Test", "web-design")
        detector.baselines["test-001"].drift_threshold_override = 0.10
        
        alert = detector.check_threshold("test-001", 0.15)
        
        assert alert is not None
        assert alert.threshold == 0.10


class TestGetDriftStatus:
    """Test aggregate drift status computation."""

    def test_empty_status_when_no_baselines(self, detector):
        """Empty status when no Kin are tracked."""
        status = detector.get_drift_status()
        
        assert len(status.kin_drift_scores) == 0
        assert status.overall_health == "stable"
        assert status.alert_count_24h == 0

    def test_status_includes_all_kin(self, detector):
        """Status includes all tracked Kin."""
        detector.initialize_baseline("cipher-001", "Cipher", "web-design")
        detector.initialize_baseline("mischief-001", "Mischief", "family-companion")
        
        status = detector.get_drift_status()
        
        assert len(status.kin_drift_scores) == 2
        kin_ids = {s.kin_id for s in status.kin_drift_scores}
        assert kin_ids == {"cipher-001", "mischief-001"}

    def test_overall_health_stable(self, detector):
        """Overall health is stable when all Kin are healthy."""
        detector.initialize_baseline("cipher-001", "Cipher", "web-design")
        
        status = detector.get_drift_status()
        
        assert status.overall_health == "stable"

    def test_overall_health_warning_with_alerts(self, detector):
        """Overall health is warning when there are high severity alerts."""
        detector.initialize_baseline("cipher-001", "Cipher", "web-design")
        detector.check_threshold("cipher-001", 0.45)  # High severity
        
        status = detector.get_drift_status()
        
        assert status.overall_health == "warning"

    def test_overall_health_critical_with_critical_kin(self, detector):
        """Overall health is critical when a Kin has critical status."""
        detector.initialize_baseline("cipher-001", "Cipher", "web-design")
        
        # Create high drift score to trigger critical status
        bad_metrics = BaselineMetrics(
            avg_response_time=500.0,
            task_completion_rate=0.0,
            error_rate=1.0,
            specialization_alignment_score=0.0,
        )
        detector.compute_drift_score("cipher-001", bad_metrics)
        
        status = detector.get_drift_status()
        
        assert status.overall_health == "critical"

    def test_status_counts_alerts_24h(self, detector):
        """Status correctly counts alerts in last 24 hours."""
        detector.initialize_baseline("cipher-001", "Cipher", "web-design")
        detector.check_threshold("cipher-001", 0.35)
        detector.check_threshold("cipher-001", 0.45)
        
        status = detector.get_drift_status()
        
        assert status.alert_count_24h == 2


class TestResetBaseline:
    """Test baseline reset functionality."""

    def test_reset_baseline_updates_metrics(self, detector_with_baseline):
        """Reset baseline updates metrics."""
        new_metrics = BaselineMetrics(
            avg_response_time=20.0,
            task_completion_rate=0.85,
            error_rate=0.05,
            specialization_alignment_score=0.88,
        )
        
        baseline = detector_with_baseline.reset_baseline("cipher-001", new_metrics)
        
        assert baseline.baseline_metrics.avg_response_time == 20.0
        assert baseline.baseline_metrics.task_completion_rate == 0.85

    def test_reset_baseline_updates_timestamp(self, detector_with_baseline):
        """Reset baseline updates last_updated_at timestamp."""
        old_timestamp = detector_with_baseline.baselines["cipher-001"].last_updated_at
        
        baseline = detector_with_baseline.reset_baseline("cipher-001")
        
        assert baseline.last_updated_at > old_timestamp

    def test_reset_baseline_increases_confidence(self, detector_with_baseline):
        """Reset baseline increases confidence score."""
        old_confidence = detector_with_baseline.baselines["cipher-001"].confidence_score
        
        baseline = detector_with_baseline.reset_baseline("cipher-001")
        
        assert baseline.confidence_score > old_confidence

    def test_reset_baseline_unknown_kin_raises(self, detector):
        """Resetting baseline for unknown Kin raises error."""
        with pytest.raises(ValueError, match="No baseline"):
            detector.reset_baseline("unknown-001")


class TestAcknowledgeAlert:
    """Test alert acknowledgment."""

    def test_acknowledge_alert(self, detector_with_baseline):
        """Alert can be acknowledged."""
        alert = detector_with_baseline.check_threshold("cipher-001", 0.35)
        assert alert is not None
        
        acknowledged = detector_with_baseline.acknowledge_alert(alert.record_id)
        
        assert acknowledged is not None
        assert acknowledged.acknowledged
        assert acknowledged.acknowledged_at is not None

    def test_acknowledge_unknown_alert(self, detector):
        """Acknowledging unknown alert returns None."""
        result = detector.acknowledge_alert("unknown-alert-id")
        assert result is None


class TestGetRecentAlerts:
    """Test retrieving recent alerts."""

    def test_get_recent_alerts_empty(self, detector):
        """No alerts when none exist."""
        alerts = detector.get_recent_alerts()
        assert alerts == []

    def test_get_recent_alerts_limited(self, detector_with_baseline):
        """Recent alerts are limited to specified count."""
        for i in range(10):
            detector_with_baseline.check_threshold("cipher-001", 0.30 + i * 0.01)
        
        alerts = detector_with_baseline.get_recent_alerts(limit=5)
        assert len(alerts) == 5

    def test_get_recent_alerts_filtered_by_kin(self, detector):
        """Alerts can be filtered by Kin ID."""
        detector.initialize_baseline("cipher-001", "Cipher", "web-design")
        detector.initialize_baseline("mischief-001", "Mischief", "family-companion")
        
        detector.check_threshold("cipher-001", 0.35)
        detector.check_threshold("mischief-001", 0.35)
        
        cipher_alerts = detector.get_recent_alerts(kin_id="cipher-001")
        
        assert len(cipher_alerts) == 1
        assert cipher_alerts[0].kin_id == "cipher-001"


class TestTrendComputation:
    """Test trend computation from recent scores."""

    def test_trend_improving(self, detector_with_baseline):
        """Trend shows improving when scores decrease."""
        metrics = BaselineMetrics(
            avg_response_time=15.0,
            task_completion_rate=0.90,
            error_rate=0.05,
            specialization_alignment_score=0.88,
        )
        
        # Create worsening then improving trend
        for _ in range(2):
            detector_with_baseline.compute_drift_score("cipher-001", BaselineMetrics(
                avg_response_time=50.0,
                task_completion_rate=0.50,
                error_rate=0.30,
                specialization_alignment_score=0.50,
            ))
        
        for _ in range(3):
            detector_with_baseline.compute_drift_score("cipher-001", metrics)
        
        status = detector_with_baseline.get_drift_status()
        kin_score = next(s for s in status.kin_drift_scores if s.kin_id == "cipher-001")
        
        assert kin_score.trend == "improving"

    def test_trend_worsening(self, detector_with_baseline):
        """Trend shows worsening when scores increase."""
        for _ in range(3):
            detector_with_baseline.compute_drift_score("cipher-001", BaselineMetrics(
                avg_response_time=50.0,
                task_completion_rate=0.50,
                error_rate=0.30,
                specialization_alignment_score=0.50,
            ))
        
        status = detector_with_baseline.get_drift_status()
        kin_score = next(s for s in status.kin_drift_scores if s.kin_id == "cipher-001")
        
        assert kin_score.trend == "worsening"
