"""
VRP Server - FastAPI Application
================================
Production-grade Vehicle Routing Problem solver service.

This service provides:
- Multiple solver algorithms (OR-Tools, Greedy)
- Strict input validation via Pydantic
- Health checks for service monitoring
- OpenAPI documentation at /docs

Author: WCS Team
Version: 2.0.0
"""

import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .models import (
    VRPRequest, VRPResponse, HealthResponse, ErrorResponse,
    SolverType, SolutionStatus
)
from .config import SOLVER_CONFIG, SERVER_CONFIG
from .solvers import get_solver, list_available_solvers

# ============================================
# LOGGING SETUP
# ============================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


# ============================================
# LIFESPAN (Startup/Shutdown)
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    # Startup
    logger.info("=" * 60)
    logger.info("VRP SOLVER SERVICE - Starting")
    logger.info(f"Version: 2.0.0")
    logger.info(f"Default Solver: {SOLVER_CONFIG.default_solver.value}")
    logger.info(f"Available Solvers: {[s.value for s in list_available_solvers()]}")
    logger.info("=" * 60)
    
    yield
    
    # Shutdown
    logger.info("VRP Solver Service shutting down...")


# ============================================
# FASTAPI APP
# ============================================

app = FastAPI(
    title="VRP Solver Service",
    description="Vehicle Routing Problem solver with Pickup & Delivery support",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# EXCEPTION HANDLERS
# ============================================

@app.exception_handler(ValidationError)
async def validation_exception_handler(request, exc: ValidationError):
    """Handle Pydantic validation errors."""
    return JSONResponse(
        status_code=422,
        content=ErrorResponse(
            error="Validation Error",
            detail=str(exc)
        ).model_dump()
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc: Exception):
    """Handle unexpected errors."""
    logger.exception(f"Unexpected error: {exc}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal Server Error",
            detail=str(exc)
        ).model_dump()
    )


# ============================================
# ENDPOINTS
# ============================================

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint for service monitoring.
    
    Returns service status and available solvers.
    """
    return HealthResponse(
        status="ok",
        service="VRP Solver",
        version="2.0.0",
        solver_available=list_available_solvers()
    )


@app.post(
    "/solve",
    response_model=VRPResponse,
    responses={
        422: {"model": ErrorResponse, "description": "Validation error or no solution"},
        500: {"model": ErrorResponse, "description": "Server error"},
    },
    tags=["Solver"]
)
async def solve_vrp(request: VRPRequest):
    """
    Solve a Vehicle Routing Problem with Pickup & Delivery constraints.
    
    The solver will find optimal routes for vehicles to:
    1. Start at the depot
    2. Visit pickup locations
    3. Deliver to corresponding delivery locations
    4. Return to depot
    
    The same vehicle must handle both pickup and delivery for each request.
    """
    start_time = time.time()
    
    # Determine which solver to use
    solver_type = request.solver_type or SOLVER_CONFIG.default_solver
    
    logger.info(
        f"Solving VRP: {len(request.matrix)} nodes, "
        f"{len(request.requests)} tasks, "
        f"{request.vehicle_count} vehicles, "
        f"solver={solver_type.value}"
    )
    
    try:
        # Get solver instance
        solver = get_solver(solver_type)
        
        # Solve the problem
        response = solver.solve(request)
        
        # Log result
        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.info(
            f"VRP solved: status={response.status.value}, "
            f"routes={len(response.routes)}, "
            f"distance={response.total_distance:.1f}, "
            f"time={elapsed_ms}ms"
        )
        
        # If infeasible, return 422
        if response.status == SolutionStatus.INFEASIBLE:
            raise HTTPException(
                status_code=422,
                detail=response.message or "No feasible solution found"
            )
        
        return response
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid solver request: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Solver error: {e}")
        raise HTTPException(status_code=500, detail=f"Solver error: {str(e)}")


@app.get("/solvers", response_model=list[SolverType], tags=["Info"])
async def list_solvers():
    """
    List available solver algorithms.
    """
    return list_available_solvers()


# ============================================
# LEGACY ENDPOINT (Flask compatibility)
# ============================================

@app.post("/solve_legacy", include_in_schema=False)
async def solve_legacy(request: dict):
    """
    Legacy endpoint for backward compatibility with Flask API.
    
    Accepts the old request format:
    {
        "matrix": [[...]],
        "requests": [[pickup_idx, delivery_idx], ...],
        "vehicle_count": 2
    }
    """
    from .models import PickupDeliveryPair
    
    # Convert legacy format
    legacy_requests = request.get("requests", [])
    converted_requests = [
        PickupDeliveryPair(pickup_index=r[0], delivery_index=r[1])
        for r in legacy_requests
    ]
    
    vrp_request = VRPRequest(
        matrix=request.get("matrix", []),
        requests=converted_requests,
        vehicle_count=request.get("vehicle_count", 1),
        depot_index=request.get("depot_index", 0),
    )
    
    return await solve_vrp(vrp_request)


# ============================================
# MAIN ENTRY POINT
# ============================================

def main():
    """Run the server with Uvicorn."""
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=SERVER_CONFIG.host,
        port=SERVER_CONFIG.port,
        reload=SERVER_CONFIG.debug,
        log_level="info"
    )


if __name__ == "__main__":
    main()
