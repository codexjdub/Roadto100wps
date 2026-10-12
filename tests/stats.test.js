// Scoring and analysis (js/stats.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, simulate, steadyScript } = require("./helpers");

const ctx = load(["js/words.js", "js/stats.js"]);
const RT = ctx.RT;
const many = (n) => Array.from({ length: n }, (_, i) => ctx.WORDS_200[(i * 7) % ctx.WORDS_200.length]);
// Objects made inside the sandbox have their own Array/Object, so compare plain copies.
const plain = (x) => JSON.parse(JSON.stringify(x));
const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg}: ${actual} not within ${tol} of ${expected}`);

test("a steady typist scores their speed, with full accuracy and no slowdowns", () => {
  for (const wpm of [60, 100]) {
    const words = many(200);
    const rec = simulate(RT, words, steadyScript(words, 60000 / (wpm * 5)), { durationMs: 30000 });
    const r = RT.stats.compute(rec);
    near(r.wpm, wpm, 1.5, `wpm at ${wpm}`);
    near(r.raw, wpm, 1.5, `raw at ${wpm}`);
    assert.equal(r.acc, 100);
    assert.ok(r.consistency > 90, `consistency ${r.consistency}`);
    assert.equal(r.dips.length, 0);
    assert.equal(r.perSecond.raw.length, 30);
  }
});

test("consistency uses Monkeytype's formula", () => {
  assert.equal(RT.stats.kogasa(0), 100);
  // per-second speeds read off a real Monkeytype graph that showed 73%
  const v = [85, 65, 58, 62, 60, 88, 93, 37, 75, 80, 80, 80, 80, 80, 84, 84, 84, 88, 88, 58, 55, 63, 64, 63, 60, 62, 95, 50, 13, 60];
  const m = v.reduce((a, b) => a + b) / v.length;
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length);
  near(RT.stats.kogasa(sd / m), 74.8, 0.2, "consistency");
});

test("a fixed typo lowers accuracy but not the final characters, and its cost is measured", () => {
  const words = ["the", "quick", "brown"];
  const script = [["t", 150], ["h", 150], ["e", 150], [" ", 150],
    ["q", 150], ["x", 150], ["BS", 150], ["u", 150], ["i", 150], ["c", 150], ["k", 150], [" ", 150],
    ["b", 150], ["r", 150], ["o", 150], ["w", 150], ["n", 150]];
  const r = RT.stats.compute(simulate(RT, words, script));
  assert.equal(r.chars.incorrect, 0);
  assert.equal(r.chars.correct, 13);
  near(r.acc, (15 / 16) * 100, 0.01, "accuracy counts the wrong keypress");
  assert.equal(r.typos.n, 1);
  assert.equal(r.typos.fixed, 1);
  assert.equal(r.typos.avgMs, 300, "from the wrong key to the right one at that position");
});

test("an unfixed typo stays wrong and its word doesn't count toward WPM", () => {
  const words = ["cat", "dog"];
  const clean = RT.stats.compute(simulate(RT, words, [["c", 100], ["a", 100], ["t", 100], [" ", 100], ["d", 100], ["o", 100], ["g", 100]]));
  const typo = RT.stats.compute(simulate(RT, words, [["c", 100], ["o", 100], ["t", 100], [" ", 100], ["d", 100], ["o", 100], ["g", 100]]));
  assert.equal(typo.chars.incorrect, 1);
  assert.equal(typo.typos.n, 1);
  assert.equal(typo.typos.fixed, 0);
  assert.ok(typo.wpm < clean.wpm);
  assert.equal(typo.raw, clean.raw);
});

test("extra and missed letters are counted", () => {
  const words = ["hat", "pin", "end"];
  const r = RT.stats.compute(simulate(RT, words, [
    ["h", 100], ["a", 100], ["t", 100], ["s", 100], [" ", 100], // one extra
    ["p", 100], [" ", 100], // two missed
    ["e", 100], ["n", 100], ["d", 100]]));
  assert.equal(r.chars.extra, 1);
  assert.equal(r.chars.missed, 2);
});

test("a long pause shows up as a slowdown, blamed on the pause and the word after it", () => {
  const words = many(120);
  const script = steadyScript(words, 160);
  // pause 1.8 s before the first letter of a word roughly 10 seconds in
  let t = 0;
  let idx = script.findIndex(([, dt]) => (t += dt) > 10000);
  while (script[idx - 1][0] !== " ") idx++;
  script[idx] = [script[idx][0], 1800];
  const r = RT.stats.compute(simulate(RT, words, script, { durationMs: 25000 }));
  assert.equal(r.dips.length, 1);
  assert.equal(r.dips[0].cause, "pause");
  assert.ok(r.hesitations.length >= 1);
});

test("a slowdown right after a typo is blamed on the typo", () => {
  const words = many(120);
  const script = steadyScript(words, 160);
  let t = 0;
  let idx = script.findIndex(([, dt]) => (t += dt) > 10000);
  while (script[idx][0] === " " || script[idx + 1][0] === " ") idx++;
  const right = script[idx][0];
  script.splice(idx, 1, ["z", 160], ["BS", 900], [right, 400]);
  const r = RT.stats.compute(simulate(RT, words, script, { durationMs: 25000 }));
  assert.ok(r.dips.length >= 1);
  assert.equal(r.dips[0].cause, "typo");
});

test("letter pairs are timed inside words; capitals are left out", () => {
  const words = ["think", "The"];
  const r = RT.stats.compute(simulate(RT, words, [
    ["t", 100], ["h", 120], ["i", 140], ["n", 160], ["k", 180], [" ", 100], ["T", 100], ["h", 300], ["e", 100]]));
  assert.deepEqual(plain(r.bigrams.th), [120, 1, 0]);
  assert.deepEqual(plain(r.bigrams.nk), [180, 1, 0]);
  assert.equal(r.bigrams.Th, undefined);
  assert.deepEqual(plain(r.bigrams.he), [100, 1, 0]);
});

test("Shift technique: opposite-hand Shift counts as good, same-hand as not", () => {
  const rec = simulate(RT, ["Ab"], [["A", 100], ["b", 100]]);
  rec.events[0].sh = "R";
  rec.events[0].hand = "L";
  assert.deepEqual(plain(RT.stats.compute(rec).shift), { opp: 1, same: 0 });
  rec.events[0].sh = "L";
  assert.deepEqual(plain(RT.stats.compute(rec).shift), { opp: 0, same: 1 });
  assert.equal(RT.stats.handOf("KeyA"), "L");
  assert.equal(RT.stats.handOf("KeyJ"), "R");
  assert.equal(RT.stats.handOf("Digit6"), null);
});

test("findDips groups seconds below 65% of the run's median", () => {
  assert.deepEqual(plain(RT.stats.findDips([70, 70, 70, 20, 30, 70, 70, 70])), [{ s: 3, e: 4, low: 3 }]);
  assert.equal(RT.stats.findDips([70, 70, 70]).length, 0, "too short to judge");
  assert.equal(RT.stats.findDips([0, 0, 0, 0, 0]).length, 0, "nothing typed");
});

test("weak pairs rank the slowest and most error-prone first", () => {
  const sessions = [];
  for (let k = 0; k < 4; k++) sessions.push({ bigrams: { th: [100 * 10, 10, 0], br: [300 * 10, 10, 2], ed: [150 * 10, 10, 0] } });
  const rows = RT.stats.weakPairs(sessions);
  assert.equal(rows[0].bg, "br");
  assert.equal(rows[rows.length - 1].bg, "th");
});

test("trouble words add up pauses and slow words across sessions", () => {
  const rows = RT.stats.troubleWords([
    { hesitations: ["between"], slowWords: ["through"] },
    { hesitations: ["between", "against"], slowWords: [] },
  ]);
  assert.deepEqual(plain(rows[0]), { word: "between", count: 2 });
  assert.equal(rows.length, 3);
});

test("drill words drop punctuation and capitals", () => {
  assert.equal(RT.stats.drillWord("Heaven,"), "heaven");
  assert.equal(RT.stats.drillWord("'tis"), "tis");
  assert.equal(RT.stats.drillWord("don't"), "don't");
});
