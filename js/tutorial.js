// The tutorial: seven short lessons, each with an explanation, an exercise and a target to pass.
(function () {
  const RT = (window.RT = window.RT || {});
  const pct = (x) => `${Math.round(x)}%`;
  const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

  function recent(sessions, n = 10) {
    return sessions.slice(-n);
  }

  const LESSONS = [
    {
      id: "L1",
      title: "Read ahead",
      sub: "Stop pausing between words.",
      why: "Pauses between words are one of the biggest things holding typists back in the 60s and 70s. They happen when you only read a word once you reach it. Fast typists read one or two words ahead, so the next word is ready by the time their fingers get there.",
      how: [
        "Keep your eyes on the word after the one you're typing.",
        "In this exercise, each word disappears as soon as you start typing it, so you need to have read it already.",
        "Keep a steady pace. Let your eyes lead and your fingers follow.",
      ],
      stat(sessions) {
        const r = recent(sessions).filter((s) => s.wordsTyped);
        if (r.length < 3) return null;
        const words = r.reduce((a, s) => a + s.wordsTyped, 0);
        const paused = r.reduce((a, s) => a + (s.hesitations || []).length, 0);
        return `In your last ${r.length} runs you paused noticeably before about ${pct((paused / words) * 100)} of words.`;
      },
      steps: [{
        name: "Hidden words",
        make: () => ({ source: RT.sources.randomWords(window.WORDS_200), seconds: 30, hideActive: true }),
        goal: (c) => `Accuracy of 95% or more, at ${Math.round(c.avg * 0.9)} WPM or faster (90% of your average).`,
        check: (r, c) => r.acc >= 95 && r.wpm >= c.avg * 0.9,
      }],
    },
    {
      id: "L2",
      title: "No stalls",
      sub: "Slow down through hard words instead of stopping.",
      why: "Your speed is an average, and stalls pull it down far more than bursts push it up. Your fast seconds are usually fast already. The time goes in the few seconds where you stop: a word you didn't read in time, a typo you go back for, an awkward letter pair. Fast typists aren't perfectly even (letter pairs typed with alternating hands come out quicker, and that's fine), but they rarely stop.",
      how: [
        "Ease off by about 10%, so you always have something in reserve for the hard words.",
        "When a hard word comes up, slow down through it instead of stopping in front of it.",
        "Keep your eyes a word ahead (lesson 1), so nothing catches you by surprise.",
        "The results graph numbers each slowdown and shows what caused it.",
      ],
      stat(sessions) {
        const r = recent(sessions).filter((s) => s.perSecond && s.perSecond.raw.length >= 10);
        if (r.length < 3) return null;
        const per30 = RT.stats.mean(r.map((s) => (RT.stats.findDips(s.perSecond.raw).length * 30) / s.perSecond.raw.length));
        return `Over your last ${r.length} runs you had about ${per30.toFixed(1)} slowdowns per 30 seconds. The target here is one or none.`;
      },
      steps: [{
        name: "Smooth run",
        make: () => ({ source: RT.sources.randomWords(window.WORDS_200), seconds: 30 }),
        goal: (c) => `At most one slowdown, at ${Math.round(c.avg * 0.85)} WPM or faster.`,
        check: (r, c) => r.dips.length <= 1 && r.wpm >= c.avg * 0.85,
      }],
    },
    {
      id: "L3",
      title: "Typo recovery",
      sub: "Make each mistake cheap.",
      why: "A typo costs more than one key. You usually type a few more letters before you notice, then delete all of them, then have to find your rhythm again. The fix is to notice sooner and correct without stopping.",
      how: [
        "Keep half an eye on the letters you've just typed. The sooner you notice a mistake, the less you have to delete.",
        "Fix it with one quick backspace and carry straight on. Don't stop to check.",
        "If the mistake is several letters back, delete the whole word with Option+Backspace (Ctrl+Backspace on Windows) and retype it. That's quicker than tapping Backspace five times.",
      ],
      stat(sessions) {
        const r = recent(sessions).filter((s) => s.typos && s.typos.fixed);
        if (r.length < 3) return null;
        const avg = RT.stats.mean(r.map((s) => s.typos.avgMs));
        return `In your last ${r.length} runs, each typo took about ${secs(avg)} to fix. The target here is 0.8 s or less.`;
      },
      steps: [{
        name: "Quick fixes",
        make: () => ({ source: RT.sources.randomWords(window.WORDS_200), seconds: 30 }),
        goal: () => "Typos fixed in 0.8 s or less on average (or no typos), with accuracy of 96% or more.",
        check: (r) => r.acc >= 96 && (r.typos.fixed === 0 || r.typos.avgMs <= 800),
      }],
    },
    {
      id: "L4",
      title: "Common words in one motion",
      sub: "The words you type most should be your fastest.",
      why: "About 100 words make up half of everything you type. If \"the\", \"and\" and \"that\" still come out letter by letter, every sentence pays for it. Well-practiced words become one movement, like signing your name.",
      how: [
        "This exercise uses the 100 most common words, plus words ending in -ing, -tion, -ed and -ly.",
        "Think of the whole word, not its letters, and let your fingers roll through it.",
        "These words should come out faster than your average. Aim for 10 WPM above it.",
      ],
      stat: (sessions) => {
        const avg = RT.stats.recentAverage(sessions);
        return avg ? `Your recent average is ${Math.round(avg)} WPM, so the target here is ${Math.round(avg + 10)}.` : null;
      },
      steps: [{
        name: "Common words",
        make: () => ({ source: RT.sources.commonWords(), seconds: 30 }),
        goal: (c) => `${Math.round(c.avg + 10)} WPM or faster, with accuracy of 96% or more.`,
        check: (r, c) => r.wpm >= c.avg + 10 && r.acc >= 96,
      }],
    },
    {
      id: "L5",
      title: "Shift and punctuation",
      sub: "Capitals and commas without breaking stride.",
      why: "Capitals, commas and full stops slow most typists down more than letters do. The usual cause is pressing Shift with the same hand as the letter, which twists that hand and breaks the rhythm.",
      how: [
        "For a capital typed with your left hand (A, S, T, W and so on), hold the right Shift with your right little finger. For one typed with your right hand (J, L, M, I and so on), use the left Shift.",
        "Press Shift just before the letter and let go straight after.",
        "Treat a comma or full stop as part of the word before it, then type the space.",
        "This exercise checks which Shift key you press for each capital.",
      ],
      stat(sessions) {
        const r = recent(sessions, 20).filter((s) => s.shift && s.shift.opp + s.shift.same > 0);
        const opp = r.reduce((a, s) => a + s.shift.opp, 0);
        const total = r.reduce((a, s) => a + s.shift.opp + s.shift.same, 0);
        return total >= 5 ? `Recently, ${opp} of your ${total} capitals were typed with the opposite Shift (${pct((opp / total) * 100)}).` : null;
      },
      steps: [{
        name: "Capitals",
        make: () => {
          const t = RT.sources.capitalText();
          return { source: RT.sources.textSource(t.text, false), seconds: 0, text: t };
        },
        goal: () => "At least 90% of capitals typed with the opposite Shift, with accuracy of 95% or more.",
        check: (r) => {
          const total = r.shift.opp + r.shift.same;
          return r.acc >= 95 && total > 0 && r.shift.opp / total >= 0.9;
        },
        explain: (r) => (r.shift.opp + r.shift.same === 0
          ? "No Shift presses were picked up, so this can't be checked. Type the capitals with the Shift keys rather than Caps Lock."
          : null),
      }],
    },
    {
      id: "L6",
      title: "Push and clean",
      sub: "The training method for breaking a plateau.",
      why: "Your top speed only rises if you sometimes type faster than feels comfortable, and your accuracy only holds if you sometimes slow down and type cleanly. Alternating between the two is how most people break through a plateau.",
      how: [
        "Run 1, push: type faster than feels comfortable, aiming for about 15 WPM above your average. Mistakes are fine here.",
        "Run 2, clean: type at whatever speed lets you finish with 98% accuracy or more.",
        "In your daily practice, keep alternating: one push run, then one clean run. The daily routine does this for you.",
      ],
      stat: (sessions) => {
        const avg = RT.stats.recentAverage(sessions);
        return avg ? `Your recent average is ${Math.round(avg)} WPM, so aim for ${Math.round(avg + 15)} on the push run.` : null;
      },
      steps: [
        {
          name: "Push",
          make: () => ({ source: RT.sources.randomWords(window.WORDS_200), seconds: 30 }),
          goal: (c) => `Raw speed of ${Math.round(c.avg + 10)} WPM or faster. Accuracy doesn't matter in this run.`,
          check: (r, c) => r.raw >= c.avg + 10,
        },
        {
          name: "Clean",
          make: () => ({ source: RT.sources.randomWords(window.WORDS_200), seconds: 30 }),
          goal: () => "Accuracy of 98% or more, at any speed.",
          check: (r) => r.acc >= 98,
        },
      ],
    },
    {
      id: "L7",
      title: "Relaxed hands",
      sub: "Tension is a hidden speed limit.",
      why: "Tight hands and forearms slow down every movement and tire quickly, and pressing keys harder doesn't make them register any faster. Practice also works best in short, regular sessions, because your skill settles in between them.",
      how: [],
      checklist: [
        "Sit so your forearms are roughly level with the keyboard and your wrists float instead of resting on the desk.",
        "Press each key just hard enough to register it. Don't hammer each one down to the bottom.",
        "Let your thumbs rest lightly on the space bar.",
        "Drop your shoulders, and check them again halfway through a test.",
        "Keep sessions short: about 20 minutes a day beats a long session once a week.",
        "Take a short break every 15 to 20 minutes, and stop if anything aches.",
      ],
      steps: [],
    },
  ];

  // Why a run can't pass, when it was one you stopped typing in or too short to measure.
  const NOT_COUNTED = {
    idle: "This run doesn't count because you stopped typing for a while.",
    short: "This run was too short to count.",
  };

  function context() {
    const sessions = RT.store.sessions();
    const avg = RT.stats.recentAverage(sessions.filter((s) => s.mode !== "lesson")) || RT.stats.recentAverage(sessions) || 60;
    return { sessions, avg };
  }

  // ----------------------------------------------------------- lesson list

  function renderList(main) {
    const h = RT.ui.h;
    main.innerHTML = "";
    main.append(
      h("h1", {}, "Lessons"),
      h("p", { class: "ink-2" }, "Seven short lessons. Each one explains a technique, then gives you an exercise and a target to pass. Lessons 1 to 3 cover the most common reasons people get stuck in the 60s and 70s."),
    );
    const list = h("div", { class: "lessons" });
    LESSONS.forEach((l, idx) => {
      const done = RT.store.lesson(l.id).done;
      list.append(h("a", { class: "lesson-card" + (done ? " done" : ""), href: `#/learn/${l.id}` },
        h("span", { class: "lesson-num", "aria-hidden": "true" }, done ? "\u2713" : String(idx + 1)),
        h("span", {}, h("strong", {}, l.title), h("div", { class: "lesson-sub" }, l.sub)),
        h("span", { class: "lesson-status" + (done ? " done" : "") }, done ? "Passed" : "Not done yet"),
      ));
    });
    main.append(list);
  }

  // ------------------------------------------------------------ one lesson

  function renderLesson(main, id) {
    const h = RT.ui.h;
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) { location.hash = "#/learn"; return; }
    const idx = LESSONS.indexOf(lesson);
    const ctx = context();
    main.innerHTML = "";

    const body = h("div", { class: "lesson-body" });
    body.append(
      h("p", { class: "small" }, h("a", { href: "#/learn" }, "\u2190 All lessons")),
      h("h1", {}, `${idx + 1}. ${lesson.title}`),
      h("p", {}, lesson.why),
    );
    const personal = lesson.stat ? lesson.stat(ctx.sessions) : null;
    if (personal) body.append(h("div", { class: "callout" }, personal));
    if (lesson.how.length) {
      body.append(h("h2", {}, "How to do it"), h("ul", {}, lesson.how.map((x) => h("li", {}, x))));
    }
    main.append(body);

    if (lesson.checklist) {
      renderChecklist(main, lesson);
      return;
    }

    let step = 0;
    const stepsEl = h("div", { class: "steps" });
    const goalEl = h("p", { class: "ink-2" });
    const testEl = h("div");
    const afterEl = h("div");
    main.append(h("h2", {}, "Exercise"), stepsEl, goalEl, testEl, afterEl);

    function drawSteps() {
      stepsEl.innerHTML = "";
      if (lesson.steps.length < 2) return;
      lesson.steps.forEach((st, k) => {
        stepsEl.append(h("span", { class: k === step ? "on" : k < step ? "done" : "" }, `${k + 1}. ${st.name}`));
      });
    }

    function startStep() {
      const st = lesson.steps[step];
      const c = context();
      drawSteps();
      goalEl.textContent = "Target: " + st.goal(c);
      afterEl.innerHTML = "";
      testEl.hidden = false;
      const made = st.make(c);
      const test = RT.app.startTest(testEl, Object.assign({}, made, {
        onFinish(result) {
          RT.app.saveSession(result, { mode: "lesson", lesson: lesson.id, label: `Lesson ${idx + 1}: ${st.name}`, textId: made.text && made.text.id });
          const unsaved = RT.app.unsavedReason(result);
          const pass = !unsaved && st.check(result, c);
          const note = unsaved ? NOT_COUNTED[unsaved] : !pass && st.explain ? st.explain(result) : null;
          testEl.hidden = true;
          showVerdict(result, pass, made.text, note);
        },
      }), {
        onTab: startStep,
        onEsc: () => test.restart(true),
      });
    }

    function showVerdict(result, pass, text, note) {
      afterEl.innerHTML = "";
      const last = step === lesson.steps.length - 1;
      const verdict = h("div", { class: "verdict" + (pass ? " pass" : "") },
        h("div", { class: "verdict-title" }, pass ? (last ? "Passed. Nice work." : "Passed. On to the next run.") : "Not quite yet."),
        note ? h("p", { class: "verdict-note" }, note) : null,
        h("div", { class: "ink-2" }, "Target: " + lesson.steps[step].goal(context())),
      );
      afterEl.append(verdict);
      const buttons = h("div", { class: "row" });
      if (pass && !last) {
        buttons.append(h("button", { class: "btn primary", type: "button", onclick: () => { step++; startStep(); } }, "Next run"));
      } else if (pass && last) {
        RT.store.setLesson(lesson.id, { done: true, ts: Date.now() });
        const next = LESSONS[idx + 1];
        if (next) buttons.append(h("a", { class: "btn primary", href: `#/learn/${next.id}` }, `Next lesson: ${next.title}`));
        buttons.append(h("button", { class: "btn", type: "button", onclick: startStep }, "Do it again"));
      }
      if (!pass) buttons.append(h("button", { class: "btn primary", type: "button", onclick: startStep }, "Try again ", h("kbd", {}, "tab")));
      afterEl.append(buttons);
      const res = h("div", { style: "margin-top:16px" });
      afterEl.append(res);
      RT.app.renderResults(res, result, { text, compact: true });
      RT.app.setActive({ onTab: pass && !last ? () => { step++; startStep(); } : startStep });
    }

    startStep();
  }

  function renderChecklist(main, lesson) {
    const h = RT.ui.h;
    const saved = RT.store.lesson(lesson.id).checked || [];
    const list = h("ul", { class: "checklist" });
    const status = h("p", { class: "ink-2" });
    const boxes = lesson.checklist.map((item, k) => {
      const box = h("input", { type: "checkbox", checked: saved.includes(k), onchange: update });
      list.append(h("li", {}, h("label", {}, box, h("span", {}, item))));
      return box;
    });
    function update() {
      const checked = boxes.map((b, k) => (b.checked ? k : -1)).filter((k) => k >= 0);
      const done = checked.length === boxes.length;
      RT.store.setLesson(lesson.id, { checked, done });
      status.textContent = done ? "All checked. Lesson passed." : `${checked.length} of ${boxes.length} checked. Tick each one once you've tried it.`;
    }
    main.append(h("h2", {}, "Checklist"), list, status);
    update();
    RT.app.setActive(null);
  }

  RT.tutorial = { LESSONS, renderList, renderLesson };
})();
