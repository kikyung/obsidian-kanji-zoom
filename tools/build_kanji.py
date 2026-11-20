#!/usr/bin/env python3
"""
KANJIDIC2 (EDRDG, CC BY-SA 4.0) → kanji.json 변환기

사용법:
    python3 tools/build_kanji.py path/to/kanjidic2.xml.gz [out=kanji.json]

kanjidic2.xml.gz 받는 곳: http://www.edrdg.org/kanjidic/kanjidic2.xml.gz

상용한자(grade 1-8) 또는 JLPT 등급이 있는 한자만 남깁니다.
출력 형식: { "参": {"on":[..], "kun":[..], "ko":[..], "m":[..영어],
                    "m_fr":[..], "m_es":[..], "m_pt":[..], "jlpt":3, "g":4, "s":8}, ... }
"""
import gzip
import json
import sys
import xml.etree.ElementTree as ET


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "kanji.json"

    opener = gzip.open if src.endswith(".gz") else open
    with opener(src, "rb") as f:
        tree = ET.parse(f)

    data = {}
    for ch in tree.getroot().iter("character"):
        lit = ch.findtext("literal")
        misc = ch.find("misc")
        grade = misc.findtext("grade") if misc is not None else None
        jlpt = misc.findtext("jlpt") if misc is not None else None
        stroke = misc.findtext("stroke_count") if misc is not None else None
        if not grade and not jlpt:
            continue

        on, kun, ko = [], [], []
        meanings = {"en": [], "fr": [], "es": [], "pt": []}
        rm = ch.find("reading_meaning")
        if rm is not None:
            for group in rm.iter("rmgroup"):
                for r in group.findall("reading"):
                    t = r.get("r_type")
                    if t == "ja_on":
                        on.append(r.text)
                    elif t == "ja_kun":
                        kun.append(r.text)
                    elif t == "korean_h":
                        ko.append(r.text)
                for m in group.findall("meaning"):
                    lang = m.get("m_lang") or "en"
                    if lang in meanings:
                        meanings[lang].append(m.text)

        entry = {"on": on, "kun": kun, "ko": ko, "m": meanings["en"][:6]}
        for lang in ("fr", "es", "pt"):
            if meanings[lang]:
                entry["m_" + lang] = meanings[lang][:5]
        if jlpt:
            entry["jlpt"] = int(jlpt)
        if grade:
            entry["g"] = int(grade)
        if stroke:
            entry["s"] = int(stroke)
        data[lit] = entry

    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(data)} kanji → {out}")


if __name__ == "__main__":
    main()
