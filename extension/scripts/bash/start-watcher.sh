#!/usr/bin/env bash
# Start the markdown file watcher

set -e

WORKSPACE_ROOT="${1:-$PWD}"
API_URL="${2:-http://127.0.0.1:8000}"
API_KEY="${3:-dev-key}"

echo "Starting Markdown File Watcher..."
echo "  Workspace: $WORKSPACE_ROOT"
echo "  API URL: $API_URL"
echo ""
echo "Watching for .md file changes (Ctrl+C to stop)..."
echo ""

export SPECKIT_EXT_ROOT="$WORKSPACE_ROOT"
export SPECKIT_EXT_API_URL="$API_URL"
export SPECKIT_EXT_API_KEY="$API_KEY"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCHER_SCRIPT="$SCRIPT_DIR/../python/markdown_watcher.py"

python3 "$WATCHER_SCRIPT"
