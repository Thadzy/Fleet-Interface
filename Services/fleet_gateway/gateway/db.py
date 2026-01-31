"""
Fleet Gateway - Database Access Layer
======================================
Provides a clean interface for all Supabase database operations.
Implements connection pooling, error handling, and retry logic.

Author: WCS Team
Version: 2.0.0
"""

import logging
from typing import Optional, List, Dict, Any
from supabase import create_client, Client

from .config import SUPABASE_CONFIG

logger = logging.getLogger(__name__)


class DatabaseError(Exception):
    """Custom exception for database-related errors."""
    pass


class DatabaseClient:
    """
    Singleton wrapper for Supabase client with robust error handling.
    
    This class provides a clean API for all database operations required
    by the Fleet Gateway, including fetching assignments, tasks, and
    updating their statuses.
    
    Example:
        db = DatabaseClient()
        if db.connect():
            assignments = db.fetch_pending_assignments()
    """
    
    _instance: Optional['DatabaseClient'] = None
    _client: Optional[Client] = None
    
    def __new__(cls) -> 'DatabaseClient':
        """Implement singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def connect(self) -> bool:
        """
        Establish connection to Supabase.
        
        Returns:
            True if connection successful, False otherwise.
        """
        if not SUPABASE_CONFIG.is_valid():
            logger.error("Cannot connect: Invalid Supabase configuration")
            return False
        
        try:
            self._client = create_client(
                SUPABASE_CONFIG.url,
                SUPABASE_CONFIG.key
            )
            logger.info("Successfully connected to Supabase")
            return True
        except Exception as e:
            logger.exception(f"Failed to connect to Supabase: {e}")
            return False
    
    @property
    def is_connected(self) -> bool:
        """Check if database client is initialized."""
        return self._client is not None
    
    def _ensure_connected(self) -> None:
        """Raise error if not connected."""
        if not self.is_connected:
            raise DatabaseError("Database not connected. Call connect() first.")
    
    # ========================================
    # ASSIGNMENT OPERATIONS
    # ========================================
    
    def fetch_pending_assignments(self) -> List[Dict[str, Any]]:
        """
        Retrieve all assignments with 'in_progress' status.
        
        These are assignments that have been dispatched but not yet completed.
        The Fleet Gateway monitors these to dispatch tasks to robots.
        
        Returns:
            List of assignment records, or empty list on error.
        """
        self._ensure_connected()
        
        try:
            response = (
                self._client.table("wh_assignments")
                .select("*")
                .eq("status", "in_progress")
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error(f"Error fetching assignments: {e}")
            return []
    
    def update_assignment_status(self, assignment_id: int, status: str) -> bool:
        """
        Update the status of an assignment.
        
        Args:
            assignment_id: The ID of the assignment to update.
            status: The new status value (e.g., 'completed', 'failed').
            
        Returns:
            True if update successful, False otherwise.
        """
        self._ensure_connected()
        
        try:
            self._client.table("wh_assignments").update({
                "status": status
            }).eq("id", assignment_id).execute()
            
            logger.info(f"Assignment {assignment_id} status updated to '{status}'")
            return True
        except Exception as e:
            logger.error(f"Error updating assignment {assignment_id}: {e}")
            return False
    
    # ========================================
    # TASK OPERATIONS
    # ========================================
    
    def fetch_tasks_for_assignment(self, assignment_id: int) -> List[Dict[str, Any]]:
        """
        Retrieve all tasks for a given assignment, ordered by sequence.
        
        Args:
            assignment_id: The parent assignment ID.
            
        Returns:
            List of task records ordered by seq_order, or empty list on error.
        """
        self._ensure_connected()
        
        try:
            response = (
                self._client.table("wh_tasks")
                .select("*")
                .eq("assignment_id", assignment_id)
                .order("seq_order")
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error(f"Error fetching tasks for assignment {assignment_id}: {e}")
            return []
    
    def update_task_status(self, task_id: int, status: str) -> bool:
        """
        Update the status of a task.
        
        Valid statuses include:
        - 'pending': Waiting to be processed
        - 'pickup_en_route': Robot is moving to pickup location
        - 'delivered': Task completed successfully
        - 'failed': Task failed
        
        Args:
            task_id: The ID of the task to update.
            status: The new status value.
            
        Returns:
            True if update successful, False otherwise.
        """
        self._ensure_connected()
        
        try:
            self._client.table("wh_tasks").update({
                "status": status
            }).eq("id", task_id).execute()
            
            logger.info(f"Task {task_id} status updated to '{status}'")
            return True
        except Exception as e:
            logger.error(f"Error updating task {task_id}: {e}")
            return False
    
    # ========================================
    # LOCATION LOOKUPS
    # ========================================
    
    def fetch_cell_position(self, cell_id: int) -> Optional[Dict[str, Any]]:
        """
        Get the (x, y) coordinates for a cell by looking up its associated node.
        
        This performs a two-step lookup:
        1. Get the node_id from wh_cells
        2. Get the x, y, name from wh_nodes
        
        Args:
            cell_id: The cell ID to look up.
            
        Returns:
            Dict with 'x', 'y', 'name' keys, or None if not found.
        """
        self._ensure_connected()
        
        try:
            # Step 1: Get node_id from cell
            cell_response = (
                self._client.table("wh_cells")
                .select("node_id")
                .eq("id", cell_id)
                .single()
                .execute()
            )
            
            if not cell_response.data:
                logger.warning(f"Cell {cell_id} not found")
                return None
            
            node_id = cell_response.data['node_id']
            
            # Step 2: Get coordinates from node
            node_response = (
                self._client.table("wh_nodes")
                .select("x, y, name")
                .eq("id", node_id)
                .single()
                .execute()
            )
            
            return node_response.data
            
        except Exception as e:
            logger.error(f"Error fetching position for cell {cell_id}: {e}")
            return None
