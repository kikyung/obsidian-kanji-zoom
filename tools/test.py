#!/usr/bin/env python3
"""
Run tests/plugin.test.js against the built main.js.

Uses Node.js when available (CI), otherwise macOS JavaScriptCore via
`osascript -l JavaScript`, so no Node install is needed locally.

    python3 tools/test.py            # exit 0 = all tests pass
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def engine():
    if shutil.which("node"):
        return "node"
    if sys.platform == "darwin" and shutil.which("osascript"):
        return "jsc"
    return None


def main():
    if not os.path.exists(os.path.join(ROOT, "main.js")):
        sys.exit("main.js not found — run python3 tools/build.py first")

    prelude = "var __SRC__ = {};\nvar __SAMPLES__ = {};\n".format(
        json.dumps(read("main.js")),
        json.dumps(
            {
                "ko": read("samples", "일본어_N3_2026-11-20.md"),
                "en": read("samples", "Japanese_N2_demo.md"),
            },
            ensure_ascii=False,
        ),
    )
    body = read("tests", "plugin.test.js")

    eng = engine()
    if eng is None:
        sys.exit("No JavaScript engine: install Node.js (or run on macOS)")

    if eng == "node":
        script = prelude + body + "\n;console.log(__results.lines.join('\\n'));\n"
        cmd = ["node"]
    else:
        script = prelude + body
        cmd = ["osascript", "-l", "JavaScript"]

    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(script)
        path = f.name
    try:
        proc = subprocess.run(cmd + [path], capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(path)

    output = (proc.stdout or "") + (proc.stderr or "")
    print(f"[test] engine: {eng}")
    print(output.rstrip())

    m = re.search(r"RESULT pass=(\d+) fail=(\d+)", output)
    if proc.returncode != 0 or not m:
        sys.exit("[test] test run crashed (syntax or load error in main.js?)")
    if int(m.group(2)) > 0:
        sys.exit(f"[test] {m.group(2)} test(s) failed")
    print(f"[test] all {m.group(1)} tests passed")


if __name__ == "__main__":
    main()
