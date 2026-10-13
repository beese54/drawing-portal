"""
test_thread_stack.py — Deep input must raise, never crash, in any thread.

Found 2026-10-13 moving the image to Alpine (1.1.1). musl gives a new thread a
128 KiB stack where glibc gives 8 MiB, and CPython's recursion guard assumes
the bigger one. JSON nested 100,000 deep, parsed in a worker thread, then
overflows the C stack: a segfault that kills the whole process, where glibc
raises RecursionError (a 422 here). Requests run on the main thread today
(every endpoint is async), so production answered 422 either way. But
anything run in Starlette's threadpool, such as a future `def` endpoint, would
have taken the server down with one request. app/main.py sets the
glibc-sized default.

The check runs in a subprocess so that, on a system without the fix, the
crash fails this test rather than the whole test run.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

PROBE = """
import json, threading
import app.main  # noqa: F401  (sets the thread stack size)

result = []
def parse():
    try:
        json.loads("[" * 100_000 + "]" * 100_000)
        result.append("parsed")
    except RecursionError:
        result.append("RecursionError")

t = threading.Thread(target=parse)
t.start()
t.join()
print(result[0])
"""


def test_deep_json_in_a_worker_thread_raises_instead_of_crashing():
    r = subprocess.run([sys.executable, "-c", PROBE], cwd=BACKEND,
                       capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, f"worker thread crashed the process (exit {r.returncode}): {r.stderr[-500:]}"
    assert r.stdout.strip() == "RecursionError", r.stdout
