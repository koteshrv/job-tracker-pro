#!/bin/bash

# Start FastAPI Backend first
echo "🚀 Starting FastAPI Backend..."
source venv/bin/activate

# LOG_LEVEL controls verbosity: DEBUG=verbose (testing), INFO=default (production)
export LOG_LEVEL=DEBUG

# Create dump directory if it doesn't exist
mkdir -p backend/dump
TS=$(date +%s)

# Run uvicorn in the background, keep output in console AND save to dump/
python3 -m uvicorn backend.main:app --port 8000 2>&1 | tee "backend/dump/run_$TS.log" &
BACKEND_PID=$!

# Wait until the health endpoint answers
while ! curl -s http://127.0.0.1:8000/healthz > /dev/null 2>&1; do
  sleep 0.5
done

# Start Vite Frontend
echo "✨ Starting Vite Frontend..."
cd frontend
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
npm run dev &
FRONTEND_PID=$!

echo "====================================="
echo "✅ Backend running on http://localhost:8000"
echo "✅ Frontend running on http://localhost:5173"
echo "====================================="
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
wait
