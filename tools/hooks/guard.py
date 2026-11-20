#!/usr/bin/env python3
"""
Claude Code guardrail hooks for this project (wired in .claude/settings.json).

    guard.py pre   PreToolUse  Edit|Write : refuse edits to generated files
    guard.py post  PostToolUse Edit|Write : run tools/check.py after source edits
    guard.py stop  Stop                   : refuse to finish while checks fail

Reads the hook payload (JSON) on stdin.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

GENERATED = {
    "main.js": "main.js is generated. Edit src/main.js, then run python3 tools/build.py.",
    "data/kanji.json": "data/kanji.json is generated. Change tools/build_kanji.py and regenerate it from kanjidic2.xml.gz.",
}

# Edits under these paths can break the plugin, so they trigger a full check.
WATCHED = ("src/", "tests/", "tools/", "data/", "samples/", "styles.css", "manifest.json", "versions.json")


def payload():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def rel_path(data):
    tin = data.get("tool_input") or {}
    resp = data.get("tool_response") or {}
    path = tin.get("file_path") or tin.get("notebook_path") or (resp.get("filePath") if isinstance(resp, dict) else None)
    if not path:
        return None
    path = os.path.realpath(path)
    root = os.path.realpath(ROOT)
    if not path.startswith(root + os.sep):
        return None
    return os.path.relpath(path, root).replace(os.sep, "/")


def run_check():
    proc = subprocess.run(
        [sys.executable, "-I", os.path.join(ROOT, "tools", "check.py")],
        capture_output=True,
        text=True,
        timeout=180,
    )
    return proc.returncode, (proc.stdout + proc.stderr).strip()


def pre(data):
    rel = rel_path(data)
    if rel in GENERATED:
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": GENERATED[rel],
            }
        }))


def post(data):
    rel = rel_path(data)
    if not rel or not rel.startswith(WATCHED):
        return 0
    code, out = run_check()
    if code != 0:
        print(f"Guardrail: tools/check.py failed after editing {rel}. Fix it before moving on.\n{out}", file=sys.stderr)
        return 2
    return 0


def stop(data):
    if data.get("stop_hook_active"):
        return 0  # already blocked once this turn; don't loop
    code, out = run_check()
    if code != 0:
        print(json.dumps({
            "decision": "block",
            "reason": "Guardrail: build/compatibility/tests are failing. Fix them (or tell the user why you can't) before finishing.\n" + out,
        }))
    return 0


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    data = payload()
    if mode == "pre":
        pre(data)
        return 0
    if mode == "post":
        return post(data)
    if mode == "stop":
        return stop(data)
    print(f"unknown mode: {mode}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
