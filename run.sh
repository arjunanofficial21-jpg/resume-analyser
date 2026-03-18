#!/bin/bash

# Ensure we terminate all background processes when the script exits
trap 'kill 0' SIGINT SIGTERM EXIT

echo "Starting PDF RAG Application..."

# 1. Start the Backend
echo "Starting Backend Server..."
cd backend
source venv/bin/activate
export PYTHONPATH=.
uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait a moment to ensure backend starts successfully
sleep 2

# 2. Start the Frontend
echo "Starting Frontend Server..."
cd frontend
npm run dev -- --host &
FRONTEND_PID=$!
cd ..

echo ""
echo "================================================================"
echo "✅ Application is running!"
echo ""
echo "🌍 Frontend locally: http://localhost:5173"
echo "⚙️  Backend API locally: http://localhost:8000"
echo "📜 Backend API Docs: http://localhost:8000/docs"
echo "================================================================"
echo "Press Ctrl+C to stop both servers."

# Wait for background processes to keep the script running
wait
