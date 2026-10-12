// Saving, exporting and importing history (js/storage.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, sandbox } = require("./helpers");

const session = (id, ts, extra) => Object.assign({ id, ts, mode: "words", wpm: 60, acc: 97, bigrams: { th: [100, 1, 0] }, perSecond: { raw: [60] } }, extra);

test("settings start with defaults and are saved", () => {
  const ctx = load(["js/storage.js"]);
  const store = ctx.RT.store;
  assert.equal(store.settings().seconds, 30);
  store.set("seconds", 60);
  assert.equal(JSON.parse(ctx.localStorage.getItem("rt100.v1")).settings.seconds, 60);
  const again = load(["js/storage.js"], ctx); // reload from the same storage
  assert.equal(again.RT.store.settings().seconds, 60);
});

test("only the newest 300 sessions keep their per-key detail", () => {
  const store = load(["js/storage.js"]).RT.store;
  for (let i = 0; i < 305; i++) store.addSession(session(`s${i}`, i));
  const all = store.sessions();
  assert.equal(all.length, 305);
  assert.equal(all[0].bigrams, undefined);
  assert.equal(all[4].perSecond, undefined);
  assert.ok(all[5].bigrams && all[304].perSecond);
  assert.equal(all[0].wpm, 60, "the summary stays");
});

test("export and import round-trip, without duplicating sessions", () => {
  const a = load(["js/storage.js"]).RT.store;
  a.addSession(session("x1", 1));
  a.addSession(session("x2", 2));
  a.setLesson("L1", { done: true });
  a.setRoutine({ day: "2026-10-11", done: true });
  const file = a.exportJSON();

  const b = load(["js/storage.js"]).RT.store;
  b.addSession(session("x2", 2));
  assert.equal(b.importJSON(file), 1);
  assert.equal(b.importJSON(file), 0, "importing twice adds nothing");
  assert.deepEqual([...b.sessions().map((s) => s.id)], ["x1", "x2"]);
  assert.equal(b.lesson("L1").done, true);
  assert.deepEqual([...b.routineDays()], ["2026-10-11"]);
  assert.throws(() => b.importJSON('{"hello": 1}'), /doesn't look like/);
});

test("deleting history keeps your settings", () => {
  const store = load(["js/storage.js"]).RT.store;
  store.set("themeMode", "dark");
  store.addSession(session("y", 1));
  store.clear();
  assert.equal(store.sessions().length, 0);
  assert.equal(store.settings().themeMode, "dark");
});

test("test pages keep their own data", () => {
  const ctx = load(["js/storage.js"], sandbox({ location: { search: "?test" } }));
  ctx.RT.store.set("seconds", 15);
  assert.equal(ctx.localStorage.getItem("rt100.v1"), null);
  assert.ok(ctx.localStorage.getItem("rt100.test"));
});
