#!/usr/bin/env python3
"""
Fleet Gateway - Entry Point
============================
The Fleet Gateway is the central orchestration service for the Warehouse
Controller System (WCS). It bridges the Supabase database with physical
robots via MQTT.

Architecture:
    ┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
    │  Supabase   │────►│  Fleet Gateway  │────►│   Robots    │
    │  Database   │◄────│  (This Service) │◄────│   (MQTT)    │
    └─────────────┘     └─────────────────┘     └─────────────┘

Responsibilities:
    1. Poll database for active assignments.
    2. Convert high-level tasks to robot commands (GOTO x, y).
    3. Monitor robot positions and update task statuses.
    4. Handle automatic reconnection for MQTT/Database.
    5. Publish log messages for the Frontend UI.

Usage:
    python main.py

Environment Variables (in .env):
    VITE_SUPABASE_URL       - Supabase project URL
    VITE_SUPABASE_ANON_KEY  - Supabase anonymous key

Author: WCS Team
Version: 2.0.0
"""

import asyncio
import logging
import signal
import sys

from gateway import (
    validate_config,
    DatabaseClient,
    MQTTHandler,
    TaskOrchestrator,
)


# ============================================
# LOGGING CONFIGURATION
# ============================================

def setup_logging() -> None:
    """
    Configure logging for the Fleet Gateway.
    
    Uses a clear format with timestamps for production debugging.
    Logs are sent to both console and could be extended to file.
    """
    log_format = (
        "%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s"
    )
    
    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            # Uncomment to add file logging:
            # logging.FileHandler("fleet_gateway.log"),
        ]
    )
    
    # Reduce noise from third-party libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


# ============================================
# MAIN APPLICATION
# ============================================

logger = logging.getLogger(__name__)


class FleetGateway:
    """
    Main application class that coordinates all Gateway components.
    
    This class handles:
    - Component initialization
    - Graceful shutdown on SIGINT/SIGTERM
    - Error recovery
    """
    
    def __init__(self):
        self.db_client: DatabaseClient = None
        self.mqtt_handler: MQTTHandler = None
        self.orchestrator: TaskOrchestrator = None
        self._shutdown_requested = False
    
    def initialize(self) -> bool:
        """
        Initialize all Gateway components.
        
        Returns:
            True if all components initialized successfully.
        """
        # Validate configuration
        if not validate_config():
            logger.error("Configuration validation failed. Exiting.")
            return False
        
        # Initialize Database
        logger.info("Initializing Database connection...")
        self.db_client = DatabaseClient()
        if not self.db_client.connect():
            logger.error("Failed to connect to database. Exiting.")
            return False
        
        # Initialize MQTT
        logger.info("Initializing MQTT connection...")
        self.mqtt_handler = MQTTHandler()
        if not self.mqtt_handler.connect():
            logger.error("Failed to connect to MQTT broker. Exiting.")
            return False
        
        # Initialize Orchestrator
        self.orchestrator = TaskOrchestrator(
            db_client=self.db_client,
            mqtt_handler=self.mqtt_handler
        )
        
        logger.info("Fleet Gateway initialized successfully! ✅")
        return True
    
    async def run(self) -> None:
        """Run the main orchestration loop."""
        if not self.orchestrator:
            raise RuntimeError("Gateway not initialized. Call initialize() first.")
        
        await self.orchestrator.run()
    
    def shutdown(self) -> None:
        """Perform graceful shutdown of all components."""
        logger.info("Shutting down Fleet Gateway...")
        
        if self.orchestrator:
            self.orchestrator.stop()
        
        if self.mqtt_handler:
            self.mqtt_handler.disconnect()
        
        logger.info("Fleet Gateway shutdown complete. Goodbye! 👋")


def main() -> None:
    """Main entry point for the Fleet Gateway."""
    # Setup logging
    setup_logging()
    
    logger.info("=" * 60)
    logger.info("FLEET GATEWAY - Warehouse Controller System")
    logger.info("Version 2.0.0")
    logger.info("=" * 60)
    
    # Create application instance
    gateway = FleetGateway()
    
    # Setup signal handlers for graceful shutdown
    def signal_handler(sig, frame):
        logger.info(f"Received signal {sig}. Initiating shutdown...")
        gateway.shutdown()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Initialize and run
    try:
        if not gateway.initialize():
            sys.exit(1)
        
        asyncio.run(gateway.run())
        
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
        gateway.shutdown()
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        gateway.shutdown()
        sys.exit(1)


if __name__ == "__main__":
    main()
