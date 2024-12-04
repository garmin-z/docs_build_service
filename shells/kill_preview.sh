#!/bin/bash

PORT=3040
PID=$(lsof -t -i:$PORT)

if [ -n "$PID" ]; then
    echo "Killing process on port $PORT with PID $PID"
    kill -9 $PID
else
    echo "No process found on port $PORT"
fi
