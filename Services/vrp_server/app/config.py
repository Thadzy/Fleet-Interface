"""
VRP Server - Configuration
==========================
Centralizes configuration for the VRP Solver service.

Author: WCS Team
Version: 2.0.0
"""

import os
from dataclasses import dataclass
from typing import Optional

from .models import SolverType


@dataclass(frozen=True)
class SolverConfig:
    """
    Configuration for the VRP Solver service.
    
    Attributes:
        default_solver: Default algorithm to use when not specified in request.
        max_solve_time_seconds: Default maximum solve time.
        max_vehicles: Maximum number of vehicles allowed.
        max_nodes: Maximum matrix size allowed.
    """
    default_solver: SolverType = SolverType.ORTOOLS
    max_solve_time_seconds: float = 30.0
    max_vehicles: int = 100
    max_nodes: int = 1000


@dataclass(frozen=True)
class ServerConfig:
    """
    Configuration for the HTTP server.
    """
    host: str = "0.0.0.0"
    port: int = 7779
    debug: bool = False


def get_solver_config() -> SolverConfig:
    """Load solver configuration from environment variables."""
    solver_type_str = os.getenv("VRP_SOLVER_TYPE", "ortools").lower()
    
    try:
        solver_type = SolverType(solver_type_str)
    except ValueError:
        solver_type = SolverType.ORTOOLS
    
    return SolverConfig(
        default_solver=solver_type,
        max_solve_time_seconds=float(os.getenv("VRP_MAX_SOLVE_TIME", "30")),
        max_vehicles=int(os.getenv("VRP_MAX_VEHICLES", "100")),
        max_nodes=int(os.getenv("VRP_MAX_NODES", "1000")),
    )


def get_server_config() -> ServerConfig:
    """Load server configuration from environment variables."""
    return ServerConfig(
        host=os.getenv("VRP_HOST", "0.0.0.0"),
        port=int(os.getenv("VRP_PORT", "7779")),
        debug=os.getenv("VRP_DEBUG", "false").lower() == "true",
    )


# Singleton instances
SOLVER_CONFIG = get_solver_config()
SERVER_CONFIG = get_server_config()
