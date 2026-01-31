"""
VRP Solvers - Abstract Base Class
=================================
Defines the interface that all VRP solver implementations must follow.
This enables the Strategy Pattern for easy algorithm switching.

Author: WCS Team
Version: 2.0.0
"""

from abc import ABC, abstractmethod
from typing import List, Tuple, Optional
import logging

from ..models import VRPRequest, VRPResponse, VehicleRoute, SolutionStatus, SolverType

logger = logging.getLogger(__name__)


class BaseVRPSolver(ABC):
    """
    Abstract base class for VRP solver implementations.
    
    All solver algorithms must inherit from this class and implement
    the `solve` method. This enables runtime algorithm switching via
    the Strategy Pattern.
    
    Example:
        class MyCustomSolver(BaseVRPSolver):
            @property
            def solver_type(self) -> SolverType:
                return SolverType.GREEDY
            
            def solve(self, request: VRPRequest) -> VRPResponse:
                # Implementation here
                pass
    """
    
    @property
    @abstractmethod
    def solver_type(self) -> SolverType:
        """Return the solver type identifier."""
        pass
    
    @abstractmethod
    def solve(self, request: VRPRequest) -> VRPResponse:
        """
        Solve the VRP and return optimized routes.
        
        Args:
            request: The VRP problem definition.
            
        Returns:
            VRPResponse with routes or error status.
        """
        pass
    
    def _create_error_response(self, message: str, status: SolutionStatus = SolutionStatus.ERROR) -> VRPResponse:
        """Helper to create an error response."""
        return VRPResponse(
            status=status,
            routes=[],
            total_distance=0,
            wall_time_ms=0,
            solver_used=self.solver_type,
            message=message
        )
    
    def _create_success_response(
        self, 
        routes: List[VehicleRoute], 
        wall_time_ms: int,
        message: str = "Solution found"
    ) -> VRPResponse:
        """Helper to create a success response."""
        total_distance = sum(r.distance for r in routes)
        return VRPResponse(
            status=SolutionStatus.FEASIBLE,
            routes=routes,
            total_distance=total_distance,
            wall_time_ms=wall_time_ms,
            solver_used=self.solver_type,
            message=message
        )
    
    def _calculate_distance(
        self, 
        matrix: List[List[float]], 
        from_idx: int, 
        to_idx: int
    ) -> float:
        """Get distance between two nodes from the matrix."""
        return matrix[from_idx][to_idx]
    
    def _calculate_route_distance(
        self, 
        matrix: List[List[float]], 
        route: List[int]
    ) -> float:
        """Calculate total distance for a route."""
        if len(route) < 2:
            return 0.0
        
        total = 0.0
        for i in range(len(route) - 1):
            total += self._calculate_distance(matrix, route[i], route[i + 1])
        return total
