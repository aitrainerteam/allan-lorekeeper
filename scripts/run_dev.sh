#!/usr/bin/env bash
set -euo pipefail

echo "Starting LoreKeeper development servers..."
echo "FastAPI backend: http://localhost:8000"
echo "Map frontend (Vite): http://localhost:5137"
echo ""

# Check if concurrently is available for parallel execution
if command -v concurrently >/dev/null 2>&1; then
    echo "Using concurrently to run both servers in parallel..."
    concurrently \
        --names "fastapi,map" \
        --prefix name \
        "uvicorn app.main:app --reload --port 8000" \
        "cd map && npm run dev -- --port 5137 --host"
else
    echo "Running servers sequentially (install 'concurrently' globally for parallel execution)"
    echo "Install with: npm install -g concurrently"
    echo ""

    # Run vite in background
    echo "Starting map development server..."
    cd map
    npm run dev &
    VITE_PID=$!
    cd ..

    # Run uvicorn in foreground (will show logs)
    echo "Starting FastAPI server..."
    uvicorn app.main:app --reload --port 8000 &
    UVICORN_PID=$!

    # Wait for both processes
    wait $UVICORN_PID $VITE_PID
fi