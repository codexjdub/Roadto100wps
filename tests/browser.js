// Browser tests: load the real app in an iframe and type into it with simulated keys.
// Open tests/browser.html from any web server (or the live site). The app runs with ?test,
// so it reads and writes its own storage key and never touches your history.
(function () {
  const frame = document.getElementById("frame");
  const list = document.getElementById("results");
  const summary = document.getElementById("summary");
  const KEY = "rt100.test";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let win;
  let doc;

  // ------------------------------------------------------------ helpers

  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  async function waitFor(fn, what, timeout = 8000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        const v = fn();
        if (v) return v;
      } catch (e) { /* not ready yet */ }
      await sleep(25);
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  const dayKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Noon, some days ago. Seeded runs sit mid-day so they never cross midnight (or a DST change).
  const noon = (daysAgo = 0) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d.getTime();
  };
  const run = (id, ts, wpm) => ({
    id, ts, mode: "words", seconds: 30, label: "30s · 200 words", wpm, raw: wpm + 2, acc: 96, consistency: 74,
    durationMs: 30000, wordsTyped: 30, chars: { correct: 150, incorrect: 2, extra: 0, missed: 0 },
    typos: { n: 0, fixed: 0, totalMs: 0, avgMs: 0 }, shift: { opp: 0, same: 0 }, hesitations: [], slowWords: [],
  });

  // A few days of realistic history, so every page has something to show.
  function history() {
    const sessions = [];
    for (let k = 0; k < 6; k++) {
      sessions.push({
        id: `seed${k}`, ts: noon(3 - (k >> 1)) + k * 60000, mode: "words", seconds: k ? 30 : 60,
        label: "30s · 200 words", wpm: 64 + k, raw: 66 + k, acc: 96, consistency: 74, durationMs: 30000, wordsTyped: 30,
        chars: { correct: 150, incorrect: 2, extra: 0, missed: 0 }, typos: { n: 2, fixed: 1, totalMs: 900, avgMs: 900 },
        shift: { opp: 2, same: 1 }, hesitations: ["between", "through", "against"], slowWords: ["government"],
        medGapMs: 190, medPerCharMs: 170, bigrams: { th: [1200, 10, 0], br: [3000, 10, 2], ed: [1500, 10, 1] },
        perSecond: { raw: [70, 60, 20, 75, 80, 72, 68, 30, 70, 75], wpm: [70, 65, 50, 56, 61, 63, 64, 60, 61, 62], err: [0, 0, 1, 0, 0, 0, 0, 1, 0, 0] },
      });
    }
    return { version: 1, sessions, settings: {}, lessons: { L1: { done: true } }, routine: null, routineDays: [dayKey(noon(1))] };
  }

  // Load the app fresh, with the given saved data (or none) and settings.
  async function boot(hash, { data = null, settings = {} } = {}) {
    const d = data || { version: 1, sessions: [], settings: {}, lessons: {}, routine: null, routineDays: [] };
    d.settings = Object.assign({}, d.settings, settings);
    localStorage.setItem(KEY, JSON.stringify(d));
    frame.src = `../index.html?test&r=${Math.random().toString(36).slice(2)}${hash}`;
    await new Promise((r) => { frame.onload = r; });
    win = frame.contentWindow;
    doc = win.document;
    await waitFor(() => doc.querySelector("#app").children.length, "the page to render");
  }

  async function go(hash) {
    win.location.hash = hash;
    await waitFor(() => win.location.hash === hash && doc.querySelector("#app").children.length, `page ${hash}`);
    await sleep(50);
  }

  function key(k, extra = {}) {
    doc.dispatchEvent(new win.KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, extra)));
  }

  async function typeText(text, ms = 12, mistake) {
    for (const c of text) {
      if (mistake && mistake()) key("q");
      key(c, /[A-Z"!?(:]/.test(c) ? { shiftKey: true } : {});
      await sleep(ms);
    }
  }

  // The first word that hasn't been typed into yet.
  const nextWord = () => [...doc.querySelectorAll(".words .word")].find((w) => ![...w.children].some((c) => c.className));
  const testRunning = () => doc.querySelector(".test") && !doc.querySelector(".test").closest("[hidden]");

  async function typeWords(n, ms = 12, mistake) {
    for (let k = 0; k < n && testRunning(); k++) {
      const w = nextWord();
      if (!w) break;
      await typeText(w.textContent, ms, mistake);
      key(" ");
      await sleep(ms);
    }
  }

  const pageText = () => doc.querySelector("main").innerText + "\n" + doc.querySelector("footer").innerText;
  function assertClean(where) {
    const bad = pageText().match(/\b(null|undefined|NaN)\b|\[object/);
    assert(!bad, `${where} shows "${bad && bad[0]}"`);
  }

  // ------------------------------------------------------------ tests

  const tests = [];
  const it = (name, fn) => tests.push({ name, fn });

  it("Home shows the plan on a first visit, and Enter starts the 60-second test", async () => {
    await boot("#/home");
    assert(pageText().includes("Measure your starting speed"), "no getting-started plan");
    key("Enter");
    await waitFor(() => win.location.hash === "#/type", "the Practice page");
    await waitFor(() => doc.querySelector(".live-main").textContent === "60", "a 60-second test");
  });

  it("Home shows today's routine once you've got started", async () => {
    await boot("#/home", { data: history() });
    const text = pageText();
    assert(text.includes("Today") && text.includes("Daily routine"), "no Today view");
    assert(/\d+ WPM average/.test(text), "no average");
    assert(text.includes("Next lesson: 2."), "lesson 1 is done, so lesson 2 should be next");
  });

  it("the Home calendar shows practice days, with details for each", async () => {
    // Today's runs and routine (always in this month, whatever the date), plus a run 40 days ago.
    const data = { version: 1, sessions: [run("old", noon(40), 61), run("a", noon() - 3600000, 78), run("b", noon(), 82)],
      settings: {}, lessons: {}, routine: null, routineDays: [dayKey(noon())] };
    await boot("#/home", { data });
    const today = doc.querySelector(".cal-day.is-today");
    assert(today && today.classList.contains("practiced") && today.classList.contains("routine"), "today isn't marked");
    assert(today.querySelector(".cal-marks").textContent.includes("\u2713"), "no check on a routine day");
    assert(today.querySelector(".cal-marks").textContent.includes("\u2605"), "no best day star");
    assert(/lvl-3/.test(today.className), "practice days aren't shaded by speed (80 WPM is band 3)");
    assert(today.querySelector(".cal-wpm").textContent === "80", "no WPM on a practice day");
    assert(/Days practiced\s*1\b/.test(doc.querySelector(".cal-stats").innerText), "no month stats");
    today.click();
    assert(/average 80 WPM/.test(doc.querySelector(".cal-detail").textContent), "clicking a day shows no details");
    assertClean("the calendar");

    // Changing month from the keyboard keeps focus in the calendar, so Enter can't start the routine.
    doc.querySelector('.cal-head [aria-label="Previous month"]').click(); // like Enter on the button
    const focused = doc.activeElement;
    assert(focused && focused.closest(".cal-head"), "focus left the calendar");
    focused.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(50);
    assert(win.location.hash === "#/home", "Enter after changing month opened another page");
  });

  it("no pace cursor appears in the text", async () => {
    const data = history();
    data.routine = { day: dayKey(Date.now()), started: true, step: 1, run: 0, cleanMisses: 0, skipped: [], stopped: null, done: false };
    await boot("#/routine", { data });
    assert(/push run/.test(pageText()) && /Aim for \d+ WPM/.test(pageText()), "the push run doesn't state its target");
    await typeWords(3, 15);
    assert(!doc.querySelector(".ghost"), "a pace cursor is in the text");
    key("Escape");
  });

  it("typing past five lines never removes or moves the text", async () => {
    await boot("#/type", { settings: { mode: "words", seconds: 60 } });
    const first = doc.querySelector(".words .word");
    const top = first.getBoundingClientRect().top;
    const count = doc.querySelectorAll(".words .word").length;
    await typeWords(70, 6);
    assert(first.isConnected, "the first word was removed");
    assert(Math.abs(first.getBoundingClientRect().top - top) < 1, "the first line moved");
    assert(doc.querySelectorAll(".words .word").length >= count, "words disappeared");
    key("Escape");
  });

  it("a finished text shows results with nothing broken on the page", async () => {
    await boot("#/type", { settings: { mode: "custom", customText: "The quick brown fox jumps over the lazy dog, again and again." } });
    await typeWords(20, 15);
    await waitFor(() => doc.querySelector(".results:not([hidden])"), "results");
    const text = pageText();
    assert(/wpm\s*\d+/i.test(text), "no WPM on the results");
    assert(text.includes("100%"), "a clean run should show 100% accuracy");
    assertClean("the results page");
  });

  it("a fixed typo is counted and its cost reported", async () => {
    await boot("#/type", { settings: { mode: "custom", customText: "Practice makes the hands quick and the mind calm today." } });
    let made = false;
    for (let k = 0; k < 20 && testRunning(); k++) {
      const w = nextWord();
      if (!w) break;
      if (k === 2 && !made) { made = true; key("z"); await sleep(120); key("Backspace"); await sleep(80); }
      await typeText(w.textContent, 15);
      key(" ");
      await sleep(15);
    }
    await waitFor(() => doc.querySelector(".results:not([hidden])"), "results");
    assert(/1 typo\. Fixing it took \d+\.\d s/.test(pageText()), "the typo and its cost aren't reported");
  });

  it("the theme button switches in one click and leaves a running test alone", async () => {
    await boot("#/type", { settings: { mode: "words", seconds: 30 } });
    await typeWords(2, 15);
    const typed = doc.querySelectorAll(".words span.ok").length;
    const before = win.getComputedStyle(doc.body).backgroundColor;
    doc.getElementById("theme-btn").click();
    await sleep(50);
    assert(win.getComputedStyle(doc.body).backgroundColor !== before, "one click didn't change the colors");
    assert(win.location.hash === "#/type", "the page changed");
    assert(doc.querySelectorAll(".words span.ok").length === typed, "the test was reset");
    doc.getElementById("theme-btn").click();
    await sleep(50);
    assert(win.getComputedStyle(doc.body).backgroundColor === before, "the second click didn't switch back");
    key("Escape");
  });

  it("Same again on a finished trouble-word drill starts it over", async () => {
    await boot("#/type", { data: history(), settings: { mode: "drill", drill: "words" } });
    for (let n = 0; testRunning() && n < 80; n++) await typeWords(1, 10);
    await waitFor(() => doc.querySelector(".results:not([hidden])"), "the drill's results");
    key("Escape"); // Same again
    await waitFor(() => testRunning(), "the drill again");
    assert(/^0\/\d+ cleared$/.test(doc.querySelector(".live-main").textContent), "the drill didn't start over");
    await typeWords(1, 10);
    assert(testRunning(), "the repeated drill ended after one word");
    key("Escape");
  });

  it("characters typed with AltGr (Ctrl+Alt on Windows) count", async () => {
    await boot("#/type", { settings: { mode: "custom", customText: "Mail me at a@b.co today." } });
    for (const w of ["Mail", "me", "at"]) { await typeText(w, 15); key(" "); await sleep(15); }
    for (const c of "a@b.co") { key(c, c === "@" ? { ctrlKey: true, altKey: true } : {}); await sleep(15); }
    key(" ");
    await typeText("today.", 15);
    await waitFor(() => doc.querySelector(".results:not([hidden])"), "results");
    assert(doc.querySelectorAll(".big-stat .value")[1].textContent === "100%", "the @ typed with AltGr wasn't accepted");
  });

  it("custom text with nothing left to type says so", async () => {
    await boot("#/type", { settings: { mode: "custom", customText: "!!! ... ???", simplified: true } });
    assert(/Nothing is left to type/.test(pageText()), "no explanation");
    assert(!doc.querySelector(".test"), "an empty test is showing");
  });

  it("importing history updates the page and the average in the header", async () => {
    await boot("#/progress");
    const dt = new win.DataTransfer();
    dt.items.add(new win.File([JSON.stringify({ data: history() })], "history.json", { type: "application/json" }));
    const input = doc.querySelector('input[type="file"]');
    input.files = dt.files;
    input.dispatchEvent(new win.Event("change"));
    await waitFor(() => /Imported 6 runs/.test(pageText()), "the import message");
    const chip = doc.getElementById("goal-chip");
    assert(!chip.hidden && /average \d+/.test(chip.textContent), "the header average wasn't updated");
    assert(/Recent runs/.test(pageText()), "the page didn't show the imported runs");
  });

  it("a lesson run you stopped typing in doesn't pass", async () => {
    await boot("#/learn/L3", { data: history() });
    await typeWords(2, 15); // then nothing until the 30 seconds are up
    await waitFor(() => doc.querySelector(".verdict"), "the lesson's verdict", 60000);
    assert(/Not quite yet/.test(pageText()), "an idle run passed the lesson");
    assert(/stopped typing/.test(pageText()), "no reason given");
  });

  it("no page shows null, undefined or NaN", async () => {
    await boot("#/home", { data: history() });
    for (const hash of ["#/home", "#/type", "#/routine", "#/learn", "#/learn/L1", "#/learn/L2", "#/learn/L7", "#/progress", "#/about"]) {
      await go(hash);
      assertClean(hash);
    }
  });

  it("the daily routine runs from start to finish", async () => {
    await boot("#/routine", { data: history() });
    // Short runs, so the whole routine takes about a minute.
    for (const st of win.RT.routine.STEPS) {
      const orig = st.run;
      st.run = (ctx, k) => {
        const m = orig(ctx, k);
        if (m.opts.seconds) m.opts.seconds = 3.2;
        if (m.opts.maxSeconds) m.opts.maxSeconds = 4;
        return m;
      };
    }
    await go("#/home");
    await go("#/routine");
    key("Enter");
    let runs = 0;
    for (let guard = 0; guard < 25; guard++) {
      const head = await waitFor(() => doc.querySelector(".run-head h2") || doc.querySelector(".tiles"), "a run or the summary");
      if (head.classList.contains("tiles")) break;
      while (testRunning()) await typeWords(1, 8);
      await waitFor(() => doc.querySelector(".run-line, .callout"), "the run's result");
      assertClean(`after run ${runs + 1}`);
      runs++;
      key("Tab");
      await sleep(60);
    }
    const text = pageText();
    assert(text.includes("Done for today"), "no summary at the end");
    assert(text.includes("2 days"), "the streak should be 2 days (yesterday and today)");
    assert(runs >= 15, `only ${runs} runs`);
    assertClean("the summary");
  });

  it("two sloppy clean runs stop the routine early", async () => {
    const data = history();
    data.routine = { day: dayKey(Date.now()), started: true, step: 1, run: 1, cleanMisses: 1, skipped: [], stopped: null, done: false };
    await boot("#/routine", { data });
    for (const st of win.RT.routine.STEPS) {
      const orig = st.run;
      st.run = (ctx, k) => { const m = orig(ctx, k); if (m.opts.seconds) m.opts.seconds = 3.2; return m; };
    }
    await go("#/home");
    await go("#/routine");
    let n = 0;
    while (testRunning() && n++ < 60) await typeWords(1, 8, () => Math.random() < 0.4);
    await waitFor(() => doc.querySelector(".run-line"), "the run's result");
    key("Tab");
    await waitFor(() => pageText().includes("Stopped early"), "the early stop");
  });

  it("the footer shows the version, and newer versions are detected", async () => {
    await boot("#/home");
    const v = win.APP_VERSION;
    await waitFor(() => doc.getElementById("version").textContent.includes(`Version ${v}`), "the version in the footer");
    const newer = win.RT.app.isNewer;
    assert(newer("1.10", "1.9") && newer("2", "1.9") && !newer("1.8", "1.8") && !newer("1.7", "1.8"), "version comparison is wrong");
  });

  // ------------------------------------------------------------ runner

  (async () => {
    let failed = 0;
    for (const t of tests) {
      const li = document.createElement("li");
      li.textContent = `${t.name} ... `;
      list.appendChild(li);
      const started = Date.now();
      try {
        await t.fn();
        const ok = document.createElement("span");
        ok.className = "pass";
        ok.textContent = `passed (${((Date.now() - started) / 1000).toFixed(1)} s)`;
        li.appendChild(ok);
      } catch (e) {
        failed++;
        const bad = document.createElement("span");
        bad.className = "fail";
        bad.textContent = "FAILED";
        const why = document.createElement("div");
        why.className = "why";
        why.textContent = e && e.message ? e.message : String(e);
        li.append(bad, why);
      }
    }
    localStorage.removeItem(KEY);
    summary.dataset.status = failed ? "fail" : "pass";
    summary.textContent = failed ? `${failed} of ${tests.length} failed` : `All ${tests.length} passed`;
    document.title = failed ? `FAIL ${failed}/${tests.length}` : `PASS ${tests.length}`;
  })();
})();
