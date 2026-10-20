#!/bin/bash

PORT="${DOCS_PREVIEW_PORT:-3040}"
PIDS=$(lsof -t -i:$PORT 2>/dev/null | sort -u)

if [ -z "$PIDS" ]; then
    echo "No process found on port $PORT"
    exit 0
fi

for pid in $PIDS; do
    cmd=$(ps -p "$pid" -o args= 2>/dev/null)
    case "$cmd" in
        *node*|*vitepress*|*docs:dev*)
            echo "Killing process on port $PORT with PID $pid"
            kill -9 "$pid"
            ;;
        *)
            # 端口被其他程序占用时不误杀
            echo "Skip PID $pid on port $PORT (not a node/vitepress process): $cmd"
            ;;
    esac
done
