"""
Fleet Gateway - Configuration Module
=====================================
Centralizes all environment variables and configuration constants.
Uses Pydantic BaseSettings for type safety and validation.

Author: WCS Team
Version: 2.0.0
"""

import os
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


@dataclass(frozen=True)
class SupabaseConfig:
    """
    Supabase connection configuration.
    
    Attributes:
        url: The Supabase project URL.
        key: The Supabase anonymous/service key.
    """
    url: Optional[str] = None
    key: Optional[str] = None
    
    def is_valid(self) -> bool:
        """Check if the configuration has all required values."""
        return bool(self.url and self.key)


@dataclass(frozen=True)
class MQTTConfig:
    """
    MQTT Broker connection configuration.
    
    Attributes:
        broker: The hostname of the MQTT broker.
        port: The port number (default 1883 for TCP, 8083 for WS).
        client_id: Unique identifier for this gateway instance.
        keepalive: Connection keepalive interval in seconds.
        reconnect_delay: Seconds to wait before reconnection attempts.
    """
    broker: str = "broker.emqx.io"
    port: int = 1883
    client_id: str = "fleet_gateway_v2"
    keepalive: int = 60
    reconnect_delay: int = 5


@dataclass(frozen=True)
class GatewayConfig:
    """
    Fleet Gateway operational parameters.
    
    Attributes:
        poll_interval_seconds: How often to check for new assignments.
        arrival_threshold_meters: Distance to consider a robot "arrived" at a target.
        default_robot_id: Fallback robot ID if assignment has no robot assigned.
    """
    poll_interval_seconds: float = 2.0
    arrival_threshold_meters: float = 0.3
    default_robot_id: str = "1"


# --- SINGLETON CONFIG INSTANCES ---

SUPABASE_CONFIG = SupabaseConfig(
    url=os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL"),
    key=os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY"),
)

MQTT_CONFIG = MQTTConfig()

GATEWAY_CONFIG = GatewayConfig()


# --- VALIDATION ---

def validate_config() -> bool:
    """
    Validates that all critical configuration is present.
    
    Returns:
        True if configuration is valid, False otherwise.
    """
    if not SUPABASE_CONFIG.is_valid():
        print("[CONFIG ERROR] Supabase URL or Key not found.")
        print("  Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env")
        return False
    return True
