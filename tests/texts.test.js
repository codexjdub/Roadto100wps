// The text collection and word lists (js/texts.js, js/words.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers");

const ctx = load(["js/words.js", "js/texts.js"]);
const TEXTS = ctx.TEXTS;

test("every text has a unique id, an author, a work and a theme", () => {
  const ids = new Set();
  for (const t of TEXTS) {
    assert.ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.author && t.work && t.themes.length, t.id);
  }
  assert.ok(TEXTS.length >= 100);
});

test("every text can be typed on an English keyboard", () => {
  for (const t of TEXTS) {
    assert.match(t.text, /^[\x20-\x7e]+$/, `${t.id} has a character that isn't on the keyboard`);
    assert.ok(!/ {2}/.test(t.text) && t.text === t.text.trim(), `${t.id} has stray spaces`);
    assert.equal(t.words, t.text.split(" ").length, `${t.id} word count`);
  }
});

test("quotes and brackets are balanced", () => {
  for (const t of TEXTS) {
    assert.equal(t.text.split('"').length % 2, 1, `${t.id} has an unclosed double quote`);
    assert.equal((t.text.match(/\(/g) || []).length, (t.text.match(/\)/g) || []).length, `${t.id} brackets`);
  }
});

test("sources are credited with the right license", () => {
  for (const t of TEXTS) {
    if (t.source === "Wikipedia") {
      assert.equal(t.license, "CC BY-SA 4.0", t.id);
      assert.match(t.url, /^https:\/\/en\.wikipedia\.org\/.+oldid=\d+$/, `${t.id} links to an exact revision`);
    } else {
      assert.equal(t.license, "Public domain", t.id);
      assert.match(t.url, /^https:\/\/www\.gutenberg\.org\/ebooks\/\d+$/, t.id);
      assert.ok(t.year && t.year <= 1930, `${t.id} is public domain by date`);
    }
  }
});

test("there are quotes, paragraphs and long passages", () => {
  const q = TEXTS.filter((t) => t.words <= 40).length;
  const p = TEXTS.filter((t) => t.words > 40 && t.words <= 130).length;
  const l = TEXTS.filter((t) => t.words > 130).length;
  assert.ok(q >= 50 && p >= 40 && l >= 15, `${q} quotes, ${p} paragraphs, ${l} long`);
});

test("word lists are lowercase letters with no duplicates", () => {
  for (const list of [ctx.WORDS_200, ctx.WORDS_LARGE]) {
    assert.equal(new Set(list).size, list.length);
    for (const w of list) assert.match(w, /^[a-z]+$/);
  }
  assert.ok(ctx.WORDS_200.length >= 190 && ctx.WORDS_LARGE.length >= 1000);
});
