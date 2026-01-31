"""
Fleet Gateway Package
=====================
Central orchestration service for the Warehouse Controller System.

This package provides the core functionality for:
- Connecting to Supabase database
- Managing MQTT communication with robots
- Orchestrating task assignments and robot movements
"""

from .config import SUPABASE_CONFIG, MQTT_CONFIG, GATEWAY_CONFIG, validate_config
from .db import DatabaseClient
from .mqtt_handler import MQTTHandler
from .orchestrator import TaskOrchestrator

__all__ = [
    'SUPABASE_CONFIG',
    'MQTT_CONFIG', 
    'GATEWAY_CONFIG',
    'validate_config',
    'DatabaseClient',
    'MQTTHandler',
    'TaskOrchestrator',
]

__version__ = "2.0.0"
