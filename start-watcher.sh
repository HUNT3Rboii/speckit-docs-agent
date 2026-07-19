#!/usr/bin/env bash
# Quick start script for markdown file watcher
# Run from the backend repository root

set -e

API_URL="${SPECKIT_EXT_API_URL:-http://127.0.0.1:8000}"
API_KEY="${SPECKIT_EXT_API_KEY:-dev-key}"
WORKSPACE_ROOT="${1}"

echo "=================================="
echo "Documentation Agent File Watcher"
echo "=================================="
echo ""

# Validate workspace root
if [ -z "$WORKSPACE_ROOT" ]; then
    echo "Error: Workspace root required"
    echo ""
    echo "Usage:"
    echo "  ./start-watcher.sh /path/to/workspace"
    echo ""
    echo "Optional environment variables:"
    echo "  SPECKIT_EXT_API_URL (default: http://127.0.0.1:8000)"
    echo "  SPECKIT_EXT_API_KEY (default: dev-key)"
    exit 1
fi

if [ ! -d "$WORKSPACE_ROOT" ]; then
    echo "Error: Workspace not found: $WORKSPACE_ROOT"
    exit 1
fi

# Check if backend is running
echo "Checking backend connection..."
if curl -s -f -H "Authorization: Bearer $API_KEY" "$API_URL/api/projects" > /dev/null 2>&1; then
    echo "Backend is running!"
else
    echo "Warning: Backend not reachable at $API_URL"
    echo "Start backend first with: docker-compose up -d"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "Starting watcher..."
echo "  Workspace: $WORKSPACE_ROOT"
echo "  API URL: $API_URL"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the watcher
export SPECKIT_EXT_ROOT="$WORKSPACE_ROOT"
export SPECKIT_EXT_API_URL="$API_URL"
export SPECKIT_EXT_API_KEY="$API_KEY"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCHER_SCRIPT="$SCRIPT_DIR/extension/scripts/python/markdown_watcher.py"

python3 "$WATCHER_SCRIPT"
