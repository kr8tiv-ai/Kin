#!/usr/bin/env python3
"""
Health Monitor Daemon

Background service that checks Kin health at regular intervals,
performs automatic recovery for unhealthy processes, and sends
notifications for downtime events.

Usage:
    python scripts/health_monitor_daemon.py [options]

Options:
    --interval SECONDS     Health check interval (default: 30)
    --config PATH          Path to Kin configuration file (default: ./config/kin-processes.json)
    --log-level LEVEL      Logging level: DEBUG, INFO, WARNING, ERROR (default: INFO)
    --log-file PATH        Path to log file (default: stdout)
    --once                 Run single health check and exit
    --dry-run              Show what would happen without taking actions
"""

import argparse
import json
import logging
import signal
import sys
from pathlib import Path
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from runtime_types.health_monitor import (
    HealthMonitor,
    HealthCheckRecord,
    RecoveryEvent,
    KinProcessConfig,
    HealthStatus,
)

# Configure logging
logger = logging.getLogger(__name__)


def setup_logging(log_level: str, log_file: str | None) -> None:
    """Configure logging with optional file output."""
    level = getattr(logging, log_level.upper(), logging.INFO)
    
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    
    if log_file:
        Path(log_file).parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(log_file))
    
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
    )


def load_kin_configs(config_path: str) -> list[KinProcessConfig]:
    """Load Kin process configurations from JSON file."""
    path = Path(config_path)
    
    if not path.exists():
        logger.warning(f"Config file not found: {config_path}, using defaults")
        return get_default_configs()
    
    with open(path) as f:
        data = json.load(f)
    
    configs = []
    for item in data.get("kin_processes", []):
        configs.append(KinProcessConfig(
            kin_id=item["kin_id"],
            name=item["name"],
            health_endpoint=item["health_endpoint"],
            process_name=item.get("process_name"),
            restart_command=item.get("restart_command"),
            health_timeout_ms=item.get("health_timeout_ms", 5000),
            max_consecutive_errors=item.get("max_consecutive_errors", 3),
            auto_restart=item.get("auto_restart", True),
        ))
    
    logger.info(f"Loaded {len(configs)} Kin configurations")
    return configs


def get_default_configs() -> list[KinProcessConfig]:
    """Return default Kin configurations for development."""
    return [
        KinProcessConfig(
            kin_id="cipher-001",
            name="Cipher",
            health_endpoint="http://localhost:8080/health",
            restart_command="echo 'Would restart cipher'",
            max_consecutive_errors=3,
        ),
    ]


def create_notification_handler(dry_run: bool) -> callable:
    """Create notification handler for recovery events."""
    def handle_notification(event: RecoveryEvent) -> bool:
        """Send notification for recovery event."""
        if dry_run:
            logger.info(f"[DRY RUN] Would send notification: {event.kin_id} - {event.result.value}")
            return True
        
        # Log notification (real implementation would send to Slack, email, etc.)
        logger.warning(
            f"NOTIFICATION: {event.kin_id} recovery {event.result.value} - "
            f"action: {event.action.value}, "
            f"trigger: {event.trigger.value}"
        )
        
        # TODO: Integrate with actual notification services
        # - Slack webhook
        # - Email via SMTP
        # - Telegram bot
        # - PagerDuty
        
        return True
    
    return handle_notification


def run_health_check(
    monitor: HealthMonitor,
    dry_run: bool = False,
) -> list[HealthCheckRecord]:
    """Run a single health check cycle."""
    logger.info("Running health check...")
    
    records = monitor.check_all_kin()
    
    healthy = sum(1 for r in records if r.status == HealthStatus.HEALTHY)
    unhealthy = sum(1 for r in records if r.status == HealthStatus.UNHEALTHY)
    unknown = sum(1 for r in records if r.status == HealthStatus.UNKNOWN)
    
    logger.info(f"Health check complete: {healthy} healthy, {unhealthy} unhealthy, {unknown} unknown")
    
    return records


def run_daemon(
    monitor: HealthMonitor,
    interval_seconds: int,
    dry_run: bool = False,
) -> None:
    """Run health monitoring daemon loop."""
    logger.info(f"Starting health monitor daemon (interval: {interval_seconds}s)")
    
    # Handle graceful shutdown
    shutdown_requested = False
    
    def signal_handler(signum, frame):
        nonlocal shutdown_requested
        logger.info(f"Received signal {signum}, shutting down...")
        shutdown_requested = True
        monitor.stop_daemon()
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Daemon loop
    cycle = 0
    while not shutdown_requested:
        try:
            cycle += 1
            logger.debug(f"Health check cycle {cycle}")
            
            records = run_health_check(monitor, dry_run)
            
            # Auto-recovery for unhealthy Kin
            for record in records:
                config = monitor.kin_configs.get(record.kin_id)
                if (
                    record.status == HealthStatus.UNHEALTHY
                    and config
                    and config.auto_restart
                    and record.error_count >= config.max_consecutive_errors
                ):
                    if dry_run:
                        logger.info(f"[DRY RUN] Would restart {record.kin_id}")
                    else:
                        logger.info(f"Auto-restarting {record.kin_id} (errors: {record.error_count})")
                        event = monitor.restart_kin(record.kin_id)
                        logger.info(f"Restart result: {event.result.value}")
            
            # Wait for next interval
            import time
            for _ in range(interval_seconds):
                if shutdown_requested:
                    break
                time.sleep(1)
                
        except Exception as e:
            logger.error(f"Error in daemon loop: {e}")
            import time
            time.sleep(10)
    
    logger.info("Health monitor daemon stopped")


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Kin Health Monitor Daemon",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Run with default settings
    python scripts/health_monitor_daemon.py

    # Run with 60-second interval
    python scripts/health_monitor_daemon.py --interval 60

    # Single health check
    python scripts/health_monitor_daemon.py --once

    # Dry run (no actions taken)
    python scripts/health_monitor_daemon.py --dry-run
        """,
    )
    
    parser.add_argument(
        "--interval",
        type=int,
        default=30,
        help="Health check interval in seconds (default: 30)",
    )
    parser.add_argument(
        "--config",
        type=str,
        default="./config/kin-processes.json",
        help="Path to Kin configuration file",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO)",
    )
    parser.add_argument(
        "--log-file",
        type=str,
        default=None,
        help="Path to log file",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run single health check and exit",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without taking actions",
    )
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(args.log_level, args.log_file)
    
    # Load configurations
    configs = load_kin_configs(args.config)
    
    # Create monitor
    notification_handler = create_notification_handler(args.dry_run)
    monitor = HealthMonitor(configs, notification_handler)
    
    # Run
    if args.once:
        records = run_health_check(monitor, args.dry_run)
        
        # Print summary
        print("\nHealth Check Results:")
        print("-" * 50)
        for record in records:
            status_icon = "✓" if record.status == HealthStatus.HEALTHY else "✗"
            print(f"  {status_icon} {record.kin_id}: {record.status.value} ({record.response_time_ms:.1f}ms)")
            if record.last_error:
                print(f"      Error: {record.last_error}")
        
        return 0 if all(r.status == HealthStatus.HEALTHY for r in records) else 1
    else:
        run_daemon(monitor, args.interval, args.dry_run)
        return 0


if __name__ == "__main__":
    sys.exit(main())
