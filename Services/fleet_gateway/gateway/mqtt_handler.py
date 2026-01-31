"""
Fleet Gateway - MQTT Communication Handler
==========================================
Manages MQTT connection, subscriptions, and message handling.
Implements auto-reconnection for production reliability.

Author: WCS Team
Version: 2.0.0
"""

import json
import time
import logging
import threading
from typing import Dict, Any, Optional, Callable
import paho.mqtt.client as mqtt

from .config import MQTT_CONFIG

logger = logging.getLogger(__name__)


class MQTTHandler:
    """
    Robust MQTT client wrapper with auto-reconnection.
    
    This class handles all MQTT communication for the Fleet Gateway,
    including:
    - Subscribing to robot status updates
    - Publishing commands to robots
    - Publishing log messages to the frontend
    - Automatic reconnection on disconnect
    
    Attributes:
        robot_status_cache: Real-time cache of robot positions and statuses.
    """
    
    def __init__(self, on_robot_status_update: Optional[Callable] = None):
        """
        Initialize the MQTT handler.
        
        Args:
            on_robot_status_update: Optional callback when a robot status is received.
        """
        self._client: Optional[mqtt.Client] = None
        self._is_connected: bool = False
        self._shutdown_requested: bool = False
        self._on_robot_status_update = on_robot_status_update
        
        # Thread-safe robot status cache
        self._robot_status_lock = threading.Lock()
        self._robot_status_cache: Dict[str, Dict[str, Any]] = {}
    
    @property
    def is_connected(self) -> bool:
        """Check if MQTT client is connected."""
        return self._is_connected
    
    @property
    def robot_status_cache(self) -> Dict[str, Dict[str, Any]]:
        """Get a thread-safe copy of the robot status cache."""
        with self._robot_status_lock:
            return self._robot_status_cache.copy()
    
    def get_robot_status(self, robot_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the latest status for a specific robot.
        
        Args:
            robot_id: The robot ID (as string).
            
        Returns:
            Dict with robot status, or None if not found.
        """
        with self._robot_status_lock:
            # Try string key first, then int key (for compatibility)
            return (
                self._robot_status_cache.get(str(robot_id)) or
                self._robot_status_cache.get(robot_id)
            )
    
    def connect(self) -> bool:
        """
        Connect to the MQTT broker.
        
        Returns:
            True if connection initiated successfully.
        """
        try:
            self._client = mqtt.Client(client_id=MQTT_CONFIG.client_id)
            
            # Set callbacks
            self._client.on_connect = self._on_connect
            self._client.on_disconnect = self._on_disconnect
            self._client.on_message = self._on_message
            
            logger.info(f"Connecting to MQTT broker: {MQTT_CONFIG.broker}:{MQTT_CONFIG.port}")
            
            self._client.connect(
                MQTT_CONFIG.broker,
                MQTT_CONFIG.port,
                MQTT_CONFIG.keepalive
            )
            
            # Start the network loop in a background thread
            self._client.loop_start()
            return True
            
        except Exception as e:
            logger.exception(f"Failed to connect to MQTT broker: {e}")
            return False
    
    def disconnect(self) -> None:
        """Gracefully disconnect from the MQTT broker."""
        self._shutdown_requested = True
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
            logger.info("Disconnected from MQTT broker")
    
    def _on_connect(self, client, userdata, flags, rc) -> None:
        """Handle MQTT connection event."""
        if rc == 0:
            self._is_connected = True
            logger.info(f"Connected to MQTT broker (rc={rc})")
            
            # Subscribe to robot status updates
            client.subscribe("robots/+/status")
            logger.info("Subscribed to robots/+/status")
        else:
            logger.error(f"MQTT connection failed with code: {rc}")
    
    def _on_disconnect(self, client, userdata, rc) -> None:
        """
        Handle MQTT disconnection event.
        
        Implements automatic reconnection unless shutdown was requested.
        """
        self._is_connected = False
        
        if self._shutdown_requested:
            logger.info("MQTT disconnected (shutdown requested)")
            return
        
        logger.warning(f"MQTT disconnected unexpectedly (rc={rc}). Attempting reconnection...")
        
        # Auto-reconnect loop
        while not self._shutdown_requested and not self._is_connected:
            try:
                time.sleep(MQTT_CONFIG.reconnect_delay)
                logger.info("Attempting MQTT reconnection...")
                client.reconnect()
            except Exception as e:
                logger.error(f"Reconnection failed: {e}")
    
    def _on_message(self, client, userdata, msg) -> None:
        """
        Handle incoming MQTT messages.
        
        Parses robot status updates and updates the cache.
        Topic format: robots/{robot_id}/status
        """
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode())
            
            # Parse topic: robots/{id}/status
            parts = topic.split('/')
            if len(parts) < 3:
                return
            
            robot_id = parts[1]
            message_type = parts[2]
            
            if message_type == 'status':
                with self._robot_status_lock:
                    self._robot_status_cache[robot_id] = payload
                
                # Optional callback
                if self._on_robot_status_update:
                    self._on_robot_status_update(robot_id, payload)
                    
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in MQTT message: {e}")
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")
    
    # ========================================
    # PUBLISHING METHODS
    # ========================================
    
    def send_command(self, robot_id: str, command: str, target_x: float, target_y: float) -> bool:
        """
        Send a movement command to a robot.
        
        Args:
            robot_id: The target robot ID.
            command: Command type (e.g., 'GOTO', 'PAUSE', 'RESUME').
            target_x: Target X coordinate in meters.
            target_y: Target Y coordinate in meters.
            
        Returns:
            True if message was published successfully.
        """
        if not self._client or not self.is_connected:
            logger.warning("Cannot send command: MQTT not connected")
            return False
        
        topic = f"robots/{robot_id}/command"
        payload = {
            "command": command,
            "target_x": target_x,
            "target_y": target_y,
            "timestamp": time.time()
        }
        
        try:
            self._client.publish(topic, json.dumps(payload), qos=1)
            logger.info(f"Sent {command} to Robot {robot_id} -> ({target_x}, {target_y})")
            return True
        except Exception as e:
            logger.error(f"Failed to send command: {e}")
            return False
    
    def publish_log(self, message: str) -> bool:
        """
        Publish a log message to the frontend via fleet/logs topic.
        
        Args:
            message: The log message to publish.
            
        Returns:
            True if message was published successfully.
        """
        if not self._client or not self.is_connected:
            logger.warning("Cannot publish log: MQTT not connected")
            return False
        
        payload = {
            "msg": message,
            "timestamp": time.time()
        }
        
        try:
            self._client.publish("fleet/logs", json.dumps(payload))
            logger.info(f"[LOG] {message}")
            return True
        except Exception as e:
            logger.error(f"Failed to publish log: {e}")
            return False
