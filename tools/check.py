#!/usr/bin/env python3
"""
One-stop guardrail: build + Obsidian compatibility checks + tests.

    python3 tools/check.py            # local / hooks: placeholders are warnings
    python3 tools/check.py --release  # CI release: placeholders are errors
    python3 tools/check.py --no-test  # skip the JS test run

Exit code 0 = safe to ship, 1 = something is wrong (details on stderr).
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RELEASE = "--release" in sys.argv
RUN_TESTS = "--no-test" not in sys.argv

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    (errors if RELEASE else warnings).append(msg)


def read(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return f.read()


def load_json(*parts):
    try:
        return json.loads(read(*parts))
    except FileNotFoundError:
        err(f"{'/'.join(parts)} is missing")
    except json.JSONDecodeError as e:
        err(f"{'/'.join(parts)} is not valid JSON: {e}")
    return None


SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def check_manifest():
    m = load_json("manifest.json")
    v = load_json("versions.json")
    if m is None:
        return None
    for key in ("id", "name", "version", "minAppVersion", "description", "author", "isDesktopOnly"):
        if key not in m:
            err(f"manifest.json: missing '{key}'")
    pid = m.get("id", "")
    if not re.fullmatch(r"[a-z0-9-]+", pid):
        err(f"manifest.json: id '{pid}' must be lowercase letters, digits and dashes")
    if "obsidian" in pid:
        err("manifest.json: id must not contain 'obsidian'")
    if pid.endswith("plugin"):
        err("manifest.json: id must not end with 'plugin'")
    if "obsidian" in m.get("name", "").lower():
        err("manifest.json: name must not contain 'Obsidian'")

    desc = m.get("description", "")
    if len(desc) > 250:
        err(f"manifest.json: description is {len(desc)} chars (max 250)")
    if not desc.endswith((".", "?", "!", ")")):
        err("manifest.json: description must end with a period")
    if "obsidian" in desc.lower():
        err("manifest.json: description must not mention 'Obsidian'")
    if desc.lower().startswith("this plugin") or desc.lower().startswith("a plugin"):
        err("manifest.json: description should start with a verb, not 'This plugin'")

    for key in ("version", "minAppVersion"):
        if key in m and not SEMVER.match(m[key]):
            err(f"manifest.json: {key} '{m[key]}' is not x.y.z")
    if v is not None and "version" in m:
        if m["version"] not in v:
            err(f"versions.json: missing entry for {m['version']}")
        elif v[m["version"]] != m.get("minAppVersion"):
            err(f"versions.json: {m['version']} → {v[m['version']]} but minAppVersion is {m.get('minAppVersion')}")

    for key in ("authorUrl", "fundingUrl"):
        val = m.get(key)
        urls = list(val.values()) if isinstance(val, dict) else [val] if val else []
        for u in urls:
            if not re.match(r"^https?://", u):
                err(f"manifest.json: {key} '{u}' is not an http(s) URL")
            if "YOUR_" in u:
                warn(f"manifest.json: {key} still has a placeholder ({u})")
    return m


def strip_comments(js):
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    return re.sub(r"(^|[^:\\])//[^\n]*", r"\1", js)


def check_source(manifest):
    src = read("src", "main.js")
    code = strip_comments(src)

    if src.count("/*@@KANJI_DATA@@*/ null") != 1:
        err("src/main.js: the /*@@KANJI_DATA@@*/ marker must appear exactly once")

    rules = [
        (r"\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML", "uses innerHTML/outerHTML (use the DOM API; Obsidian review rejects this)"),
        (r"\beval\s*\(", "uses eval()"),
        (r"\bfetch\s*\(|XMLHttpRequest|requestUrl\s*\(", "makes network requests (README promises offline use)"),
        (r"\bhotkeys\s*:", "ships a default hotkey (Obsidian guidelines forbid this)"),
        (r"\(\?<[=!]", "uses regex lookbehind (crashes on older iOS Safari)"),
        (r"\bdetachLeavesOfType\s*\(", "detaches leaves in onunload (Obsidian guidelines)"),
        (r"\.style\.(?!setProperty\b)[a-zA-Z]+\s*=(?!=)", "assigns inline styles (use CSS classes or CSS variables; Obsidian review flags this)"),
        (r"\b(localStorage|sessionStorage)\b", "uses localStorage/sessionStorage (use loadData/saveData; the community directory flags this)"),
    ]
    for pattern, msg in rules:
        if re.search(pattern, code):
            err(f"src/main.js: {msg}")

    for mod in re.findall(r"require\(\s*[\"']([^\"']+)[\"']\s*\)", code):
        if mod != "obsidian" and manifest and manifest.get("isDesktopOnly") is False:
            err(f"src/main.js: require('{mod}') breaks mobile (isDesktopOnly is false)")

    if re.search(r"console\.log\s*\(", code):
        warnings.append("src/main.js: console.log left in code")
    if "YOUR_" in src:
        warn("src/main.js: contains a YOUR_ placeholder")


def check_css():
    css = read("styles.css")
    body = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    if body.count("{") != body.count("}"):
        err(f"styles.css: unbalanced braces ({body.count('{')} '{{' vs {body.count('}')} '}}')")
    for sel in re.findall(r"(?m)^\s*\.([a-zA-Z][\w-]*)", body):
        if not sel.startswith(("jpv", "modal", "markdown")):
            warnings.append(f"styles.css: class .{sel} is not namespaced with 'jpv-' (may clash with themes)")


def check_readme():
    """The community directory rejects READMEs with leftover template text."""
    readme = read("README.md")
    for pattern, what in [
        (r"\bTODO\b|\bFIXME\b", "a TODO/FIXME note"),
        (r"<!--", "an HTML comment (template note)"),
        (r"\[description\]|lorem ipsum|YOUR_", "template text"),
    ]:
        if re.search(pattern, readme, flags=re.I):
            err(f"README.md: contains {what} — the Obsidian community directory flags this")


def check_data():
    data = load_json("data", "kanji.json")
    if data is None:
        return
    if len(data) < 2500:
        err(f"data/kanji.json: only {len(data)} kanji (rebuild with tools/build_kanji.py)")
    sample = data.get("参", {})
    for key in ("on", "kun", "ko", "m"):
        if not sample.get(key):
            err(f"data/kanji.json: 参 is missing '{key}'")


def build():
    proc = subprocess.run([sys.executable, "-I", os.path.join(ROOT, "tools", "build.py")], capture_output=True, text=True)
    if proc.returncode != 0:
        err("build failed:\n" + (proc.stdout + proc.stderr).strip())
        return False
    out = read("main.js")
    if "@@KANJI_DATA@@" in out:
        err("main.js: kanji data was not embedded")
    size = os.path.getsize(os.path.join(ROOT, "main.js"))
    if size > 5 * 1024 * 1024:
        err(f"main.js: {size // 1024} KB is too large")
    print("[check] " + proc.stdout.strip())
    return True


def run_tests():
    proc = subprocess.run([sys.executable, "-I", os.path.join(ROOT, "tools", "test.py")], capture_output=True, text=True)
    text = (proc.stdout + proc.stderr).strip()
    if proc.returncode != 0:
        failing = [l for l in text.splitlines() if "FAIL" in l or l.startswith("       ") or "[test]" in l]
        err("tests failed:\n" + "\n".join(failing or [text]))
    else:
        print("[check] " + text.splitlines()[-1].replace("[test] ", ""))


def main():
    manifest = check_manifest()
    check_source(manifest)
    check_css()
    check_readme()
    check_data()
    if build() and RUN_TESTS and not errors:
        run_tests()

    for w in warnings:
        print(f"[check] warning: {w}")
    if errors:
        print("[check] FAILED — fix these before finishing:", file=sys.stderr)
        for e in errors:
            print(f"  ✗ {e}", file=sys.stderr)
        sys.exit(1)
    print("[check] OK — build, compatibility and tests all pass" + (" (release mode)" if RELEASE else ""))


if __name__ == "__main__":
    main()
