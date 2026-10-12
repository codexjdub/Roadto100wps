// The daily routine: about 20 minutes of practice in a set order, which picks up where you left off that day.
(function () {
  const RT = (window.RT = window.RT || {});

  const PUSH_ABOVE = 15;   // push runs aim this many WPM above your average
  const PUSH_TARGET = 10;  // ...and a push counts as kept up at this much above it
  const CLEAN_TARGET = 98; // clean runs: accuracy to aim for
  const TIRED_BELOW = 90;  // two clean runs in a row under this ends the day early
  const CHECK_EVERY = 7;   // days between 60-second checks

  const today = () => RT.ui.dayKey(Date.now());
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

  function lastCheck(sessions) {
    for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i].check) return sessions[i];
    return null;
  }

  // Targets use your average from before today, so they don't shift halfway through.
  function context() {
    const sessions = RT.store.sessions();
    const before = sessions.filter((s) => s.mode !== "lesson" && RT.ui.dayKey(s.ts) !== today());
    const avg = RT.stats.recentAverage(before) || RT.app.averageWpm() || 60;
    return { sessions, avg };
  }

  const words200 = () => RT.sources.randomWords(window.WORDS_200);

  const STEPS = [
    {
      id: "warmup",
      name: "Warm-up",
      runs: 2,
      about: "Your slowest letter pairs, in real words.",
      run(ctx) {
        const wp = RT.sources.weakPairList(ctx.sessions);
        return {
          opts: { source: RT.sources.pairWords(wp.pairs), seconds: 30 },
          meta: { mode: "pairs", seconds: 30, label: "Routine: warm-up" },
          goal: `Letter pairs: ${wp.pairs.join("  ")}. Aim for smooth, not fast.`,
        };
      },
    },
    {
      id: "pushclean",
      name: "Push and clean",
      runs: 10,
      about: "30-second tests, taking turns: a push run, then a clean run.",
      run(ctx, k) {
        if (k % 2 === 0) {
          const pace = Math.round(ctx.avg + PUSH_ABOVE);
          return {
            kind: "push",
            title: "Push",
            opts: { source: words200(), seconds: 30 },
            meta: { mode: "words", seconds: 30, label: "Routine: push" },
            goal: `Type faster than feels comfortable. Aim for ${pace} WPM; mistakes are fine in this run.`,
          };
        }
        return {
          kind: "clean",
          title: "Clean",
          opts: { source: words200(), seconds: 30 },
          meta: { mode: "words", seconds: 30, label: "Routine: clean" },
          goal: `Aim for ${CLEAN_TARGET}% accuracy, at whatever speed that takes.`,
        };
      },
      verdict(r, ctx, made) {
        if (made.kind === "push") {
          return r.raw >= ctx.avg + PUSH_TARGET
            ? { ok: true, text: `Kept up: ${Math.round(r.raw)} WPM raw.` }
            : { ok: false, text: `${Math.round(r.raw)} WPM raw. Try to stay closer to the cursor next time.` };
        }
        return r.acc >= CLEAN_TARGET
          ? { ok: true, text: `Clean: ${r.acc.toFixed(1)}% accuracy.` }
          : { ok: false, text: `${r.acc.toFixed(1)}% accuracy. Ease off a little on the next clean run.` };
      },
    },
    {
      id: "trouble",
      name: "Trouble words",
      runs: 1,
      about: "Words you hesitate on, until each one is smooth (2 minutes at most). Skipped until you have some.",
      available: (ctx) => RT.stats.troubleWords(ctx.sessions).length >= 3,
      run(ctx) {
        const list = RT.stats.troubleWords(ctx.sessions).slice(0, 12).map((x) => x.word);
        return {
          opts: { source: RT.sources.troubleDrill(list, RT.stats.timingBaseline(ctx.sessions)), seconds: 0, maxSeconds: 120 },
          meta: { mode: "trouble", label: "Routine: trouble words" },
          goal: `Each word comes back until you type it smoothly twice: ${list.join(", ")}`,
        };
      },
    },
    {
      id: "text",
      name: "Real text",
      runs: 3,
      about: "Quotes and paragraphs, capitals and punctuation included.",
      run(ctx, k) {
        const text = RT.sources.chooseText(k === 1 ? "paragraph" : "quote", "all", 15);
        return {
          text,
          opts: { source: RT.sources.textSource(text.text, false), seconds: 0 },
          meta: { mode: "text", textId: text.id, label: "Routine: text" },
          goal: "Type it exactly as written, capitals and punctuation included.",
        };
      },
    },
    {
      id: "check",
      name: "Weekly check",
      runs: 1,
      about: `One 60-second test every ${CHECK_EVERY} days, to see how you're doing over time.`,
      available(ctx) {
        const c = lastCheck(ctx.sessions);
        return !c || daysBetween(RT.ui.dayKey(c.ts), today()) >= CHECK_EVERY;
      },
      run() {
        return {
          opts: { source: words200(), seconds: 60 },
          meta: { mode: "words", seconds: 60, label: "Weekly check", check: true },
          goal: "Type at your normal pace. This is the number to compare from week to week.",
        };
      },
    },
  ];

  // ----------------------------------------------------------------- state

  function state() {
    const s = RT.store.routine();
    if (s && s.day === today()) return s;
    return { day: today(), started: false, step: 0, run: 0, cleanMisses: 0, skipped: [], stopped: null, done: false };
  }

  // Move past steps that don't apply today (no trouble words yet, check not due).
  function skipUnavailable(s, ctx) {
    while (s.step < STEPS.length && STEPS[s.step].available && !STEPS[s.step].available(ctx)) {
      s.skipped.push(STEPS[s.step].id);
      s.step++;
    }
    if (s.step >= STEPS.length) s.done = true;
  }

  function advance(s, ctx) {
    s.run++;
    if (s.run >= STEPS[s.step].runs) {
      s.step++;
      s.run = 0;
      skipUnavailable(s, ctx);
    }
  }

  // After a saved run: two clean runs in a row under TIRED_BELOW end the day, otherwise move on.
  function recordRun(s, ctx, kind, acc) {
    if (kind === "clean") s.cleanMisses = acc < TIRED_BELOW ? s.cleanMisses + 1 : 0;
    if (s.cleanMisses >= 2) {
      s.stopped = "tired";
      s.done = true;
    } else advance(s, ctx);
  }

  function counts(s, ctx) {
    let done = 0;
    let total = 0;
    STEPS.forEach((st, i) => {
      if (s.skipped.includes(st.id)) return;
      if (i < s.step) { done += st.runs; total += st.runs; return; }
      if (i === s.step) { done += s.run; total += st.runs; return; }
      if (!st.available || st.available(ctx)) total += st.runs;
    });
    return { done: s.done ? total : done, total };
  }

  // Days in a row with a finished routine, counting from today (or yesterday, if today isn't done yet).
  function streak() {
    const days = new Set(RT.store.routineDays());
    const d = new Date();
    if (!days.has(RT.ui.dayKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (days.has(RT.ui.dayKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  const streakText = (n) => (n ? `${n}-day streak` : "");

  // ------------------------------------------------------------------ page

  function render(main) {
    const h = RT.ui.h;
    const s = state();
    const ctx = context();
    main.innerHTML = "";
    const n = streak();
    main.append(
      h("h1", {}, "Daily routine"),
      h("p", { class: "ink-2" },
        "About 20 minutes, around 10 of them typing. You can stop at any point and carry on later today.",
        n ? h("strong", {}, ` ${streakText(n)}.`) : null),
    );

    const chips = h("div", { class: "steps", role: "list", "aria-label": "Steps" });
    STEPS.forEach((st, i) => {
      const skipped = s.skipped.includes(st.id) || (i > s.step && st.available && !st.available(ctx));
      const cls = skipped ? "skipped" : s.done || i < s.step ? "done" : s.started && i === s.step ? "on" : "";
      const label = skipped ? `${st.name} (not today)` : st.runs > 1 ? `${st.name} \u00d7${st.runs}` : st.name;
      chips.append(h("span", { class: cls, role: "listitem" }, (cls === "done" ? "\u2713 " : "") + label));
    });
    main.append(chips);
    const panel = h("div");
    main.append(panel);

    if (s.done) summary(panel, s);
    else if (!s.started) intro(panel, s, ctx);
    else runCurrent(panel, s);
  }

  function intro(panel, s, ctx) {
    const h = RT.ui.h;
    const begin = () => {
      s.started = true;
      skipUnavailable(s, ctx);
      RT.store.setRoutine(s);
      render(document.getElementById("app"));
    };
    panel.append(
      h("ol", { class: "routine-plan" }, STEPS.map((st) => h("li", {},
        h("strong", {}, st.name), st.runs > 1 ? ` (${st.runs} runs)` : "", `: ${st.about}`))),
      h("p", { class: "small muted" }, `If your accuracy drops below ${TIRED_BELOW}% on two clean runs in a row, the routine stops early. That usually means you're tired, and practising sloppily doesn't help.`),
      h("button", { class: "btn primary", type: "button", onclick: begin }, "Start ", h("kbd", {}, "enter")),
    );
    RT.app.setActive({ onEnter: begin, onTab: begin });
  }

  function runCurrent(panel, s) {
    const h = RT.ui.h;
    const ctx = context();
    const step = STEPS[s.step];
    const made = step.run(ctx, s.run);
    const c = counts(s, ctx);
    panel.innerHTML = "";

    const skip = () => {
      s.step++;
      s.run = 0;
      skipUnavailable(s, ctx);
      RT.store.setRoutine(s);
      render(document.getElementById("app"));
    };
    panel.append(
      h("div", { class: "routine-progress" },
        h("div", { class: "meter", role: "img", "aria-label": `Run ${c.done + 1} of ${c.total} today` },
          h("div", { style: `width:${Math.round((c.done / Math.max(1, c.total)) * 100)}%` })),
        h("span", { class: "small muted" }, `Run ${c.done + 1} of ${c.total} today`)),
      h("div", { class: "run-head" },
        h("h2", {}, `${step.name}${made.title ? `: ${made.title.toLowerCase()} run` : ""}`),
        step.runs > 1 ? h("span", { class: "muted" }, `${s.run + 1} of ${step.runs}`) : null,
        h("span", { class: "muted", "aria-hidden": "true" }, "\u00b7"),
        h("button", { class: "link-btn", type: "button", onclick: skip }, "Skip this step")),
      h("p", { class: "ink-2" }, made.goal),
    );
    const testEl = h("div");
    const afterEl = h("div");
    panel.append(testEl, afterEl);

    const again = () => runCurrent(panel, s);
    const test = RT.app.startTest(testEl, Object.assign({}, made.opts, {
      onFinish(result) {
        const session = RT.app.saveSession(result, Object.assign({ routine: true }, made.meta));
        testEl.hidden = true;
        // An idle run doesn't count; one that was merely too short to save still does.
        if (!session && RT.app.unsavedReason(result) === "idle") {
          afterEl.append(
            h("div", { class: "callout" }, "This run wasn't saved because you stopped typing for a while. Give it another go."),
            h("button", { class: "btn primary", type: "button", onclick: again }, "Try again ", h("kbd", {}, "tab")),
          );
          RT.app.setActive({ onTab: again, onEnter: again });
          return;
        }
        recordRun(s, ctx, made.kind, result.acc);
        RT.store.setRoutine(s);
        afterRun(afterEl, s, result, step.verdict ? step.verdict(result, ctx, made) : null, made.text);
      },
    }), {
      onTab: again,
      onEsc: () => test.restart(true),
    });
  }

  function afterRun(el, s, r, verdict, text) {
    const h = RT.ui.h;
    const main = document.getElementById("app");
    const biggest = r.dips.slice().sort((a, b) => a.value - b.value)[0];
    const cause = biggest && (biggest.cause === "typo" ? `after a typo in "${biggest.word}"` : biggest.cause === "pause" ? `a pause at "${biggest.word}"` : `on "${biggest.word}"`);
    // (Native append prints null as the word "null", so leave out the lines that don't apply.)
    el.append(...[
      h("p", { class: "run-line" },
        h("strong", {}, `${Math.round(r.wpm)} WPM`), ` \u00b7 ${Math.round(r.acc)}% accuracy`,
        biggest ? ` \u00b7 biggest slowdown at second ${biggest.s + 1}, ${cause}` : " \u00b7 no big slowdowns"),
      verdict && h("p", { class: verdict.ok ? "verdict-ok" : "ink-2" }, (verdict.ok ? "\u2713 " : "") + verdict.text),
      text && RT.app.textCredit(text),
    ].filter(Boolean));
    const next = () => render(main);
    const nextLabel = s.done ? "See today's summary" : `Next: ${STEPS[s.step].name.toLowerCase()}`;
    el.append(h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", onclick: next }, nextLabel, " ", h("kbd", {}, "tab"))));
    const details = h("details", { class: "table-view" }, h("summary", {}, "Full results for this run"));
    const box = h("div", { style: "margin-top:12px" });
    details.append(box);
    el.append(details);
    RT.app.renderResults(box, r, { compact: true });
    RT.app.setActive({ onTab: next, onEnter: next });
  }

  function summary(panel, s) {
    const h = RT.ui.h;
    const day = today();
    const sessions = RT.store.sessions();
    const todays = sessions.filter((x) => x.routine && RT.ui.dayKey(x.ts) === day);
    const before = sessions.filter((x) => x.mode !== "lesson" && RT.ui.dayKey(x.ts) !== day);
    const avgBefore = RT.stats.recentAverage(before);
    const clean = todays.filter((x) => x.label === "Routine: clean");
    const cleanAvg = clean.length ? RT.stats.mean(clean.map((x) => x.wpm)) : null;
    const best = todays.length ? Math.max(...todays.map((x) => x.wpm)) : null;
    const minutes = Math.round(todays.reduce((a, x) => a + x.durationMs, 0) / 60000);
    const n = streak();

    panel.append(h("h2", {}, s.stopped === "tired" ? "Stopped early, and that counts" : "Done for today"));
    if (s.stopped === "tired") {
      panel.append(h("p", { class: "ink-2" }, `Your accuracy was under ${TIRED_BELOW}% on two clean runs in a row, which usually means you're tired. Practice works best fresh, so today counts as done.`));
    }
    const tile = (label, value, sub) => h("div", { class: "tile" }, h("div", { class: "label" }, label), h("div", { class: "value" }, value), sub ? h("div", { class: "sub" }, sub) : null);
    panel.append(h("div", { class: "tiles" },
      tile("Clean runs today", cleanAvg ? `${Math.round(cleanAvg)} WPM` : "-",
        cleanAvg && avgBefore ? `${cleanAvg >= avgBefore ? "+" : ""}${Math.round(cleanAvg - avgBefore)} vs your recent average` : ""),
      tile("Best run today", best ? `${Math.round(best)} WPM` : "-"),
      tile("Typing time", `${minutes} min`, `${todays.length} runs`),
      tile("Streak", n ? `${n} ${n === 1 ? "day" : "days"}` : "-", n ? "Come back tomorrow to keep it going." : ""),
    ));
    const check = todays.find((x) => x.check);
    if (check) {
      const prev = sessions.filter((x) => x.check && x.id !== check.id).pop();
      panel.append(h("p", {},
        h("strong", {}, `Weekly check: ${Math.round(check.wpm)} WPM at ${Math.round(check.acc)}% accuracy.`),
        prev ? ` Last time: ${Math.round(prev.wpm)} WPM (${new Date(prev.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}).` : " This is your first one, so it's the number to beat next week."));
    }
    panel.append(h("div", { class: "row" },
      h("a", { class: "btn", href: "#/type" }, "Keep practising"),
      h("a", { class: "btn", href: "#/progress" }, "See your progress"),
    ));
    RT.app.setActive(null);
  }

  // Today's progress, for the Home page.
  function status() {
    const s = state();
    const c = counts(s, context());
    return { started: s.started, done: s.done, doneRuns: c.done, total: c.total, streak: streak() };
  }

  RT.routine = { STEPS, render, status, streak, lastCheck, logic: { state, skipUnavailable, advance, recordRun, counts } };
})();
