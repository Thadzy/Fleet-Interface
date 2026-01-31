"""
VRP Server Application Package
==============================
Production-grade VRP Solver service using FastAPI.

To run:
    uvicorn app.main:app --host 0.0.0.0 --port 7779 --reload

Or programmatically:
    from app.main import app
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7779)
"""

from .main import app
from .models import VRPRequest, VRPResponse, SolverType
from .config import SOLVER_CONFIG, SERVER_CONFIG

__all__ = [
    'app',
    'VRPRequest',
    'VRPResponse',
    'SolverType',
    'SOLVER_CONFIG',
    'SERVER_CONFIG',
]
