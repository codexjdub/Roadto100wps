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
  return vm.createContext(ctx);
}

function load(files, ctx = sandbox()) {
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  return ctx;
}

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/**
 * A scripted typist. Follows the same recording rules as js/engine.js and returns the
 * record the engine hands to RT.stats.compute. script: [key, msSincePreviousKey][],
 * where key is a character, " " or "BS" (backspace).
 */
function simulate(RT, words, script, { durationMs } = {}) {
  const typed = words.map(() => "");
  const events = [];
  const wordTimes = [];
  const typos = [];
  const snapshots = [];
  let wi = 0;
  let t = 0;
  let open = null;
  for (const [k, dt] of script) {
    if (durationMs && t + dt > durationMs) break; // a timed test ends at its limit
    t += dt;
    while (t >= (snapshots.length + 1) * 1000) snapshots.push(RT.stats.correctChars(words, typed, wi));
    const word = words[wi];
    if (k === "BS") {
      if (typed[wi]) typed[wi] = typed[wi].slice(0, -1);
      events.push({ t, k: "Backspace", w: wi, bs: 1 });
    } else if (k === " ") {
      events.push({ t, k: " ", w: wi, i: typed[wi].length, ok: typed[wi].length >= word.length, sp: 1 });
      wordTimes[wi].end = t;
      if (open && open.w === wi) { typos.push({ w: wi, i: open.i, t: open.t, ms: null }); open = null; }
      wi++;
    } else {
      const i = typed[wi].length;
      const ok = word[i] === k;
      typed[wi] += k;
      const ev = { t, k, w: wi, i, ok };
      if (word[i] === undefined) ev.x = 1;
      if (k.sh) ev.sh = k.sh;
      events.push(ev);
      if (!wordTimes[wi]) wordTimes[wi] = { start: t, end: null };
      if (!ok && (!open || open.w !== wi)) open = { w: wi, i, t };
      else if (ok && open && open.w === wi && i + 1 >= Math.min(open.i + 1, word.length) && typed[wi] === word.slice(0, i + 1)) {
        typos.push({ w: wi, i: open.i, t: open.t, ms: t - open.t });
        open = null;
      }
    }
  }
  if (open) typos.push({ w: open.w, i: open.i, t: open.t, ms: null });
  return { words, typed, wi: Math.min(wi, words.length - 1), events, wordTimes, typos, snapshots, durationMs: durationMs || t, endedOnSpace: false };
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
