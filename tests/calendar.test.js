// Per-day totals behind the Home calendar (js/calendar.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers");

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const ctx = load(["js/calendar.js"]);
ctx.RT.ui = { dayKey }; // normally from app.js
const C = ctx.RT.calendar;
const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();

test("each day adds up its runs; lesson runs are left out", () => {
  const days = C.summarizeDays([
    { ts: at(2026, 9, 5, 9), mode: "words", wpm: 60, acc: 96, durationMs: 30000 },
    { ts: at(2026, 9, 5, 21), mode: "text", wpm: 70, acc: 98, durationMs: 45000 },
    { ts: at(2026, 9, 5, 22), mode: "lesson", wpm: 20, acc: 50, durationMs: 30000 },
    { ts: at(2026, 9, 6), mode: "words", wpm: 72, acc: 97, durationMs: 30000 },
  ], ["2026-10-06", "2026-10-07"]);
  const d5 = days["2026-10-05"];
  assert.equal(d5.runs, 2);
  assert.equal(d5.wpm, 65);
  assert.equal(d5.best, 70);
  assert.equal(d5.acc, 97);
  assert.equal(d5.ms, 75000);
  assert.equal(d5.routine, false);
  assert.equal(days["2026-10-06"].routine, true);
  assert.equal(days["2026-10-07"].runs, 0, "a routine day with no saved runs still shows");
  assert.equal(days["2026-10-07"].routine, true);
});

test("the month summary counts practice days and how the average moved", () => {
  const days = {
    "2026-10-01": { runs: 2, wpm: 64 },
    "2026-10-09": { runs: 1, wpm: 68 },
    "2026-10-12": { runs: 3, wpm: 71 },
    "2026-10-13": { runs: 0, wpm: 0, routine: true },
    "2026-09-30": { runs: 1, wpm: 50 },
  };
  assert.deepEqual(JSON.parse(JSON.stringify(C.monthSummary(days, 2026, 9))), { days: 3, first: 64, last: 71 });
  assert.equal(C.monthSummary(days, 2026, 8).days, 1);
  assert.equal(C.monthSummary(days, 2026, 7).days, 0);
});

test("days are shaded in fixed speed bands, so a shade means the same speed every month", () => {
  assert.equal(C.levelFor(45), 0);
  assert.equal(C.levelFor(59.9), 0);
  assert.equal(C.levelFor(60), 1);
  assert.equal(C.levelFor(71), 2);
  assert.equal(C.levelFor(80), 3);
  assert.equal(C.levelFor(88), 4);
  assert.equal(C.levelFor(92), 5);
  assert.equal(C.levelFor(130), 5);
});
