"""
VRP Solvers Package
===================
Contains all VRP solver implementations following the Strategy Pattern.

Usage:
    from app.solvers import get_solver, ORToolsSolver, GreedySolver
    
    solver = get_solver(SolverType.ORTOOLS)
    response = solver.solve(request)
"""

from typing import Dict, Type

from ..models import SolverType
from .base import BaseVRPSolver
from .ortools_solver import ORToolsSolver
from .greedy import GreedySolver


# Registry of available solvers
SOLVER_REGISTRY: Dict[SolverType, Type[BaseVRPSolver]] = {
    SolverType.ORTOOLS: ORToolsSolver,
    SolverType.GREEDY: GreedySolver,
    SolverType.NEAREST_NEIGHBOR: GreedySolver,  # Alias
}


def get_solver(solver_type: SolverType) -> BaseVRPSolver:
    """
    Factory function to get a solver instance by type.
    
    Args:
        solver_type: The type of solver to instantiate.
        
    Returns:
        An instance of the requested solver.
        
    Raises:
        ValueError: If solver type is not supported.
    """
    solver_class = SOLVER_REGISTRY.get(solver_type)
    
    if solver_class is None:
        raise ValueError(f"Unknown solver type: {solver_type}")
    
    return solver_class()


def list_available_solvers() -> list[SolverType]:
    """Return list of available solver types."""
    return list(SOLVER_REGISTRY.keys())


__all__ = [
    'BaseVRPSolver',
    'ORToolsSolver',
    'GreedySolver',
    'get_solver',
    'list_available_solvers',
    'SOLVER_REGISTRY',
]
