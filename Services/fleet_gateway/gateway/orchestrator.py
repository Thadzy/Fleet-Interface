"""
Fleet Gateway - Orchestrator Module
====================================
Core state machine that processes assignments and dispatches tasks to robots.
This is the "brain" of the Fleet Gateway.

Author: WCS Team
Version: 2.0.0
"""

import asyncio
import logging
import math
from typing import Dict, Any, Optional, List

from .config import GATEWAY_CONFIG
from .db import DatabaseClient
from .mqtt_handler import MQTTHandler

logger = logging.getLogger(__name__)


# Task statuses that indicate the task is waiting to start
PENDING_STATUSES = frozenset(['pending', 'queuing', 'on_another_delivery'])

# Task statuses that indicate the robot is en-route
EN_ROUTE_STATUSES = frozenset(['pickup_en_route', 'picking_up', 'delivery_en_route'])

# Terminal statuses
TERMINAL_STATUSES = frozenset(['delivered', 'completed', 'failed', 'cancelled'])


class TaskOrchestrator:
    """
    The core orchestration engine for the Fleet Gateway.
    
    This class implements a polling-based state machine that:
    1. Fetches active assignments from the database.
    2. For each assignment, finds the current (non-completed) task.
    3. Dispatches GOTO commands to robots when tasks start.
    4. Monitors robot positions and marks tasks as 'delivered' when robots arrive.
    
    The orchestrator is designed to be resilient:
    - Handles database/MQTT failures gracefully.
    - Resends commands if robots become idle unexpectedly.
    - Logs all significant state changes for debugging.
    """
    
    def __init__(self, db_client: DatabaseClient, mqtt_handler: MQTTHandler):
        """
        Initialize the orchestrator.
        
        Args:
            db_client: The database client instance.
            mqtt_handler: The MQTT handler instance.
        """
        self._db = db_client
        self._mqtt = mqtt_handler
        self._is_running = False
    
    async def run(self) -> None:
        """
        Start the main orchestration loop.
        
        This method runs indefinitely, polling the database for assignments
        and processing them. It should be called with asyncio.run().
        """
        self._is_running = True
        logger.info("Starting Task Orchestrator...")
        logger.info(f"Poll interval: {GATEWAY_CONFIG.poll_interval_seconds}s")
        logger.info(f"Arrival threshold: {GATEWAY_CONFIG.arrival_threshold_meters}m")
        
        while self._is_running:
            try:
                await self._process_cycle()
            except Exception as e:
                # Catch-all to prevent the loop from crashing
                logger.exception(f"Unexpected error in orchestration cycle: {e}")
            
            await asyncio.sleep(GATEWAY_CONFIG.poll_interval_seconds)
    
    def stop(self) -> None:
        """Request the orchestration loop to stop."""
        self._is_running = False
        logger.info("Orchestrator stop requested")
    
    async def _process_cycle(self) -> None:
        """
        Execute one cycle of assignment processing.
        
        This method:
        1. Fetches all 'in_progress' assignments.
        2. For each assignment, processes its current task.
        """
        assignments = self._db.fetch_pending_assignments()
        
        if not assignments:
            return  # Nothing to process
        
        for assignment in assignments:
            await self._process_assignment(assignment)
    
    async def _process_assignment(self, assignment: Dict[str, Any]) -> None:
        """
        Process a single assignment.
        
        Args:
            assignment: The assignment record from the database.
        """
        assignment_id = assignment['id']
        robot_id = self._get_robot_id(assignment)
        
        # Fetch tasks for this assignment
        tasks = self._db.fetch_tasks_for_assignment(assignment_id)
        
        if not tasks:
            return
        
        # Find the first non-completed task
        current_task = self._find_current_task(tasks)
        
        if not current_task:
            # All tasks completed - mark assignment as completed
            if all(task['status'] == 'delivered' for task in tasks):
                self._db.update_assignment_status(assignment_id, 'completed')
                self._mqtt.publish_log(f"Assignment #{assignment_id} Completed! ✅")
            return
        
        # Process based on task status
        task_status = current_task['status']
        
        if task_status in PENDING_STATUSES:
            await self._start_task(current_task, robot_id)
        elif task_status in EN_ROUTE_STATUSES:
            await self._check_arrival(current_task, robot_id)
    
    def _get_robot_id(self, assignment: Dict[str, Any]) -> str:
        """
        Extract or assign a robot ID for the assignment.
        
        If no robot is assigned, uses the default robot ID.
        
        Args:
            assignment: The assignment record.
            
        Returns:
            Robot ID as a string.
        """
        robot_id = assignment.get('robot_id')
        if robot_id is None:
            logger.warning(
                f"Assignment {assignment['id']} has no robot_id. "
                f"Defaulting to robot {GATEWAY_CONFIG.default_robot_id}"
            )
            return GATEWAY_CONFIG.default_robot_id
        return str(robot_id)
    
    def _find_current_task(self, tasks: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Find the first task that has not reached a terminal status.
        
        Args:
            tasks: List of tasks ordered by seq_order.
            
        Returns:
            The current task to process, or None if all tasks are terminal.
        """
        for task in tasks:
            if task['status'] not in TERMINAL_STATUSES:
                return task
        return None
    
    async def _start_task(self, task: Dict[str, Any], robot_id: str) -> None:
        """
        Start a new task by sending a GOTO command to the robot.
        
        Args:
            task: The task to start.
            robot_id: The robot to command.
        """
        task_id = task['id']
        cell_id = task['cell_id']
        
        logger.info(f"Starting Task #{task_id} (Cell: {cell_id}) for Robot {robot_id}")
        
        # Get target coordinates
        target_position = self._db.fetch_cell_position(cell_id)
        
        if not target_position:
            logger.error(f"Cannot start task #{task_id}: Cell {cell_id} position not found")
            return
        
        # Update task status
        self._db.update_task_status(task_id, 'pickup_en_route')
        
        # Send command to robot
        self._mqtt.send_command(
            robot_id=robot_id,
            command="GOTO",
            target_x=target_position['x'],
            target_y=target_position['y']
        )
        
        # Log for frontend
        self._mqtt.publish_log(f"Robot {robot_id} → Task #{task_id} (Moving)")
    
    async def _check_arrival(self, task: Dict[str, Any], robot_id: str) -> None:
        """
        Check if the robot has arrived at the task target.
        
        If the robot is close enough to the target (within arrival_threshold_meters),
        the task is marked as 'delivered'.
        
        If the robot is IDLE but not at the target, resend the GOTO command.
        This handles cases where the initial command was lost.
        
        Args:
            task: The task to check.
            robot_id: The robot executing the task.
        """
        task_id = task['id']
        cell_id = task['cell_id']
        
        # Get robot's current position from MQTT cache
        robot_status = self._mqtt.get_robot_status(robot_id)
        
        if not robot_status:
            logger.debug(f"No status received for Robot {robot_id} yet")
            return
        
        # Get target position
        target_position = self._db.fetch_cell_position(cell_id)
        
        if not target_position:
            logger.error(f"Cannot check arrival for task #{task_id}: Cell position not found")
            return
        
        # Calculate distance to target
        distance = self._calculate_distance(
            robot_status['x'], robot_status['y'],
            target_position['x'], target_position['y']
        )
        
        # Check if arrived
        if distance < GATEWAY_CONFIG.arrival_threshold_meters:
            logger.info(f"Robot {robot_id} arrived at Task #{task_id} (distance: {distance:.2f}m)")
            self._db.update_task_status(task_id, 'delivered')
            self._mqtt.publish_log(f"Robot {robot_id} ✅ Task #{task_id} Delivered")
            return
        
        # Check if robot is unexpectedly idle (command might have been lost)
        if robot_status.get('status') == 'idle':
            logger.warning(
                f"Robot {robot_id} is IDLE at ({robot_status['x']:.1f}, {robot_status['y']:.1f}) "
                f"but should be heading to ({target_position['x']}, {target_position['y']}). "
                f"Resending GOTO command."
            )
            self._mqtt.send_command(
                robot_id=robot_id,
                command="GOTO",
                target_x=target_position['x'],
                target_y=target_position['y']
            )
    
    @staticmethod
    def _calculate_distance(x1: float, y1: float, x2: float, y2: float) -> float:
        """
        Calculate Euclidean distance between two points.
        
        Args:
            x1, y1: First point coordinates.
            x2, y2: Second point coordinates.
            
        Returns:
            Distance in meters.
        """
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
