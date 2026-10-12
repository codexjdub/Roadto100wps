// The daily routine's step logic (js/routine.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers");

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const DAY = 86400000;

function setup() {
  const ctx = load(["js/words.js", "js/texts.js", "js/storage.js", "js/stats.js", "js/drills.js"]);
  ctx.RT.ui = { dayKey }; // normally from app.js, which needs a real page
  ctx.RT.app = { averageWpm: () => 60 };
  load(["js/routine.js"], ctx);
  return ctx.RT;
}
const ids = (RT) => RT.routine.STEPS.map((s) => s.id);

test("a new day starts at the warm-up", () => {
  const RT = setup();
  const s = RT.routine.logic.state();
  assert.equal(s.day, dayKey(Date.now()));
  assert.equal(s.step, 0);
  assert.equal(s.done, false);
});

test("steps that don't apply today are skipped, and the run count leaves them out", () => {
  const RT = setup(); // no history: no trouble words, weekly check due
  const L = RT.routine.logic;
  const ctx = { sessions: RT.store.sessions(), avg: 60 };
  const s = L.state();
  s.started = true;
  for (let k = 0; k < 2 + 10; k++) L.advance(s, ctx); // warm-up, then push and clean
  assert.equal(ids(RT)[s.step], "text", "trouble words skipped");
  assert.deepEqual([...s.skipped], ["trouble"]);
  assert.equal(L.counts(s, ctx).total, 2 + 10 + 3 + 1);
  for (let k = 0; k < 3; k++) L.advance(s, ctx);
  assert.equal(ids(RT)[s.step], "check");
  L.advance(s, ctx);
  assert.equal(s.done, true);
});

test("the weekly check only comes up once a week", () => {
  const RT = setup();
  const check = RT.routine.STEPS.find((s) => s.id === "check");
  assert.equal(check.available({ sessions: [] }), true);
  assert.equal(check.available({ sessions: [{ check: true, ts: Date.now() - 3 * DAY }] }), false);
  assert.equal(check.available({ sessions: [{ check: true, ts: Date.now() - 8 * DAY }] }), true);
});

test("two sloppy clean runs in a row end the day early; a good one in between doesn't", () => {
  const RT = setup();
  const L = RT.routine.logic;
  const ctx = { sessions: [], avg: 60 };
  const s = L.state();
  s.step = 1; // push and clean
  L.recordRun(s, ctx, "clean", 85);
  L.recordRun(s, ctx, "push", 80); // push runs don't count either way
  L.recordRun(s, ctx, "clean", 97);
  L.recordRun(s, ctx, "clean", 88);
  assert.equal(s.done, false);
  L.recordRun(s, ctx, "clean", 89);
  assert.equal(s.done, true);
  assert.equal(s.stopped, "tired");
});

test("the streak counts finished days in a row, up to today or yesterday", () => {
  const RT = setup();
  const now = Date.now();
  const finish = (ts) => RT.store.setRoutine({ day: dayKey(ts), done: true });
  assert.equal(RT.routine.streak(), 0);
  finish(now - 2 * DAY);
  assert.equal(RT.routine.streak(), 0, "a gap breaks it");
  finish(now - DAY);
  assert.equal(RT.routine.streak(), 2, "yesterday still counts before today's is done");
  finish(now);
  assert.equal(RT.routine.streak(), 3);
});
