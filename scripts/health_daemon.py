#!/usr/bin/env python3
"""Health monitoring daemon for Kin companions.

This script runs as a background service, checking Kin health on a configurable
interval and taking recovery actions when needed.

Usage:
    python scripts/health_daemon.py [--config CONFIG_PATH] [--once]

Options:
    --config PATH    Path to configuration file (YAML or JSON)
    --once           Run a single health check cycle and exit
    --verbose        Enable verbose logging
"""

import argparse
import asyncio
import json
import logging
import os
import signal
import sys
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from runtime_types.health_monitor import (
    HealthMonitor,
    HealthMonitorConfig,
    load_config_from_file,
    create_mock_config,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("health_daemon.log"),
    ],
)
logger = logging.getLogger(__name__)


class HealthDaemon:
    """Daemon wrapper for the HealthMonitor.

    Provides signal handling and graceful shutdown.
    """

    def __init__(self, config: HealthMonitorConfig):
        """Initialize the daemon.

        Args:
            config: Configuration for the health monitor
        """
        self.monitor = HealthMonitor(config)
        self._shutdown_event = asyncio.Event()

    async def run(self, once: bool = False) -> None:
        """Run the health daemon.

        Args:
            once: If True, run a single check cycle and exit
        """
        # Set up signal handlers
        loop = asyncio.get_event_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, self._handle_shutdown)

        if once:
            # Run single check cycle
            logger.info("Running single health check cycle")
            await self._run_check_cycle()
        else:
            # Run continuous monitoring
            logger.info("Starting health monitoring daemon")
            await self.monitor.start()

    def _handle_shutdown(self) -> None:
        """Handle shutdown signal."""
        logger.info("Shutdown signal received")
        self.monitor.stop()
        self._shutdown_event.set()

    async def _run_check_cycle(self) -> None:
        """Run a single health check cycle."""
        try:
            # Run health checks
            records = self.monitor.check_all_kin()
            logger.info(f"Completed {len(records)} health checks")

            # Get VPS status
            status = self.monitor.get_vps_status()
            logger.info(f"VPS Status: {status.overall_status.value}")
            logger.info(f"Kin Summary: {status.kin_summary}")

            # Check for recovery needs
            max_errors = self.monitor.config.get("max_error_count", 3)
            for record in records:
                if record.error_count >= max_errors:
                    kin_config = next(
                        (k for k in self.monitor.config.get("kin_list", [])
                         if k["kin_id"] == record.kin_id),
                        None
                    )
                    if kin_config:
                        logger.warning(f"Triggering recovery for {record.kin_id}")
                        event = self.monitor.restart_kin(kin_config)
                        self.monitor.notify_stakeholders(event)
                        logger.info(f"Recovery result: {event.result.value}")

        except Exception as e:
            logger.error(f"Health check cycle failed: {e}")
            raise


def find_config_file() -> Optional[str]:
    """Find the default configuration file.

    Looks for:
        - ./health_monitor.yaml
        - ./health_monitor.json
        - ./config/health_monitor.yaml
        - ./config/health_monitor.json

    Returns:
        Path to config file or None if not found
    """
    candidates = [
        "health_monitor.yaml",
        "health_monitor.json",
        "config/health_monitor.yaml",
        "config/health_monitor.json",
    ]

    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate

    return None


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Health monitoring daemon for Kin companions"
    )
    parser.add_argument(
        "--config",
        type=str,
        help="Path to configuration file (YAML or JSON)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single health check cycle and exit",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Use mock configuration for testing",
    )

    args = parser.parse_args()

    # Configure logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Load configuration
    if args.mock:
        logger.info("Using mock configuration")
        config = create_mock_config()
    elif args.config:
        logger.info(f"Loading configuration from {args.config}")
        config = load_config_from_file(args.config)
    else:
        config_path = find_config_file()
        if config_path:
            logger.info(f"Loading configuration from {config_path}")
            config = load_config_from_file(config_path)
        else:
            logger.warning("No configuration file found, using mock configuration")
            config = create_mock_config()

    # Create and run daemon
    daemon = HealthDaemon(config)

    try:
        asyncio.run(daemon.run(once=args.once))
        return 0
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        return 0
    except Exception as e:
        logger.error(f"Daemon failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
