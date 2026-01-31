"""
VRP Solver - Greedy Implementation
===================================
Fallback VRP solver using a simple greedy nearest-neighbor algorithm.

This solver is used when:
- OR-Tools is not available
- A quick approximate solution is acceptable
- Testing/development scenarios

Author: WCS Team
Version: 2.0.0
"""

import time
import logging
from typing import List, Set, Tuple, Optional

from ..models import (
    VRPRequest, VRPResponse, VehicleRoute,
    SolutionStatus, SolverType, PickupDeliveryPair
)
from .base import BaseVRPSolver

logger = logging.getLogger(__name__)


class GreedySolver(BaseVRPSolver):
    """
    Simple greedy VRP solver using nearest-neighbor heuristic.
    
    Algorithm:
    1. Start each vehicle at the depot
    2. Find the nearest unvisited pickup location
    3. After pickup, go to its corresponding delivery
    4. Repeat until all tasks are assigned
    5. Return to depot
    
    Limitations:
    - Does NOT guarantee optimal solutions
    - May produce longer routes than OR-Tools
    - Does NOT handle complex constraints (time windows, capacity)
    
    Use cases:
    - Fallback when OR-Tools fails
    - Quick approximations for large problems
    - Development and testing
    """
    
    @property
    def solver_type(self) -> SolverType:
        return SolverType.GREEDY
    
    def solve(self, request: VRPRequest) -> VRPResponse:
        """
        Solve VRP using greedy nearest-neighbor heuristic.
        
        Args:
            request: The VRP problem definition.
            
        Returns:
            VRPResponse with approximate routes.
        """
        start_time = time.time()
        
        try:
            # Handle empty requests
            if not request.requests:
                return self._create_success_response(
                    routes=[],
                    wall_time_ms=int((time.time() - start_time) * 1000),
                    message="No tasks to route (greedy)"
                )
            
            routes = self._solve_greedy(request)
            wall_time_ms = int((time.time() - start_time) * 1000)
            
            return self._create_success_response(
                routes=routes,
                wall_time_ms=wall_time_ms,
                message=f"Greedy solution found in {wall_time_ms}ms (approximate)"
            )
            
        except Exception as e:
            logger.exception(f"Greedy solver error: {e}")
            return self._create_error_response(f"Solver error: {str(e)}")
    
    def _solve_greedy(self, request: VRPRequest) -> List[VehicleRoute]:
        """
        Core greedy solving logic.
        
        Distributes tasks across vehicles using round-robin assignment,
        then optimizes each vehicle's route using nearest-neighbor.
        """
        matrix = request.matrix
        depot = request.depot_index
        num_vehicles = request.vehicle_count
        
        # Assign tasks to vehicles (round-robin)
        vehicle_tasks: List[List[PickupDeliveryPair]] = [[] for _ in range(num_vehicles)]
        for i, task in enumerate(request.requests):
            vehicle_idx = i % num_vehicles
            vehicle_tasks[vehicle_idx].append(task)
        
        # Build routes for each vehicle
        routes = []
        for vehicle_id, tasks in enumerate(vehicle_tasks):
            if not tasks:
                continue
            
            route = self._build_vehicle_route(matrix, depot, tasks, vehicle_id)
            if route:
                routes.append(route)
        
        return routes
    
    def _build_vehicle_route(
        self,
        matrix: List[List[float]],
        depot: int,
        tasks: List[PickupDeliveryPair],
        vehicle_id: int
    ) -> Optional[VehicleRoute]:
        """
        Build a route for a single vehicle using nearest-neighbor.
        
        The algorithm:
        1. Start at depot
        2. Find nearest pickup among remaining tasks
        3. Go to pickup, then immediately to delivery
        4. Repeat for all tasks
        5. Return to depot
        """
        if not tasks:
            return None
        
        route_nodes = [depot]
        remaining_tasks = list(tasks)
        current_pos = depot
        
        while remaining_tasks:
            # Find nearest pickup
            nearest_task = None
            nearest_distance = float('inf')
            
            for task in remaining_tasks:
                dist = matrix[current_pos][task.pickup_index]
                if dist < nearest_distance:
                    nearest_distance = dist
                    nearest_task = task
            
            if nearest_task is None:
                break
            
            # Visit pickup
            route_nodes.append(nearest_task.pickup_index)
            current_pos = nearest_task.pickup_index
            
            # Visit delivery
            route_nodes.append(nearest_task.delivery_index)
            current_pos = nearest_task.delivery_index
            
            # Remove completed task
            remaining_tasks.remove(nearest_task)
        
        # Return to depot
        route_nodes.append(depot)
        
        # Calculate total distance
        total_distance = self._calculate_route_distance(matrix, route_nodes)
        
        return VehicleRoute(
            vehicle_id=vehicle_id,
            nodes=route_nodes,
            distance=total_distance
        )
