#!/bin/bash
set -e

# Start AI YuNet Face Cropper microservice in background if present
if [ -f "/app/ai/smart_cropper_service.py" ]; then
    echo "[Entrypoint] Starting AI YuNet Face Cropper Microservice on port 5005..."
    python3 /app/ai/smart_cropper_service.py &
    sleep 1
fi

# Ensure uploads and data directories exist
mkdir -p /app/wwwroot/uploads /app/data

# Start .NET 8 Web API
echo "[Entrypoint] Launching BuaStudentApi .NET 8 Backend..."
exec dotnet BuaStudentApi.dll
