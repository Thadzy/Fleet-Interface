"""
VRP Server - Entry Point
========================
Simple entry point to run the VRP Solver service.

Usage:
    python run.py
    
Or with uvicorn directly:
    uvicorn app.main:app --host 0.0.0.0 --port 7779 --reload
"""

import uvicorn
import os
import sys

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    print("=" * 60)
    print("VRP SOLVER SERVICE")
    print("Starting on http://0.0.0.0:7779")
    print("Docs: http://localhost:7779/docs")
    print("=" * 60)
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=7779,
        reload=True,
        log_level="info"
    )
