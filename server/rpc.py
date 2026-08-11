"""Line-delimited JSON-RPC over stdio.

One JSON object per line, UTF-8, no Content-Length framing: the messages here
are small and a line reader is far easier to debug by eye than a header parser.

stdout carries the protocol and nothing else. Anything written there by
accident corrupts the stream, so all diagnostics go to stderr - the extension
host surfaces that in its output channel.
"""

from __future__ import annotations

import json
import sys
import traceback
from typing import Any, Callable, Dict, TextIO

Handler = Callable[[Dict[str, Any]], Any]

# Mirrors JSON-RPC's reserved range; anything raised by a handler that is not a
# protocol problem is reported as a generic server error.
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
SERVER_ERROR = -32000


def log(message: str) -> None:
    """Diagnostics go to stderr. Never print() in this process."""
    print(message, file=sys.stderr, flush=True)


class Server:
    def __init__(self, stdin: TextIO | None = None, stdout: TextIO | None = None) -> None:
        self._stdin = stdin if stdin is not None else sys.stdin
        self._stdout = stdout if stdout is not None else sys.stdout
        self._handlers: Dict[str, Handler] = {}

    def method(self, name: str) -> Callable[[Handler], Handler]:
        def register(handler: Handler) -> Handler:
            self._handlers[name] = handler
            return handler

        return register

    def notify(self, method: str, params: Dict[str, Any] | None = None) -> None:
        self._write({"jsonrpc": "2.0", "method": method, "params": params or {}})

    def serve_forever(self) -> None:
        """Read until stdin closes.

        An empty read means the parent is gone. That is the reliable shutdown
        signal: VS Code does not always run deactivate(), and a backend that
        outlives its editor is an orphaned process holding the database file.
        """
        for line in self._stdin:
            line = line.strip()
            if not line:
                continue
            self._handle_line(line)

        log("stdin closed, exiting")

    def _handle_line(self, line: str) -> None:
        try:
            message = json.loads(line)
        except json.JSONDecodeError as exc:
            self._write_error(None, PARSE_ERROR, f"Invalid JSON: {exc}")
            return

        if not isinstance(message, dict):
            self._write_error(None, INVALID_REQUEST, "Request must be a JSON object")
            return

        request_id = message.get("id")
        method = message.get("method")
        params = message.get("params") or {}

        if not isinstance(method, str):
            self._write_error(request_id, INVALID_REQUEST, "Request is missing a method name")
            return

        handler = self._handlers.get(method)
        if handler is None:
            self._write_error(request_id, METHOD_NOT_FOUND, f"Unknown method: {method}")
            return

        try:
            result = handler(params)
        except Exception as exc:  # noqa: BLE001 - a handler failure must not kill the process
            log(f"handler {method} failed:\n{traceback.format_exc()}")
            self._write_error(request_id, SERVER_ERROR, str(exc) or exc.__class__.__name__)
            return

        # A request without an id is a notification; the caller wants no reply.
        if request_id is not None:
            self._write({"jsonrpc": "2.0", "id": request_id, "result": result})

    def _write_error(self, request_id: Any, code: int, message: str) -> None:
        if request_id is None:
            log(f"error with no request id to reply to: {message}")
            return
        self._write({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})

    def _write(self, payload: Dict[str, Any]) -> None:
        self._stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self._stdout.flush()
