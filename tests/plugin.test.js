/*
 * Engine-agnostic test suite for the built main.js.
 * Runs under Node (CI) or macOS JavaScriptCore (osascript -l JavaScript).
 * tools/test.py prepends: __SRC__ (built main.js), __SAMPLES__ ({ko, en}).
 * Keep to plain ES2017 and no Node/DOM APIs so both engines can run it.
 */

var __results = { pass: 0, fail: 0, lines: [] };

function out(line) {
  __results.lines.push(line);
}

function test(name, fn) {
  try {
    fn();
    __results.pass++;
    out("  ok   " + name);
  } catch (e) {
    __results.fail++;
    out("  FAIL " + name + "\n       " + (e && e.message ? e.message : String(e)));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function eq(actual, expected, msg) {
  var a = JSON.stringify(actual);
  var b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg ? msg + ": " : "") + "expected " + b + ", got " + a);
}

/* ---------------- minimal fakes ---------------- */

function FakeEl(name) {
  this.name = name;
  this.parentElement = null;
  this.children = [];
  this.classes = [];
}
FakeEl.prototype._detach = function () {
  if (!this.parentElement) return;
  var sib = this.parentElement.children;
  sib.splice(sib.indexOf(this), 1);
  this.parentElement = null;
};
FakeEl.prototype.appendChild = function (c) {
  c._detach();
  c.parentElement = this;
  this.children.push(c);
  return c;
};
FakeEl.prototype.prepend = function (c) {
  c._detach();
  c.parentElement = this;
  this.children.unshift(c);
};
FakeEl.prototype.insertBefore = function (c, ref) {
  c._detach();
  c.parentElement = this;
  var i = this.children.indexOf(ref);
  if (i < 0) this.children.push(c);
  else this.children.splice(i, 0, c);
  return c;
};
FakeEl.prototype.addClass = function (c) {
  this.classes.push(c);
};
FakeEl.prototype.remove = function () {
  this._detach();
};
Object.defineProperty(FakeEl.prototype, "nextElementSibling", {
  get: function () {
    if (!this.parentElement) return null;
    var sib = this.parentElement.children;
    return sib[sib.indexOf(this) + 1] || null;
  },
});
Object.defineProperty(FakeEl.prototype, "isConnected", {
  get: function () {
    return !!this.parentElement;
  },
});

function names(el) {
  return el.children.map(function (c) {
    return c.name;
  });
}

/** A header action bar like Obsidian's: [other plugin, mode toggle, more options] */
function makeView(MarkdownView, withModeRef) {
  var view = new MarkdownView();
  view.file = { path: "note.md", basename: "note" };
  view.actionsEl = new FakeEl("actions");
  view.actionsEl.appendChild(new FakeEl("other"));
  var mode = view.actionsEl.appendChild(new FakeEl("mode"));
  view.actionsEl.appendChild(new FakeEl("more"));
  if (withModeRef) view.modeButtonEl = mode;
  return view;
}

function makeObsidian(opts) {
  var calls = { ribbon: [], commands: [], postProcessors: 0, settingTabs: 0, events: 0 };
  function Base(app) {
    this.app = app;
  }
  class Plugin extends Base {
    loadData() {
      return Promise.resolve(opts.saved || null);
    }
    saveData() {
      return Promise.resolve();
    }
    addRibbonIcon(icon, title) {
      calls.ribbon.push(title);
    }
    addCommand(c) {
      calls.commands.push(c);
    }
    registerEvent() {
      calls.events++;
    }
    registerMarkdownPostProcessor() {
      calls.postProcessors++;
    }
    addSettingTab() {
      calls.settingTabs++;
    }
  }
  class MarkdownView {
    addAction(icon, title) {
      var el = new FakeEl("jpv:" + title);
      this.actionsEl.prepend(el); // Obsidian inserts new actions at the front
      return el;
    }
  }
  var mod = {
    Plugin: Plugin,
    Modal: Base,
    MarkdownView: MarkdownView,
    MarkdownRenderer: {},
    Component: Base,
    PluginSettingTab: Base,
    Setting: Base,
    Notice: Base,
    moment: { locale: function () { return opts.momentLocale || "en"; } },
  };
  if (opts.language !== undefined) mod.getLanguage = function () { return opts.language; };
  return { mod: mod, calls: calls };
}

function load(opts) {
  opts = opts || {};
  var ob = makeObsidian(opts);
  var module = { exports: {} };
  var requireFn = function (name) {
    // Plugins that run on mobile must not pull in Node/Electron modules.
    if (name !== "obsidian") throw new Error("unexpected require('" + name + "')");
    return ob.mod;
  };
  var win = {
    localStorage: {
      getItem: function (k) {
        if (opts.onStorage) opts.onStorage(k);
        return null;
      },
    },
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    open: function () {},
  };
  new Function("module", "exports", "require", "window", __SRC__)(module, module.exports, requireFn, win);
  return { Plugin: module.exports, t: module.exports.__test, ob: ob };
}

/* ---------------- tests ---------------- */

out("Module");
var base = load({ language: "ko" });
var t = base.t;

test("exports a plugin class with test hooks", function () {
  assert(typeof base.Plugin === "function", "module.exports is not a class");
  assert(t && typeof t.buildNoteDictionary === "function", "__test exports missing");
});

test("embedded kanji dictionary is present", function () {
  var K = t.EMBEDDED_KANJI;
  assert(K && typeof K === "object", "EMBEDDED_KANJI not embedded (run tools/build.py)");
  var n = Object.keys(K).length;
  assert(n > 2500, "only " + n + " kanji");
  var e = K["参"];
  assert(e.on.indexOf("サン") >= 0 && e.ko.indexOf("참") >= 0 && e.m.length > 0, "参 entry incomplete");
});

test("ko and en UI strings have the same keys", function () {
  var ko = Object.keys(t.STRINGS.ko).sort();
  var en = Object.keys(t.STRINGS.en).sort();
  eq(ko, en);
});

out("Furigana tokenizer");

test("half-width parens", function () {
  eq(t.tokenizeReadings("参加(さんか)します"), [
    { type: "ruby", base: "参加", rt: "さんか" },
    { type: "text", value: "します" },
  ]);
});

test("full-width parens and okurigana after the reading", function () {
  eq(t.tokenizeReadings("申込（もうしこ）み"), [
    { type: "ruby", base: "申込", rt: "もうしこ" },
    { type: "text", value: "み" },
  ]);
});

test("English text in parens is left alone", function () {
  eq(t.tokenizeReadings("無料(free)"), [{ type: "text", value: "無料(free)" }]);
});

test("several readings in one sentence", function () {
  var segs = t.tokenizeReadings("年齢(ねんれい)を問(と)わず、誰(だれ)でも");
  eq(
    segs.map(function (s) { return s.type === "ruby" ? s.base + "=" + s.rt : s.value; }),
    ["年齢=ねんれい", "を", "問=と", "わず、", "誰=だれ", "でも"]
  );
});

out("Note dictionary");

function find(dict, word) {
  return dict.entries.filter(function (e) { return e.word === word; })[0];
}

test("Korean note: vocabulary table", function () {
  var d = t.buildNoteDictionary(__SAMPLES__.ko);
  var e = find(d, "参加");
  assert(e, "参加 missing");
  eq([e.reading, e.pos, e.meaning, e.source], ["さんか", "명사·동사", "참가(하다)", "table"]);
  assert(find(d, "申込み"), "申込み (okurigana in table cell) missing");
});

test("Korean note: grammar heading", function () {
  var e = find(t.buildNoteDictionary(__SAMPLES__.ko), "を問わず");
  assert(e, "grammar entry missing");
  eq([e.reading, e.source], ["をとわず", "grammar"]);
  assert(e.meaning.indexOf("따지지") >= 0, "meaning: " + e.meaning);
});

test("English note: vocabulary table", function () {
  var e = find(t.buildNoteDictionary(__SAMPLES__.en), "交渉");
  assert(e, "交渉 missing");
  eq([e.reading, e.pos, e.meaning], ["こうしょう", "noun / suru-verb", "negotiation"]);
});

test("English note: grammar heading", function () {
  var e = find(t.buildNoteDictionary(__SAMPLES__.en), "ざるを得ない");
  assert(e, "grammar entry missing");
  eq(e.reading, "ざるをえない");
  assert(e.meaning.indexOf("cannot help but") === 0, "meaning: " + e.meaning);
});

test("frontmatter tags are not parsed as words", function () {
  var d = t.buildNoteDictionary(__SAMPLES__.ko);
  assert(!d.entries.some(function (e) { return /Learning|Resource/.test(e.word); }));
});

test("sliceSection stops at the next heading of the same level", function () {
  var md = "# T\n## A\na\n### A1\nx\n## B\nb";
  eq(t.sliceSection(md, 1), "## A\na\n### A1\nx");
  eq(t.sliceSection(md, 5), "## B\nb");
});

out("Language");

test("Korean Obsidian: Korean UI, Korean reading on, English meanings", function () {
  var k = load({ language: "ko" }).t;
  eq(k.UI_LANG, "ko");
  eq(k.showKoreanOf(k.DEFAULT_SETTINGS), true);
  eq(k.meaningLangOf(k.DEFAULT_SETTINGS), "en");
});

test("English Obsidian: English UI, Korean reading off", function () {
  var e = load({ language: "en" }).t;
  eq(e.UI_LANG, "en");
  eq(e.showKoreanOf(e.DEFAULT_SETTINGS), false);
});

test("getLanguage() wins over a stale moment locale", function () {
  eq(load({ language: "ko", momentLocale: "en" }).t.UI_LANG, "ko");
});

test("falls back to the moment locale when getLanguage() is missing", function () {
  eq(load({ momentLocale: "ko" }).t.UI_LANG, "ko");
});

test("never reads localStorage (community directory flags it)", function () {
  var touched = [];
  load({ language: "ko", onStorage: function (k) { touched.push(k); } });
  load({ momentLocale: "ko", onStorage: function (k) { touched.push(k); } }); // no getLanguage()
  eq(touched, []);
});

test("French Obsidian: French meanings automatically", function () {
  var f = load({ language: "fr" }).t;
  var m = f.meaningsOf(f.EMBEDDED_KANJI["参"], f.meaningLangOf(f.DEFAULT_SETTINGS));
  eq(m.lang, "fr");
  assert(m.list.length > 0);
});

test("missing translation falls back to English", function () {
  var K = t.EMBEDDED_KANJI;
  var k = Object.keys(K).filter(function (c) { return !K[c].m_pt && K[c].m.length; })[0];
  assert(k, "no kanji without Portuguese meaning");
  eq(t.meaningsOf(K[k], "pt").lang, "en");
});

test("explicit Korean-reading setting overrides the default", function () {
  var s = { showKorean: false };
  eq(t.showKoreanOf(s), false);
  var e = load({ language: "en" }).t;
  eq(e.showKoreanOf({ showKorean: true }), true);
});

out("Plugin lifecycle");

function boot(opts, withModeRef) {
  var L = load(opts);
  var view = makeView(L.ob.mod.MarkdownView, withModeRef);
  var app = {
    workspace: {
      onLayoutReady: function (f) { f(); },
      on: function () { return {}; },
      iterateAllLeaves: function (f) { f({ view: view }); f({ view: {} }); },
      getActiveFile: function () { return null; },
    },
    vault: {},
  };
  var plugin = new L.Plugin(app, { id: "kanji-zoom", dir: ".obsidian/plugins/kanji-zoom" });
  plugin.manifest = { dir: ".obsidian/plugins/kanji-zoom" };
  var ret = plugin.onload();
  return { plugin: plugin, view: view, calls: L.ob.calls, ret: ret };
}

test("onload registers ribbon, command, post-processor and settings tab synchronously", function () {
  var b = boot({ language: "ko" });
  eq(b.calls.ribbon.length, 1);
  eq(b.calls.commands.map(function (c) { return c.id; }), ["open-viewer"]);
  assert(!b.calls.commands[0].hotkeys, "plugins must not ship default hotkeys");
  eq(b.calls.postProcessors, 1);
  eq(b.calls.settingTabs, 1);
  assert(b.plugin.settings.fontSize === 32, "defaults not applied");
});

test("header button sits directly left of the reading/edit toggle", function () {
  var b = boot({ language: "ko" });
  eq(names(b.view.actionsEl), ["other", "jpv:한자 확대 보기 (Kanji Zoom)", "mode", "more"]);
});

test("uses modeButtonEl when Obsidian exposes it", function () {
  var b = boot({ language: "en" }, true);
  eq(names(b.view.actionsEl), ["other", "jpv:Open Kanji Zoom", "mode", "more"]);
});

test("adding actions again does not duplicate the button", function () {
  var b = boot({ language: "en" });
  b.plugin.addActions();
  b.plugin.addActions();
  eq(b.view.actionsEl.children.length, 4);
});

test("onunload removes the header button", function () {
  var b = boot({ language: "en" });
  b.plugin.onunload();
  eq(names(b.view.actionsEl), ["other", "mode", "more"]);
});

out("Kanji popup");

/** Obsidian-style element helpers (createDiv/createSpan/empty) that record text. */
function PopEl(cls, text) {
  this.cls = cls || "";
  this.text = text || "";
  this.kids = [];
}
PopEl.prototype._make = function (o) {
  var c = new PopEl(o && o.cls, o && o.text);
  this.kids.push(c);
  return c;
};
PopEl.prototype.createDiv = PopEl.prototype._make;
PopEl.prototype.createSpan = PopEl.prototype._make;
PopEl.prototype.empty = function () {
  this.kids = [];
};
PopEl.prototype.all = function () {
  var acc = [this];
  this.kids.forEach(function (k) { acc = acc.concat(k.all()); });
  return acc;
};
PopEl.prototype.byCls = function (cls) {
  return this.all().filter(function (e) { return e.cls.split(" ").indexOf(cls) >= 0; });
};
PopEl.prototype.texts = function () {
  return this.all().map(function (e) { return e.text; }).filter(Boolean);
};

function popup(language, kanji, sample) {
  var L = load({ language: language });
  var K = L.t.EMBEDDED_KANJI;
  var plugin = { app: {}, kanjiData: K, settings: Object.assign({}, L.t.DEFAULT_SETTINGS) };
  var modal = new L.t.JpViewerModal(plugin, null, sample, sample);
  var el = new PopEl("jpv-popup");
  modal.fillPopup(el, kanji, { closest: function () { return null; } });
  return el;
}

test("English popup: headline meanings, no duplicate meaning row for short lists", function () {
  var el = popup("en", "幅", __SAMPLES__.en);
  eq(el.byCls("jpv-pop-headline").map(function (e) { return e.text; }), ["hanging scroll, width"]);
  eq(el.byCls("jpv-pop-ko").length, 0, "Korean reading shown to English user");
  assert(el.texts().indexOf("Meaning (EN)") < 0, "duplicate Meaning row");
});

test("English popup: full meaning row when there are more than the headline shows", function () {
  var el = popup("en", "参", __SAMPLES__.en);
  assert(el.texts().indexOf("Meaning (EN)") >= 0, "missing Meaning row");
});

test("Korean popup: Korean reading on top and the note's words listed", function () {
  var el = popup("ko", "参", __SAMPLES__.ko);
  assert(el.byCls("jpv-pop-ko")[0].text.indexOf("참") >= 0, "Korean reading missing");
  var words = el.byCls("jpv-word-jp").map(function (e) { return e.text; });
  eq(words[0], "参加", "first note word");
  assert(el.texts().indexOf("참가(하다)") >= 0, "table meaning missing");
});

test("popup for a kanji outside the dictionary says so", function () {
  var el = popup("en", "𠮷", "");
  assert(el.texts().indexOf("Not in the kanji dictionary.") >= 0);
});

out("Wheel zoom");

function wheel(events) {
  var acc = 0, total = 0;
  events.forEach(function (ev) {
    var r = t.wheelZoomStep(acc, ev[0], ev[1] || 0);
    acc = r.acc; total += r.steps;
  });
  return total;
}

test("mouse wheel up one notch zooms in, down zooms out", function () {
  eq(wheel([[-100]]), 2, "wheel up");
  eq(wheel([[100]]), -2, "wheel down");
});

test("small trackpad deltas add up instead of being lost", function () {
  eq(wheel([[-10], [-10], [-10], [-10]]), 0, "40px is under one step");
  eq(wheel([[-10], [-10], [-10], [-10], [-10]]), 1, "50px is one step");
});

test("reversing direction responds immediately", function () {
  eq(wheel([[-40], [60]]), -1, "leftover zoom-in does not cancel the zoom-out");
});

test("line-mode wheel deltas are scaled to pixels", function () {
  eq(wheel([[-3, 1]]), 0 + Math.floor(48 / 50), "3 lines = 48px");
  eq(wheel([[-4, 1]]), 1, "4 lines = 64px");
});

out("RESULT pass=" + __results.pass + " fail=" + __results.fail);
__results.lines.join("\n");
