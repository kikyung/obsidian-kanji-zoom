/*
 * Kanji Zoom — Obsidian plugin (plain CommonJS, no bundler)
 *  - Open a note in a large-text full-screen reader
 *  - Convert 漢字(かな) inline readings into furigana (ruby)
 *  - Hover a kanji to see note vocabulary + KANJIDIC2 info
 *
 * Source file. `python3 tools/build.py` embeds data/kanji.json and writes ./main.js
 */
"use strict";

const obsidian = require("obsidian");
const {
  Plugin,
  Modal,
  MarkdownView,
  MarkdownRenderer,
  Component,
  PluginSettingTab,
  Setting,
  Notice,
} = obsidian;

// Replaced by tools/build.py with the contents of data/kanji.json
const EMBEDDED_KANJI = /*@@KANJI_DATA@@*/ null;

const FUNDING_URL = "https://buymeacoffee.com/kikyung";

const DEFAULT_SETTINGS = {
  fontSize: 32,
  lineHeight: 2.2,
  showFurigana: true,
  sectionButtons: true,
  showMeanings: true,
  meaningLang: "auto", // auto | en | fr | es | pt
  showKorean: null, // null = auto (on only when Obsidian is in Korean)
};

const MEANING_LANGS = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
};

const MIN_SIZE = 18;
const MAX_SIZE = 72;
const HEADLINE_MEANINGS = 3; // meanings shown large at the top of the kanji popup

/* ------------------------------------------------------------------ */
/* i18n (Korean / English)                                              */
/* ------------------------------------------------------------------ */

const STRINGS = {
  en: {
    open: "Open Kanji Zoom",
    cmdOpen: "Open current note",
    openSection: "Zoom this section",
    noNote: "No Markdown note is open.",
    viewer: "Kanji Zoom",
    fontSize: "Font size",
    lineHeight: "Line height",
    furigana: "Furigana",
    close: "Close (Esc)",
    koReading: "Korean",
    on: "On",
    kun: "Kun",
    meaning: "Meaning",
    strokes: (n) => `${n} strokes`,
    jlpt: (n) => `Old JLPT ${n}`,
    gradeEdu: (g) => `Kyōiku grade ${g}`,
    gradeJoyo: "Jōyō",
    gradeJinmei: "Jinmeiyō",
    notInDict: "Not in the kanji dictionary.",
    noteWords: "Words in this note",
    sFontSize: "Default font size",
    sFontSizeDesc: `Body text size in the viewer (${MIN_SIZE}–${MAX_SIZE}px).`,
    sFurigana: "Show furigana",
    sFuriganaDesc: "Show readings written as 参加(さんか) above the kanji.",
    sSection: "Section buttons",
    sSectionDesc: "Show a 🔍 button next to headings in reading view to zoom one section. Reopen the note to apply.",
    sMeanings: "Show meanings",
    sMeaningsDesc: "Show KANJIDIC2 meanings in the kanji popup.",
    sMeaningLang: "Meaning language",
    sMeaningLangDesc: "Language for kanji meanings. Falls back to English when a kanji has no translation.",
    auto: "Auto (Obsidian language)",
    sKorean: "Show Korean reading",
    sKoreanDesc: "Show the Korean (hanja) reading of each kanji, e.g. 参 → 삼, 참.",
    sSupport: "Support",
    sSupportDesc: "If this plugin helps your study, you can buy me a coffee ☕",
  },
  ko: {
    open: "한자 확대 보기 (Kanji Zoom)",
    cmdOpen: "현재 노트 크게 보기",
    openSection: "이 섹션 크게 보기",
    noNote: "열려 있는 마크다운 노트가 없습니다.",
    viewer: "Kanji Zoom",
    fontSize: "글자 크기",
    lineHeight: "줄 간격",
    furigana: "후리가나",
    close: "닫기 (Esc)",
    koReading: "한국 한자음",
    on: "음독",
    kun: "훈독",
    meaning: "뜻",
    strokes: (n) => `${n}획`,
    jlpt: (n) => `구 JLPT ${n}급`,
    gradeEdu: (g) => `교육한자 ${g}학년`,
    gradeJoyo: "상용한자",
    gradeJinmei: "인명용 한자",
    notInDict: "한자사전에 없는 글자입니다.",
    noteWords: "이 노트의 단어",
    sFontSize: "기본 글자 크기",
    sFontSizeDesc: `뷰어 본문 글자 크기 (${MIN_SIZE}–${MAX_SIZE}px)`,
    sFurigana: "후리가나 표시",
    sFuriganaDesc: "参加(さんか) 형식의 읽기를 한자 위 작은 글씨로 표시",
    sSection: "섹션 제목 옆 버튼",
    sSectionDesc: "읽기 모드에서 제목 옆 🔍 버튼으로 해당 섹션만 크게 보기 (노트를 다시 열면 반영)",
    sMeanings: "뜻 표시",
    sMeaningsDesc: "한자 팝업에 KANJIDIC2 뜻 표시",
    sMeaningLang: "뜻 언어",
    sMeaningLangDesc: "한자 뜻을 보여줄 언어. 번역이 없는 한자는 영어로 표시 (한국어 뜻은 사전에 없음)",
    auto: "자동 (옵시디언 언어)",
    sKorean: "한국 한자음 표시",
    sKoreanDesc: "한자의 한국 한자음 표시 (예: 参 → 삼, 참)",
    sSupport: "후원",
    sSupportDesc: "공부에 도움이 되셨다면 커피 한 잔 후원해 주세요 ☕",
  },
};

function rawLocale() {
  let l = "en";
  try {
    // Obsidian's UI language: getLanguage() (1.8+), then the stored setting.
    // moment.locale() is not reliable — it can stay "en" while the UI is Korean.
    l =
      (typeof obsidian.getLanguage === "function" && obsidian.getLanguage()) ||
      window.localStorage.getItem("language") ||
      (obsidian.moment && obsidian.moment.locale()) ||
      "en";
  } catch (e) {
    /* ignore */
  }
  return String(l).toLowerCase();
}
const LOCALE = rawLocale();
const UI_LANG = LOCALE.startsWith("ko") ? "ko" : "en";
const T = STRINGS[UI_LANG];

/** Effective meaning language: setting, or the Obsidian locale when it is fr/es/pt. */
function meaningLangOf(settings) {
  if (settings.meaningLang && settings.meaningLang !== "auto") return settings.meaningLang;
  const base = LOCALE.slice(0, 2);
  return MEANING_LANGS[base] ? base : "en";
}

/** Meanings in the chosen language, falling back to English. */
function meaningsOf(info, lang) {
  if (lang !== "en" && info["m_" + lang] && info["m_" + lang].length) {
    return { lang, list: info["m_" + lang] };
  }
  return { lang: "en", list: info.m || [] };
}

function showKoreanOf(settings) {
  return settings.showKorean === null || settings.showKorean === undefined
    ? UI_LANG === "ko"
    : settings.showKorean;
}

/* ------------------------------------------------------------------ */
/* Regexes                                                              */
/* ------------------------------------------------------------------ */

const KANJI_CLASS = "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF々〆ヶ";
const KANA_CLASS = "\\u3040-\\u309F\\u30A0-\\u30FFー";
const IS_KANJI = new RegExp(`[${KANJI_CLASS}]`);
const KANJI_CHAR_G = new RegExp(`[${KANJI_CLASS}]`, "g");
// 参加(さんか) / 参加（さんか）
const READING_SRC = `([${KANJI_CLASS}]+)[（(]([${KANA_CLASS}]+)[)）]`;
const readingRe = () => new RegExp(READING_SRC, "g");

/* ------------------------------------------------------------------ */
/* Note dictionary                                                      */
/* ------------------------------------------------------------------ */

function stripFrontmatter(md) {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/** 参加(さんか) → 参加 */
function stripReadings(text) {
  return text.replace(readingRe(), "$1");
}

function cleanCell(text) {
  return text
    .replace(/\*\*|__|`/g, "")
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a)
    .trim();
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map(cleanCell);
}

/**
 * Markdown → { entries: [{word, reading, pos, meaning, source}] }
 * Sources: vocabulary tables, grammar headings, inline 漢字(かな) readings.
 */
function buildNoteDictionary(markdown) {
  const md = stripFrontmatter(markdown);
  const lines = md.split(/\r?\n/);
  const byWord = new Map();

  const upsert = (word, data) => {
    if (!word || !IS_KANJI.test(word)) return;
    const prev = byWord.get(word) || { word };
    for (const k of Object.keys(data)) {
      if (data[k] && !prev[k]) prev[k] = data[k];
    }
    byWord.set(word, prev);
  };

  // 1) Tables: detect reading / part-of-speech / meaning columns by header name
  for (let i = 0; i + 1 < lines.length; i++) {
    const head = lines[i];
    const sep = lines[i + 1];
    if (!/^\s*\|/.test(head) || !/^\s*\|?\s*:?-{2,}/.test(sep)) continue;
    const headers = splitRow(head);
    const find = (re) => headers.findIndex((h) => re.test(h));
    const wordCol = Math.max(0, find(/단어|語|word|표현|kanji|漢字/i));
    const readCol = find(/읽기|読み|reading|발음|yomi/i);
    const posCol = find(/품사|品詞|pos|part of speech/i);
    const meanCol = find(/뜻|의미|意味|meaning|translation/i);
    if (meanCol < 0 && readCol < 0) continue;

    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const cells = splitRow(lines[j]);
      const raw = cells[wordCol] || "";
      const word = stripReadings(raw).replace(/\s+/g, "");
      let reading = readCol >= 0 ? cells[readCol] : "";
      if (!reading) {
        const m = readingRe().exec(raw);
        if (m) reading = m[2];
      }
      upsert(word, {
        reading,
        pos: posCol >= 0 ? cells[posCol] : "",
        meaning: meanCol >= 0 ? stripReadings(cells[meanCol] || "") : "",
        source: "table",
      });
    }
    i = j - 1;
  }

  // 2) Grammar headings:  ## ① 문법: ～を問(と)わず — ~을 따지지 않고
  for (const line of lines) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (!h) continue;
    const parts = h[1].split(/\s+[—–-]{1,2}\s+/);
    if (parts.length < 2) continue;
    const left = parts[0].replace(/^[^:：]*[:：]\s*/, "");
    const word = stripReadings(left).replace(/[～~〜\s]/g, "");
    if (!IS_KANJI.test(word)) continue;
    const kana = left.replace(readingRe(), "$2").replace(/[～~〜\s]/g, "");
    upsert(word, {
      reading: IS_KANJI.test(kana) ? "" : kana,
      meaning: parts.slice(1).join(" — ").trim(),
      pos: "grammar",
      source: "grammar",
    });
  }

  // 3) All inline readings
  const re = readingRe();
  let m;
  while ((m = re.exec(md))) {
    upsert(m[1], { reading: m[2], source: "inline" });
  }

  return { entries: Array.from(byWord.values()) };
}

/** Cut one heading section (until the next heading of same or higher level). */
function sliceSection(markdown, lineStart) {
  const lines = markdown.split(/\r?\n/);
  const h = /^(#{1,6})\s/.exec(lines[lineStart] || "");
  if (!h) return markdown;
  const level = h[1].length;
  let end = lines.length;
  for (let i = lineStart + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i]);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(lineStart, end).join("\n");
}

/* ------------------------------------------------------------------ */
/* DOM: furigana + kanji spans                                          */
/* ------------------------------------------------------------------ */

function appendKanjiText(parent, text) {
  let last = 0;
  KANJI_CHAR_G.lastIndex = 0;
  let m;
  while ((m = KANJI_CHAR_G.exec(text))) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    const span = document.createElement("span");
    span.className = "jpv-kanji";
    span.dataset.k = m[0];
    span.textContent = m[0];
    parent.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

/**
 * Split text into plain segments and 漢字(かな) ruby segments (pure, DOM-free).
 * "参加(さんか)します" → [{type:"ruby", base:"参加", rt:"さんか"}, {type:"text", value:"します"}]
 */
function tokenizeReadings(text) {
  const out = [];
  const re = readingRe();
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({ type: "ruby", base: m[1], rt: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function transformTextNode(node, inRuby) {
  const text = node.nodeValue;
  if (!IS_KANJI.test(text)) return;
  const frag = document.createDocumentFragment();

  const segments = inRuby ? [{ type: "text", value: text }] : tokenizeReadings(text);
  for (const seg of segments) {
    if (seg.type === "text") {
      appendKanjiText(frag, seg.value);
      continue;
    }
    const ruby = document.createElement("ruby");
    ruby.dataset.word = seg.base;
    appendKanjiText(ruby, seg.base);
    const rp1 = document.createElement("rp");
    rp1.textContent = "(";
    const rt = document.createElement("rt");
    rt.textContent = seg.rt;
    const rp2 = document.createElement("rp");
    rp2.textContent = ")";
    ruby.append(rp1, rt, rp2);
    frag.appendChild(ruby);
  }
  node.parentNode.replaceChild(frag, node);
}

function enhanceRendered(root) {
  root.querySelectorAll("table").forEach((t) => {
    if (t.parentElement && t.parentElement.classList.contains("jpv-table-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "jpv-table-wrap";
    t.parentNode.insertBefore(wrap, t);
    wrap.appendChild(t);
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest("code, pre, rt, rp, script, style, .jpv-kanji")) return NodeFilter.FILTER_REJECT;
      return IS_KANJI.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) transformTextNode(n, !!n.parentElement.closest("ruby"));
}

/* ------------------------------------------------------------------ */
/* Viewer modal                                                         */
/* ------------------------------------------------------------------ */

class JpViewerModal extends Modal {
  constructor(plugin, file, markdown, fullMarkdown) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.markdown = markdown;
    this.dict = buildNoteDictionary(fullMarkdown || markdown);
    this.component = new Component();
    this.popup = null;
    this.activeSpan = null;
    this.showTimer = null;
    this.hideTimer = null;
  }

  async onOpen() {
    const { plugin } = this;
    const s = plugin.settings;
    this.modalEl.addClass("jpv-modal");
    this.contentEl.empty();
    this.component.load();

    // --- toolbar ---
    const bar = this.contentEl.createDiv({ cls: "jpv-toolbar" });
    bar.createDiv({ cls: "jpv-title", text: this.file ? this.file.basename : T.viewer });

    const sizeLabel = bar.createEl("label", { text: T.fontSize });
    const slider = sizeLabel.createEl("input", {
      attr: { type: "range", min: String(MIN_SIZE), max: String(MAX_SIZE), step: "2" },
    });
    slider.value = String(s.fontSize);
    const sizeVal = sizeLabel.createSpan({ cls: "jpv-size-value" });

    const lineLabel = bar.createEl("label", { text: T.lineHeight });
    const lineSlider = lineLabel.createEl("input", {
      attr: { type: "range", min: "1.4", max: "3.2", step: "0.1" },
    });
    lineSlider.value = String(s.lineHeight);

    const furiLabel = bar.createEl("label", { text: T.furigana });
    const furiToggle = furiLabel.createEl("input", { attr: { type: "checkbox" } });
    furiToggle.checked = s.showFurigana;

    const closeBtn = bar.createEl("button", { text: T.close });
    closeBtn.addEventListener("click", () => this.close());

    // --- body ---
    const scroll = this.contentEl.createDiv({ cls: "jpv-scroll" });
    const body = scroll.createDiv({ cls: "jpv-body markdown-rendered" });
    this.bodyEl = body;

    const applySize = () => {
      body.style.setProperty("--jpv-size", `${s.fontSize}px`);
      sizeVal.setText(`${s.fontSize}px`);
      slider.value = String(s.fontSize);
    };
    const applyLine = () => body.style.setProperty("--jpv-line", String(s.lineHeight));
    const applyFuri = () => body.toggleClass("jpv-hide-furigana", !s.showFurigana);
    applySize();
    applyLine();
    applyFuri();

    this.setSize = (v) => {
      s.fontSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, v));
      applySize();
      plugin.saveSettingsDebounced();
    };

    slider.addEventListener("input", () => this.setSize(Number(slider.value)));
    lineSlider.addEventListener("input", () => {
      s.lineHeight = Number(lineSlider.value);
      applyLine();
      plugin.saveSettingsDebounced();
    });
    furiToggle.addEventListener("change", () => {
      s.showFurigana = furiToggle.checked;
      applyFuri();
      plugin.saveSettingsDebounced();
    });

    // Keyboard + / -
    this.scope.register([], "=", () => (this.setSize(s.fontSize + 2), false));
    this.scope.register(["Shift"], "=", () => (this.setSize(s.fontSize + 2), false));
    this.scope.register([], "+", () => (this.setSize(s.fontSize + 2), false));
    this.scope.register([], "-", () => (this.setSize(s.fontSize - 2), false));

    // --- render ---
    const sourcePath = this.file ? this.file.path : "";
    const md = stripFrontmatter(this.markdown);
    if (MarkdownRenderer.render) {
      await MarkdownRenderer.render(this.app, md, body, sourcePath, this.component);
    } else {
      await MarkdownRenderer.renderMarkdown(md, body, sourcePath, this.component);
    }
    enhanceRendered(body);

    plugin.loadKanjiData();

    // --- hover / tap ---
    body.addEventListener("mouseover", (e) => {
      const span = e.target.closest && e.target.closest(".jpv-kanji");
      if (!span) return;
      this.cancelHide();
      clearTimeout(this.showTimer);
      this.showTimer = window.setTimeout(() => this.showPopup(span), 120);
    });
    body.addEventListener("mouseout", (e) => {
      const span = e.target.closest && e.target.closest(".jpv-kanji");
      if (!span) return;
      clearTimeout(this.showTimer);
      this.scheduleHide();
    });
    body.addEventListener("click", (e) => {
      const span = e.target.closest && e.target.closest(".jpv-kanji");
      if (span) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        this.showPopup(span);
      } else {
        this.hidePopup();
      }
    });
    scroll.addEventListener("scroll", () => this.hidePopup(), { passive: true });
  }

  /* ---------- popup ---------- */

  ensurePopup() {
    if (this.popup) return this.popup;
    const el = document.body.createDiv({ cls: "jpv-popup jpv-hidden" });
    el.addEventListener("mouseenter", () => this.cancelHide());
    el.addEventListener("mouseleave", () => this.scheduleHide());
    this.popup = el;
    return el;
  }

  cancelHide() {
    clearTimeout(this.hideTimer);
  }

  scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hidePopup(), 250);
  }

  hidePopup() {
    clearTimeout(this.showTimer);
    if (this.popup) this.popup.addClass("jpv-hidden");
    if (this.activeSpan) this.activeSpan.removeClass("jpv-active");
    this.activeSpan = null;
  }

  showPopup(span) {
    const k = span.dataset.k;
    if (!k) return;
    const el = this.ensurePopup();
    this.fillPopup(el, k, span);

    if (this.activeSpan) this.activeSpan.removeClass("jpv-active");
    this.activeSpan = span;
    span.addClass("jpv-active");

    // Position via CSS variables (styles.css reads --jpv-x / --jpv-y)
    const place = (x, y) => {
      el.style.setProperty("--jpv-x", `${x}px`);
      el.style.setProperty("--jpv-y", `${y}px`);
    };
    el.removeClass("jpv-hidden");
    place(0, 0);
    const r = span.getBoundingClientRect();
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const margin = 8;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(margin, Math.min(window.innerWidth - pw - margin, left));
    let top = r.bottom + margin;
    if (top + ph > window.innerHeight - margin) {
      const above = r.top - ph - margin;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - ph - margin);
    }
    place(left, top);
  }

  fillPopup(el, k, span) {
    el.empty();
    const info = this.plugin.kanjiData ? this.plugin.kanjiData[k] : null;
    const s = this.plugin.settings;
    const showMeanings = s.showMeanings;
    const mean = info ? meaningsOf(info, meaningLangOf(s)) : null;
    let headlineShown = false;

    const head = el.createDiv({ cls: "jpv-pop-head" });
    head.createDiv({ cls: "jpv-pop-char", text: k });
    const meta = head.createDiv({ cls: "jpv-pop-meta" });
    if (info && showKoreanOf(s) && info.ko && info.ko.length) {
      meta.createDiv({ cls: "jpv-pop-ko", text: `${info.ko.join(", ")}  (${T.koReading})` });
    } else if (mean && showMeanings && mean.list.length) {
      // Non-Korean users: key meanings as the headline
      meta.createDiv({ cls: "jpv-pop-headline", text: mean.list.slice(0, HEADLINE_MEANINGS).join(", ") });
      headlineShown = true;
    }
    const badges = meta.createDiv({ cls: "jpv-pop-badges" });
    if (info && info.jlpt) badges.createSpan({ cls: "jpv-badge", text: T.jlpt(info.jlpt) });
    if (info && info.g) {
      const g = info.g <= 6 ? T.gradeEdu(info.g) : info.g === 8 ? T.gradeJoyo : T.gradeJinmei;
      badges.createSpan({ cls: "jpv-badge", text: g });
    }
    if (info && info.s) badges.createSpan({ cls: "jpv-badge", text: T.strokes(info.s) });

    if (info) {
      if (info.on && info.on.length) this.row(el, T.on, info.on.join("、"));
      if (info.kun && info.kun.length) this.row(el, T.kun, info.kun.join("、"));
      // Skip the full list when the headline already shows every meaning
      const headlineCoversAll = headlineShown && mean.list.length <= HEADLINE_MEANINGS;
      if (showMeanings && mean.list.length && !headlineCoversAll) {
        this.row(el, `${T.meaning} (${mean.lang.toUpperCase()})`, mean.list.join(", "), "jpv-pop-en");
        if (mean.lang !== "en" && info.m && info.m.length) {
          this.row(el, `${T.meaning} (EN)`, info.m.join(", "), "jpv-pop-en");
        }
      }
    } else {
      el.createDiv({ cls: "jpv-empty", text: T.notInDict });
    }

    // Words from this note that contain the kanji
    const ruby = span.closest("ruby");
    const ctxWord = ruby ? ruby.dataset.word : null;
    let words = this.dict.entries.filter((e) => e.word.includes(k));
    const rank = (e) =>
      (e.word === ctxWord ? 0 : 10) + (e.source === "table" ? 0 : e.source === "grammar" ? 1 : 2);
    words.sort((a, b) => rank(a) - rank(b) || a.word.length - b.word.length);
    words = words.slice(0, 8);

    if (words.length) {
      const sec = el.createDiv({ cls: "jpv-pop-section" });
      sec.createDiv({ cls: "jpv-pop-section-title", text: T.noteWords });
      for (const w of words) {
        const row = sec.createDiv({ cls: "jpv-word" });
        row.createSpan({ cls: "jpv-word-jp", text: w.word });
        if (w.reading) row.createSpan({ cls: "jpv-word-reading", text: w.reading });
        if (w.pos) row.createSpan({ cls: "jpv-word-pos", text: w.pos });
        if (w.meaning) row.createSpan({ cls: "jpv-word-mean", text: w.meaning });
      }
    }
  }

  row(el, label, value, cls) {
    const r = el.createDiv({ cls: "jpv-pop-row" });
    r.createSpan({ cls: "jpv-pop-label", text: label });
    r.createSpan({ cls: cls || "", text: value });
  }

  onClose() {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    if (this.popup) this.popup.remove();
    this.popup = null;
    this.component.unload();
    this.contentEl.empty();
  }
}

/* ------------------------------------------------------------------ */
/* Plugin                                                               */
/* ------------------------------------------------------------------ */

/**
 * Put our header button directly left of the reading/editing (book ↔ pen) toggle.
 * Header actions are laid out as [...plugin actions, mode toggle, more options].
 */
function placeBeforeModeToggle(view, el) {
  const actions = el.parentElement;
  if (!actions) return;
  let mode = view.modeButtonEl;
  if (!mode || mode.parentElement !== actions) {
    const others = Array.from(actions.children).filter((c) => c !== el);
    mode = others.length >= 2 ? others[others.length - 2] : others[others.length - 1];
  }
  if (mode && el.nextElementSibling !== mode) actions.insertBefore(el, mode);
}

class JpViewerPlugin extends Plugin {
  onload() {
    this.kanjiData = null;
    this.kanjiLoading = null;
    this.actionEls = [];
    this.saveTimer = null;
    // Register everything synchronously with defaults, then merge saved settings
    // into the same object (modals/settings tab keep a reference to it).
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    this.settingsReady = Promise.resolve()
      .then(() => this.loadData())
      .then((saved) => Object.assign(this.settings, saved || {}))
      .catch((e) => console.error("[kanji-zoom] loadData failed", e));

    this.addRibbonIcon("zoom-in", T.open, () => this.openActive());

    this.addCommand({
      id: "open-viewer",
      name: T.cmdOpen, // Obsidian already prefixes the plugin name
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) this.openFile(file);
        return true;
      },
    });

    // Button in each note's header action bar
    this.app.workspace.onLayoutReady(() => this.addActions());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.addActions()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.addActions()));

    // Reading view: small button next to h1~h3
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (!this.settings.sectionButtons) return;
      const h = el.querySelector("h1, h2, h3");
      if (!h || h.querySelector(".jpv-section-btn")) return;
      const btn = document.createElement("button");
      btn.className = "jpv-section-btn";
      btn.textContent = "🔍";
      btn.setAttribute("aria-label", T.openSection);
      btn.addEventListener("click", async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const info = ctx.getSectionInfo(el);
        const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!file) return;
        const full = await this.app.vault.cachedRead(file);
        const md = info ? sliceSection(full, info.lineStart) : full;
        new JpViewerModal(this, file, md, full).open();
      });
      h.appendChild(btn);
    });

    this.addSettingTab(new JpViewerSettingTab(this.app, this));
  }

  onunload() {
    for (const el of this.actionEls) el.remove();
    this.actionEls = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view) delete leaf.view.__jpvAction;
    });
  }

  addActions() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      try {
        const view = leaf.view;
        if (!(view instanceof MarkdownView)) return;
        let el = view.__jpvAction;
        if (!el || !el.isConnected) {
          el = view.addAction("zoom-in", T.open, () => {
            if (view.file) this.openFile(view.file);
          });
          el.addClass("jpv-action");
          view.__jpvAction = el;
          this.actionEls.push(el);
        }
        placeBeforeModeToggle(view, el);
      } catch (e) {
        console.error("[kanji-zoom] could not add header button", e);
      }
    });
  }

  openActive() {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      new Notice(T.noNote);
      return;
    }
    this.openFile(file);
  }

  async openFile(file) {
    const md = await this.app.vault.cachedRead(file);
    new JpViewerModal(this, file, md, md).open();
  }

  loadKanjiData() {
    if (this.kanjiData) return Promise.resolve();
    if (EMBEDDED_KANJI) {
      this.kanjiData = EMBEDDED_KANJI;
      return Promise.resolve();
    }
    // Dev fallback: unbuilt source next to a kanji.json file
    if (this.kanjiLoading) return this.kanjiLoading;
    this.kanjiLoading = this.app.vault.adapter
      .read(`${this.manifest.dir}/kanji.json`)
      .then((txt) => {
        this.kanjiData = JSON.parse(txt);
      })
      .catch((err) => console.error("[kanji-zoom] kanji data not found", err));
    return this.kanjiLoading;
  }

  saveSettingsDebounced() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveData(this.settings), 400);
  }
}

class JpViewerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveData(s);
    containerEl.empty();

    new Setting(containerEl)
      .setName(T.sFontSize)
      .setDesc(T.sFontSizeDesc)
      .addSlider((sl) =>
        sl
          .setLimits(MIN_SIZE, MAX_SIZE, 2)
          .setValue(s.fontSize)
          .setDynamicTooltip()
          .onChange((v) => {
            s.fontSize = v;
            save();
          })
      );

    new Setting(containerEl)
      .setName(T.sFurigana)
      .setDesc(T.sFuriganaDesc)
      .addToggle((t) =>
        t.setValue(s.showFurigana).onChange((v) => {
          s.showFurigana = v;
          save();
        })
      );

    new Setting(containerEl)
      .setName(T.sSection)
      .setDesc(T.sSectionDesc)
      .addToggle((t) =>
        t.setValue(s.sectionButtons).onChange((v) => {
          s.sectionButtons = v;
          save();
        })
      );

    new Setting(containerEl)
      .setName(T.sMeanings)
      .setDesc(T.sMeaningsDesc)
      .addToggle((t) =>
        t.setValue(s.showMeanings).onChange((v) => {
          s.showMeanings = v;
          save();
        })
      );

    new Setting(containerEl)
      .setName(T.sMeaningLang)
      .setDesc(T.sMeaningLangDesc)
      .addDropdown((d) => {
        d.addOption("auto", T.auto);
        for (const [code, label] of Object.entries(MEANING_LANGS)) d.addOption(code, label);
        d.setValue(s.meaningLang || "auto").onChange((v) => {
          s.meaningLang = v;
          save();
        });
      });

    new Setting(containerEl)
      .setName(T.sKorean)
      .setDesc(T.sKoreanDesc)
      .addToggle((t) =>
        t.setValue(showKoreanOf(s)).onChange((v) => {
          s.showKorean = v;
          save();
        })
      );

    new Setting(containerEl)
      .setName(T.sSupport)
      .setDesc(T.sSupportDesc)
      .addButton((b) =>
        b
          .setButtonText("☕ Buy Me a Coffee")
          .setCta()
          .onClick(() => window.open(FUNDING_URL))
      );
  }
}

module.exports = JpViewerPlugin;
module.exports.__test = {
  buildNoteDictionary,
  sliceSection,
  stripReadings,
  JpViewerModal,
  tokenizeReadings,
  placeBeforeModeToggle,
  meaningsOf,
  meaningLangOf,
  showKoreanOf,
  STRINGS,
  DEFAULT_SETTINGS,
  EMBEDDED_KANJI,
  UI_LANG,
};
