"""
VRP Server - Pydantic Models
============================
Defines the request/response contracts for the VRP Solver API.
Uses Pydantic for strict validation and automatic OpenAPI documentation.

Author: WCS Team
Version: 2.0.0
"""

from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum


# ============================================
# ENUMS
# ============================================

class SolverType(str, Enum):
    """Available solver algorithms."""
    GREEDY = "greedy"
    ORTOOLS = "ortools"
    NEAREST_NEIGHBOR = "nearest_neighbor"


class SolutionStatus(str, Enum):
    """Status of the solver result."""
    FEASIBLE = "feasible"
    INFEASIBLE = "infeasible"
    TIMEOUT = "timeout"
    ERROR = "error"


# ============================================
# REQUEST MODELS
# ============================================

class PickupDeliveryPair(BaseModel):
    """
    Represents a single Pickup & Delivery task.
    
    Attributes:
        pickup_index: Index in the distance matrix for pickup location.
        delivery_index: Index in the distance matrix for delivery location.
    """
    pickup_index: int = Field(..., ge=0, description="Pickup node index (must be >= 0)")
    delivery_index: int = Field(..., ge=0, description="Delivery node index (must be >= 0)")
    
    @model_validator(mode='after')
    def validate_different_indices(self):
        """Ensure pickup and delivery are different locations."""
        if self.pickup_index == self.delivery_index:
            raise ValueError("Pickup and delivery must be different locations")
        return self


class VRPRequest(BaseModel):
    """
    Request payload for solving a Vehicle Routing Problem.
    
    The distance matrix represents travel costs between all nodes.
    Index 0 is assumed to be the depot (robot home position).
    
    Attributes:
        matrix: 2D distance matrix (N x N) where matrix[i][j] is distance from i to j.
        requests: List of pickup/delivery pairs to fulfill.
        vehicle_count: Number of available vehicles/robots.
        depot_index: Index of the depot node (default 0).
        solver_type: Algorithm to use (optional, uses server default).
        max_solve_time_seconds: Maximum time allowed for solving (optional).
    """
    matrix: List[List[float]] = Field(
        ..., 
        min_length=1,
        description="NxN distance matrix"
    )
    requests: List[PickupDeliveryPair] = Field(
        default=[],
        description="Pickup/Delivery pairs to solve"
    )
    vehicle_count: int = Field(
        default=1, 
        ge=1, 
        le=100,
        description="Number of vehicles/robots"
    )
    depot_index: int = Field(
        default=0, 
        ge=0,
        description="Index of the depot node"
    )
    solver_type: Optional[SolverType] = Field(
        default=None,
        description="Override solver algorithm"
    )
    max_solve_time_seconds: Optional[float] = Field(
        default=30.0,
        ge=1.0,
        le=300.0,
        description="Maximum solve time in seconds"
    )
    
    @field_validator('matrix')
    @classmethod
    def validate_matrix_square(cls, v: List[List[float]]) -> List[List[float]]:
        """Ensure matrix is square (NxN)."""
        n = len(v)
        for row in v:
            if len(row) != n:
                raise ValueError(f"Matrix must be square. Expected {n} columns, got {len(row)}")
        return v
    
    @model_validator(mode='after')
    def validate_indices_in_range(self):
        """Ensure all node indices are within matrix bounds."""
        n = len(self.matrix)
        
        if self.depot_index >= n:
            raise ValueError(f"Depot index {self.depot_index} out of range (matrix size: {n})")
        
        for i, req in enumerate(self.requests):
            if req.pickup_index >= n:
                raise ValueError(f"Request {i}: pickup_index {req.pickup_index} out of range")
            if req.delivery_index >= n:
                raise ValueError(f"Request {i}: delivery_index {req.delivery_index} out of range")
        
        return self


# ============================================
# RESPONSE MODELS
# ============================================

class RouteStep(BaseModel):
    """A single step in a vehicle's route."""
    node_index: int = Field(..., description="Index of the node to visit")
    arrival_distance: float = Field(default=0.0, description="Cumulative distance at this point")


class VehicleRoute(BaseModel):
    """
    Route assigned to a single vehicle.
    
    Attributes:
        vehicle_id: Identifier for this vehicle (0-indexed).
        nodes: Ordered list of node indices to visit.
        distance: Total distance traveled by this vehicle.
    """
    vehicle_id: int = Field(..., ge=0, description="Vehicle identifier (0-indexed)")
    nodes: List[int] = Field(..., min_length=1, description="Ordered node indices to visit")
    distance: float = Field(..., ge=0, description="Total route distance")


class VRPResponse(BaseModel):
    """
    Response payload from the VRP solver.
    
    Attributes:
        status: Solution status (feasible/infeasible/error).
        routes: List of routes, one per vehicle with work.
        total_distance: Sum of all route distances.
        wall_time_ms: Solve time in milliseconds.
        solver_used: Which algorithm produced this solution.
        message: Human-readable status message.
    """
    status: SolutionStatus = Field(..., description="Solution status")
    routes: List[VehicleRoute] = Field(default=[], description="Vehicle routes")
    total_distance: float = Field(default=0.0, ge=0, description="Total distance across all routes")
    wall_time_ms: int = Field(default=0, ge=0, description="Solve time in milliseconds")
    solver_used: SolverType = Field(..., description="Algorithm used")
    message: str = Field(default="", description="Status message")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(default="ok")
    service: str = Field(default="VRP Solver")
    version: str = Field(default="2.0.0")
    solver_available: List[SolverType] = Field(default=[])


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(default=None, description="Additional details")
