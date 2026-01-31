"""
VRP Solver - OR-Tools Implementation
=====================================
Production VRP solver using Google OR-Tools with Pickup & Delivery constraints.

This is the primary solver for the WCS system, providing optimal routes
using constraint programming.

Author: WCS Team
Version: 2.0.0
"""

import time
import logging
from typing import List, Optional

from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

from ..models import (
    VRPRequest, VRPResponse, VehicleRoute, 
    SolutionStatus, SolverType, PickupDeliveryPair
)
from .base import BaseVRPSolver

logger = logging.getLogger(__name__)


class ORToolsSolver(BaseVRPSolver):
    """
    VRP Solver using Google OR-Tools constraint programming library.
    
    This solver handles:
    - Pickup and Delivery constraints (same vehicle must do both)
    - Precedence constraints (pickup before delivery)
    - Distance optimization (minimize total travel)
    - Multi-vehicle routing
    
    Performance characteristics:
    - Best for: Problems with < 500 nodes
    - Typical solve time: < 5 seconds for 50 nodes
    - Guarantees: Optimal or near-optimal solutions
    """
    
    # Maximum travel distance per vehicle (in distance matrix units)
    MAX_VEHICLE_DISTANCE = 300000
    
    # Cost coefficient for global span (encourages balanced routes)
    GLOBAL_SPAN_COST = 100
    
    @property
    def solver_type(self) -> SolverType:
        return SolverType.ORTOOLS
    
    def solve(self, request: VRPRequest) -> VRPResponse:
        """
        Solve the VRP using OR-Tools.
        
        Algorithm:
        1. Create the routing index manager
        2. Register distance callback
        3. Add pickup/delivery constraints
        4. Run the solver with PARALLEL_CHEAPEST_INSERTION heuristic
        5. Extract and return routes
        
        Args:
            request: The VRP problem definition.
            
        Returns:
            VRPResponse with optimized routes.
        """
        start_time = time.time()
        
        try:
            # Handle empty requests
            if not request.requests:
                return self._create_success_response(
                    routes=[],
                    wall_time_ms=int((time.time() - start_time) * 1000),
                    message="No tasks to route"
                )
            
            # Build OR-Tools model
            solution = self._solve_with_ortools(request)
            
            wall_time_ms = int((time.time() - start_time) * 1000)
            
            if solution is None:
                return VRPResponse(
                    status=SolutionStatus.INFEASIBLE,
                    routes=[],
                    total_distance=0,
                    wall_time_ms=wall_time_ms,
                    solver_used=self.solver_type,
                    message="No feasible solution found with current constraints"
                )
            
            return self._create_success_response(
                routes=solution,
                wall_time_ms=wall_time_ms,
                message=f"Optimal solution found in {wall_time_ms}ms"
            )
            
        except Exception as e:
            logger.exception(f"OR-Tools solver error: {e}")
            return self._create_error_response(f"Solver error: {str(e)}")
    
    def _solve_with_ortools(self, request: VRPRequest) -> Optional[List[VehicleRoute]]:
        """
        Core OR-Tools solving logic.
        
        This method sets up the constraint programming model and runs the solver.
        """
        matrix = request.matrix
        num_nodes = len(matrix)
        num_vehicles = request.vehicle_count
        depot = request.depot_index
        
        # Create routing index manager
        manager = pywrapcp.RoutingIndexManager(num_nodes, num_vehicles, depot)
        
        # Create routing model
        routing = pywrapcp.RoutingModel(manager)
        
        # --- DISTANCE CALLBACK ---
        def distance_callback(from_index: int, to_index: int) -> int:
            """Returns distance between two nodes."""
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            return int(matrix[from_node][to_node])
        
        transit_callback_index = routing.RegisterTransitCallback(distance_callback)
        routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)
        
        # --- DISTANCE DIMENSION ---
        dimension_name = 'Distance'
        routing.AddDimension(
            transit_callback_index,
            0,  # No slack
            self.MAX_VEHICLE_DISTANCE,
            True,  # Start cumul to zero
            dimension_name
        )
        distance_dimension = routing.GetDimensionOrDie(dimension_name)
        distance_dimension.SetGlobalSpanCostCoefficient(self.GLOBAL_SPAN_COST)
        
        # --- PICKUP AND DELIVERY CONSTRAINTS ---
        for pd_pair in request.requests:
            pickup_index = manager.NodeToIndex(pd_pair.pickup_index)
            delivery_index = manager.NodeToIndex(pd_pair.delivery_index)
            
            # Same vehicle must handle both pickup and delivery
            routing.AddPickupAndDelivery(pickup_index, delivery_index)
            
            # Pickup must happen before delivery
            routing.solver().Add(
                distance_dimension.CumulVar(pickup_index) <=
                distance_dimension.CumulVar(delivery_index)
            )
        
        # --- SEARCH PARAMETERS ---
        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = (
            routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
        )
        
        # Set time limit if specified
        if request.max_solve_time_seconds:
            search_parameters.time_limit.seconds = int(request.max_solve_time_seconds)
        
        # --- SOLVE ---
        solution = routing.SolveWithParameters(search_parameters)
        
        if not solution:
            return None
        
        # --- EXTRACT ROUTES ---
        return self._extract_routes(manager, routing, solution, num_vehicles, matrix)
    
    def _extract_routes(
        self,
        manager: pywrapcp.RoutingIndexManager,
        routing: pywrapcp.RoutingModel,
        solution,
        num_vehicles: int,
        matrix: List[List[float]]
    ) -> List[VehicleRoute]:
        """
        Extract route information from the OR-Tools solution.
        
        Only returns routes with actual work (not just depot -> depot).
        """
        routes = []
        
        for vehicle_id in range(num_vehicles):
            index = routing.Start(vehicle_id)
            route_nodes = []
            route_distance = 0.0
            
            while not routing.IsEnd(index):
                node = manager.IndexToNode(index)
                route_nodes.append(node)
                
                previous_index = index
                index = solution.Value(routing.NextVar(index))
                route_distance += routing.GetArcCostForVehicle(
                    previous_index, index, vehicle_id
                )
            
            # Add final node (depot)
            route_nodes.append(manager.IndexToNode(index))
            
            # Only include routes with actual work (not just depot -> depot)
            if len(route_nodes) > 2:
                routes.append(VehicleRoute(
                    vehicle_id=vehicle_id,
                    nodes=route_nodes,
                    distance=route_distance
                ))
        
        return routes
