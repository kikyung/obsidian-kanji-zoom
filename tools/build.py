#!/usr/bin/env python3
"""
Build ./main.js from src/main.js, embedding data/kanji.json.

Obsidian's plugin installer only downloads main.js, manifest.json and styles.css,
so the kanji dictionary has to live inside main.js.

    python3 tools/build.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKER = "/*@@KANJI_DATA@@*/ null"


def main():
    with open(os.path.join(ROOT, "src", "main.js"), encoding="utf-8") as f:
        src = f.read()
    if src.count(MARKER) != 1:
        sys.exit(f"marker {MARKER!r} must appear exactly once in src/main.js")

    with open(os.path.join(ROOT, "data", "kanji.json"), encoding="utf-8") as f:
        data = json.load(f)
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    header = (
        "/* Kanji Zoom — built file, do not edit. Source: src/main.js\n"
        " * Kanji data: KANJIDIC2 © EDRDG, CC BY-SA 4.0 "
        "(https://www.edrdg.org/edrdg/licence.html) */\n"
    )
    out = header + src.replace(MARKER, blob)
    with open(os.path.join(ROOT, "main.js"), "w", encoding="utf-8") as f:
        f.write(out)

    # Release sanity checks
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    with open(os.path.join(ROOT, "versions.json"), encoding="utf-8") as f:
        versions = json.load(f)
    if manifest["version"] not in versions:
        sys.exit(f"versions.json is missing {manifest['version']}")

    print(f"main.js built: {len(out) // 1024} KB, {len(data)} kanji, v{manifest['version']}")


if __name__ == "__main__":
    main()
