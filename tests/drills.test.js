// Word and text sources (js/drills.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers");

const ctx = load(["js/words.js", "js/texts.js", "js/stats.js", "js/drills.js"]);
const RT = ctx.RT;
const S = RT.sources;

test("pasted text is turned into keys you can type", () => {
  const curly = "“Hello”—it’s café time… Naïve résumé.";
  assert.equal(S.normalize(curly), "\"Hello\" - it's cafe time... Naive resume.");
  assert.equal(S.normalize("  lots   of\n\nspace  "), "lots of space");
});

test("simplified text is lowercase with no punctuation", () => {
  assert.equal(S.simplify("It is a truth, universally acknowledged!"), "it is a truth universally acknowledged");
});

test("random words never repeat the same word twice in a row", () => {
  const src = S.randomWords(["a", "b"]);
  const words = src.initial().concat(src.more(50));
  assert.equal(words.length, 130);
  for (let i = 1; i < words.length; i++) assert.notEqual(words[i], words[i - 1]);
});

test("texts are chosen by length, theme and minimum words, without quick repeats", () => {
  const seen = new Set();
  for (let k = 0; k < 10; k++) {
    const t = S.chooseText("quote", "all", 15);
    assert.ok(t.words >= 15 && t.words <= 40, `${t.id} has ${t.words} words`);
    assert.ok(!seen.has(t.id), `${t.id} came back within 10 picks`);
    seen.add(t.id);
  }
  const strategy = S.chooseText("paragraph", "strategy");
  assert.ok(strategy.themes.includes("strategy"));
  assert.ok(S.KINDS.paragraph(strategy));
  assert.ok(S.KINDS.long(S.chooseText("long", "all")));
});

test("weak-pair drills use your pairs once there's history, common tricky pairs before", () => {
  assert.equal(S.weakPairList([]).fromHistory, false);
  const words = S.pairWords(["br", "ce"]).initial();
  const withPair = words.filter((w) => /br|ce/.test(w)).length;
  assert.ok(withPair / words.length > 0.55, `${withPair} of ${words.length} words have a weak pair`);
  const text = S.pairText(["th"]);
  assert.ok(text.words <= 130);
});

test("a trouble word is cleared after two smooth runs, and a slow one resets it", () => {
  const drill = S.troubleDrill(["between", "through", "against"], { gapMs: 200, perCharMs: 170 });
  const smooth = (word) => drill.onWord({ word, correct: true, gapMs: 150, perCharMs: 150 });
  const slow = (word) => drill.onWord({ word, correct: true, gapMs: 900, perCharMs: 150 });
  smooth("between");
  slow("between");
  smooth("between");
  assert.ok(drill.remaining().includes("between"), "the slow run reset its count");
  smooth("between");
  assert.ok(!drill.remaining().includes("between"));
  for (const w of ["through", "against"]) { smooth(w); smooth(w); }
  assert.equal(drill.done(), true);
  assert.equal(drill.status(), "3/3 cleared");
  assert.deepEqual(drill.more(5).length, 0, "nothing left to drill");
});

test("the Shift lesson picks a text with plenty of capitals", () => {
  const t = S.capitalText();
  assert.ok((t.text.match(/[A-Z]/g) || []).length >= 3);
});
