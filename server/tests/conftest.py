"""Put the backend and its vendored dependencies on the path.

Tests run under whatever interpreter the developer has, not the bundled one, so
they reach for `server/vendor` the same way `main.py` does.
"""

import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]

for entry in (SERVER_ROOT, SERVER_ROOT / "vendor"):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))
