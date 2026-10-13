// Shared helpers for the Node tests (run with: node --test tests/).
// The app's scripts are written for the browser, so they're loaded into a sandbox
// with just enough of a browser (window, localStorage, document) for their logic.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

function sandbox(extra = {}) {
  const data = new Map();
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, performance,
    localStorage: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => { data.set(k, String(v)); },
      removeItem: (k) => { data.delete(k); },
    },
    document: { dispatchEvent() {}, addEventListener() {} },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    ...extra,
  };
  ctx.window = ctx;
  // window events: scripts can listen, and tests can fire them with ctx.fire(type, event)
  const listeners = {};
  ctx.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  ctx.removeEventListener = (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); };
  ctx.fire = (type, event) => (listeners[type] || []).forEach((fn) => fn(event));
  return vm.createContext(ctx);
}

function load(files, ctx = sandbox()) {
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  return ctx;
}

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/**
 * A scripted typist. Drives the engine's own recording code (RT.recorder in js/engine.js,
 * so load that file) and returns the record the engine hands to RT.stats.compute.
 * script: [key, msSincePreviousKey][], where key is a character, " " or "BS" (backspace).
 */
function simulate(RT, words, script, { durationMs } = {}) {
  const R = RT.recorder;
  if (!R) throw new Error("simulate needs js/engine.js loaded");
  const s = R.create(words);
  let t = 0;
  for (const [k, dt] of script) {
    if (durationMs && t + dt > durationMs) break; // a timed test ends at its limit
    t += dt;
    while (t >= (s.snapshots.length + 1) * 1000) s.snapshots.push(RT.stats.correctChars(words, s.typed, s.wi));
    if (k === "BS") R.backspace(s, t, false);
    else if (k === " ") { if (R.space(s, t) && s.wi < words.length - 1) s.wi++; }
    else R.char(s, k, t, null);
  }
  return R.recordOf(s, durationMs || t, false);
}

// Every word typed correctly at a steady pace (msPerKey between all keys, spaces included).
function steadyScript(words, msPerKey) {
  const script = [];
  words.forEach((w, j) => {
    for (const c of w) script.push([c, msPerKey]);
    if (j < words.length - 1) script.push([" ", msPerKey]);
  });
  return script;
}

module.exports = { ROOT, sandbox, load, read, simulate, steadyScript };
