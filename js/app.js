// Pages, settings and results. Ties the engine, drills, charts and storage together.
(function () {
  const RT = window.RT;
  const store = RT.store;
  const S = RT.sources;

  // ------------------------------------------------------------ helpers

  // Builds DOM safely: strings become text nodes, never HTML.
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "checked" || k === "value" || k === "hidden" || k === "disabled") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }
  const dayKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  RT.ui = { h, dayKey };

  const round = (x) => Math.round(x);
  const pct = (x) => `${Math.round(x)}%`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
  const fmtSecs = (ms) => `${(ms / 1000).toFixed(1)} s`;
  const fmtDate = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const coreSessions = () => store.sessions().filter((s) => s.mode !== "lesson");

  function averageWpm() {
    return RT.stats.recentAverage(coreSessions()) || RT.stats.recentAverage(store.sessions());
  }

  function autoPace() {
    const avg = averageWpm();
    return avg ? Math.round(avg + 8) : 70;
  }

  // ------------------------------------------------------- active test & keys

  let active = null; // { test, onTab, onEsc, onEnter }

  function setActive(a) {
    if (active && active.test && (!a || a.test !== active.test)) active.test.destroy();
    active = a;
  }

  function startTest(container, opts, handlers) {
    if (active && active.test) active.test.destroy();
    active = null;
    const test = RT.createTest(container, opts);
    active = Object.assign({ test }, handlers);
    return test;
  }

  document.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    if (!active) return;
    // Keyboard users who have focused a control keep normal Tab/Enter/Space behaviour.
    const onControl = t && t !== document.body && t.id !== "app" && t.closest && t.closest("button, a, summary, [tabindex]");
    if (onControl) return;
    if (e.key === "Tab") {
      if (active.onTab) { e.preventDefault(); active.onTab(); }
      return;
    }
    if (e.key === "Escape") {
      if (active.onEsc) { e.preventDefault(); active.onEsc(); }
      return;
    }
    if (e.key === "Enter" && active.onEnter && (!active.test || active.test.finished)) {
      e.preventDefault();
      active.onEnter();
      return;
    }
    if (active.test && active.test.key(e)) e.preventDefault();
  });

  // A mouse click shouldn't leave focus on a button, or the next space would press it again.
  document.addEventListener("click", (e) => {
    if (e.detail === 0) return; // keyboard activation keeps focus
    const c = e.target.closest && e.target.closest("button, .seg button, a.btn");
    if (c) c.blur();
  });

  // ------------------------------------------------------------- sessions

  // A run where you stopped typing for a while would drag your averages down.
  function wasIdle(r) {
    const secs = r.perSecond.raw;
    return secs.filter((x) => x === 0).length >= Math.max(5, secs.length * 0.3);
  }

  // Why a run won't be saved: "idle" (stopped typing), "short" (too little to measure), or null.
  function unsavedReason(r) {
    if (wasIdle(r)) return "idle";
    if (r.durationMs < 3000 || r.wordsTyped < 3) return "short";
    return null;
  }

  function saveSession(r, meta) {
    if (unsavedReason(r)) return null;
    const one = (x) => Math.round(x * 10) / 10;
    const session = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ts: Date.now(),
      mode: meta.mode,
      label: meta.label,
      seconds: meta.seconds,
      textId: meta.textId,
      lesson: meta.lesson,
      routine: meta.routine || undefined,
      check: meta.check || undefined,
      wpm: one(r.wpm),
      raw: one(r.raw),
      acc: one(r.acc),
      consistency: one(r.consistency),
      durationMs: Math.round(r.durationMs),
      wordsTyped: r.wordsTyped,
      chars: r.chars,
      typos: r.typos,
      shift: r.shift,
      hesitations: r.hesitations.slice(0, 15),
      slowWords: r.slowWords.slice(0, 15),
      medGapMs: r.medGapMs,
      medPerCharMs: r.medPerCharMs,
      bigrams: r.bigrams,
      perSecond: { raw: r.perSecond.raw, wpm: r.perSecond.wpm, err: r.perSecond.err },
    };
    store.addSession(session);
    updateGoalChip();
    return session;
  }

  // -------------------------------------------------------------- results

  function textCredit(text) {
    if (!text) return null;
    const isWiki = text.source === "Wikipedia";
    const who = isWiki ? text.work : `${text.author}, ${text.work}${text.year ? ` (${text.year})` : ""}`;
    return h("p", { class: "source-line" },
      "\u2014 ", who, ". ",
      isWiki
        ? [h("a", { href: text.url, target: "_blank", rel: "noopener" }, "Wikipedia"), ", ", h("a", { href: "https://creativecommons.org/licenses/by-sa/4.0/", target: "_blank", rel: "noopener" }, "CC BY-SA 4.0"), ", lightly edited for typing."]
        : ["Public domain, via ", h("a", { href: text.url, target: "_blank", rel: "noopener" }, "Project Gutenberg"), "."],
    );
  }

  function perSecondChart(r) {
    const wrap = h("div", { class: "card" });
    wrap.append(h("h3", {}, "Speed during this run"));
    const chartEl = h("div");
    wrap.append(chartEl);
    const ps = r.perSecond;
    const n = ps.raw.length;
    const dipAt = new Map(r.dips.map((d, k) => [d.s, k + 1]));
    RT.charts.line(chartEl, {
      height: 200,
      ariaLabel: `Words per minute for each second of the run. ${r.dips.length} slowdowns marked.`,
      n,
      xLabel: (i) => `${i + 1}s`,
      // Label whole multiples (5s, 10s, ...) rather than odd seconds.
      xTicks: (want) => {
        const step = [1, 2, 5, 10, 15, 30, 60].find((x) => n / x <= want) || 60;
        const out = step >= 5 ? [0] : [];
        for (let i = step - 1; i < n; i += step) out.push(i);
        return out;
      },
      series: [
        { name: "Speed each second", color: "var(--series-1)", values: ps.raw },
        { name: "Average so far", color: "var(--series-2)", values: ps.wpm },
      ],
      markers: ps.err.map((e, i) => (e > 0 ? { i } : null)).filter(Boolean),
      markerLegend: "Typo",
      badges: r.dips.map((d, k) => ({ i: d.s, y: d.value, text: String(k + 1) })),
      tooltip: (i) => ({
        title: `Second ${i + 1}`,
        rows: [
          { name: "WPM this second", value: String(ps.raw[i]), color: "var(--series-1)" },
          { name: "average so far", value: String(round(ps.wpm[i])), color: "var(--series-2)" },
        ],
        note: [
          ps.word[i] ? `Typing "${ps.word[i]}"` : "",
          ps.err[i] ? plural(ps.err[i], "typo") : "",
          dipAt.has(i) ? `Slowdown ${dipAt.get(i)}` : "",
        ].filter(Boolean).join(" \u00b7 "),
      }),
    });
    wrap.append(RT.charts.tableView(
      [{ label: "Second" }, { label: "WPM", num: true }, { label: "Average", num: true }, { label: "Typos", num: true }, { label: "Word" }],
      ps.raw.map((v, i) => [i + 1, v, round(ps.wpm[i]), ps.err[i], ps.word[i]]),
    ));
    return wrap;
  }

  const drillLink = (kind) => (e) => {
    e.preventDefault();
    store.set("mode", "drill");
    store.set("drill", kind);
    go("#/type");
  };

  function insightCards(r, compact) {
    const cards = [];
    // Slowdowns
    const dipText = (d) => {
      const at = `Second ${d.s + 1}: ${d.value} WPM`;
      if (d.cause === "typo") return `${at}, right after a typo in "${d.word}".`;
      if (d.cause === "pause") return `${at}, a pause at "${d.word}".`;
      return `${at}, on "${d.word}".`;
    };
    cards.push(h("div", { class: "card" },
      h("h3", {}, "Where you slowed down"),
      r.dips.length ? h("ol", {}, r.dips.map((d) => h("li", {}, dipText(d)))) : h("p", { class: "ink-2" }, "No big slowdowns. That was a steady run."),
    ));
    // Typos
    const ty = r.typos;
    const unfixed = ty.n - ty.fixed;
    let typoText = ty.n === 0 ? "No typos." : `${plural(ty.n, "typo")}.`;
    if (ty.fixed === 1) typoText += ` ${ty.n === 1 ? "Fixing it" : "The one you fixed"} took ${fmtSecs(ty.totalMs)}.`;
    else if (ty.fixed > 1) typoText += ` ${ty.fixed === ty.n ? "Fixing them" : `Fixing ${ty.fixed} of them`} took ${fmtSecs(ty.totalMs)}, about ${fmtSecs(ty.avgMs)} each.`;
    if (unfixed) typoText += ` ${unfixed} left unfixed.`;
    cards.push(h("div", { class: "card" },
      h("h3", {}, "Typos"),
      h("p", { class: "ink-2" }, typoText),
      ty.fixed && ty.avgMs > 800 ? h("p", { class: "small muted" }, "Try noticing sooner and fixing with one quick backspace (lesson 3).") : null,
    ));
    if (compact) return cards;
    // Words
    const words = [...new Set([...r.hesitations, ...r.slowWords])].slice(0, 10);
    cards.push(h("div", { class: "card" },
      h("h3", {}, "Words you paused on"),
      words.length
        ? [h("div", {}, words.map((w) => h("span", { class: "pill" }, w))),
          h("p", { class: "small", style: "margin:8px 0 0" }, h("a", { href: "#/type", onclick: drillLink("words") }, "Practise your trouble words"))]
        : h("p", { class: "ink-2" }, "Nothing stood out."),
    ));
    // Letter pairs
    const pairs = Object.entries(r.bigrams)
      .filter(([, v]) => v[1] >= 2)
      .map(([bg, v]) => ({ bg, ms: v[0] / v[1] }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5);
    cards.push(h("div", { class: "card" },
      h("h3", {}, "Slowest letter pairs"),
      pairs.length
        ? h("div", {}, pairs.map((p) => h("span", { class: "pill" }, `${p.bg} ${round(p.ms)} ms`)))
        : h("p", { class: "ink-2" }, "Not enough data in this run."),
    ));
    // Shift
    const total = r.shift.opp + r.shift.same;
    if (total >= 3) {
      cards.push(h("div", { class: "card" },
        h("h3", {}, "Capitals"),
        h("p", { class: "ink-2" }, `${r.shift.opp} of ${total} typed with the opposite Shift.`),
        r.shift.same ? h("p", { class: "small muted" }, "Use the Shift key on the other hand from the letter (lesson 5).") : null,
      ));
    }
    return cards;
  }

  function renderResults(el, r, o = {}) {
    el.innerHTML = "";
    const prevAvg = o.prevAvg;
    const big = h("div", { class: "big-stats" },
      h("div", { class: "big-stat" }, h("div", { class: "label" }, "wpm"), h("div", { class: "value" }, String(round(r.wpm)))),
      h("div", { class: "big-stat" }, h("div", { class: "label" }, "acc"), h("div", { class: "value" }, pct(r.acc))),
    );
    const stat = (label, value, title) => h("div", { class: "stat", title }, h("div", { class: "label" }, label), h("div", { class: "value" }, value));
    const c = r.chars;
    const right = h("div", {},
      h("div", { class: "stat-row" },
        stat("raw", String(round(r.raw))),
        stat("consistency", r.consistency ? pct(r.consistency) : "-"),
        stat("characters", `${c.correct}/${c.incorrect}/${c.extra}/${c.missed}`, "correct / incorrect / extra / missed"),
        stat("time", `${round(r.durationMs / 1000)}s`),
        o.label ? stat("test", o.label) : null,
      ),
      prevAvg ? h("p", { class: "ink-2" },
        `Your recent average is ${round(prevAvg)} WPM. `,
        h("span", { class: r.wpm >= prevAvg ? "delta-up" : "delta-down" }, `This run: ${r.wpm >= prevAvg ? "+" : ""}${round(r.wpm - prevAvg)}.`)) : null,
    );
    el.append(h("div", { class: "results-grid" }, big, right));
    const unsaved = unsavedReason(r);
    if (unsaved === "idle") el.append(h("div", { class: "callout" }, "It looks like you stopped typing for a while, so this run wasn't saved to your history."));
    else if (unsaved === "short") el.append(h("div", { class: "callout" }, "Runs shorter than 3 seconds or 3 words aren't saved to your history."));
    if (o.text) el.append(textCredit(o.text));
    if (r.perSecond.raw.length >= 2) el.append(perSecondChart(r));
    el.append(h("div", { class: "insights" }, insightCards(r, o.compact)));
    if (o.onNext) {
      el.append(h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: o.onNext }, "Next test ", h("kbd", {}, "tab")),
        o.onRepeat ? h("button", { class: "btn", type: "button", onclick: o.onRepeat }, "Same again ", h("kbd", {}, "esc")) : null,
      ));
    }
  }

  // ------------------------------------------------------------ Type page

  function renderType(main) {
    main.innerHTML = "";
    const cfgEl = h("div", { class: "config", role: "toolbar", "aria-label": "Test settings" });
    const infoEl = h("p", { class: "small ink-2", style: "text-align:center;margin:-12px 0 16px" });
    const extraEl = h("div");
    const testEl = h("div");
    const resultsEl = h("div", { class: "results", hidden: true });
    main.append(cfgEl, infoEl, extraEl, testEl, resultsEl);
    let last = null; // { opts, meta, text, record }

    function seg(label, key, options) {
      const st = store.settings();
      return h("div", { class: "seg" },
        label ? h("span", { class: "seg-label" }, label) : null,
        options.map(([value, text]) => h("button", {
          type: "button",
          "aria-pressed": String(st[key] === value),
          onclick: () => { store.set(key, value); drawConfig(); newTest(); },
        }, text)),
      );
    }

    function drawConfig() {
      const st = store.settings();
      cfgEl.innerHTML = "";
      cfgEl.append(seg("text", "mode", [["words", "words"], ["text", "quotes"], ["drill", "drills"], ["custom", "your text"]]));
      cfgEl.append(h("span", { class: "divider", "aria-hidden": "true" }));
      if (st.mode === "words") {
        cfgEl.append(seg("length", "seconds", [[15, "15s"], [30, "30s"], [60, "60s"]]));
        cfgEl.append(seg("list", "wordList", [["200", "200 common"], ["large", "1.4k words"]]));
      } else if (st.mode === "text") {
        cfgEl.append(seg("length", "textLength", [["quote", "quote"], ["paragraph", "paragraph"], ["long", "long"]]));
        const sel = h("select", { "aria-label": "Theme", onchange: (e) => { store.set("textTheme", e.target.value); e.target.blur(); newTest(); } },
          h("option", { value: "all" }, "all themes"),
          S.themes().map((t) => h("option", { value: t }, t)));
        sel.value = st.textTheme;
        cfgEl.append(h("div", { class: "seg" }, h("span", { class: "seg-label" }, "theme"), sel));
      } else if (st.mode === "drill") {
        cfgEl.append(seg("drill", "drill", [["pairs", "weak pairs"], ["words", "trouble words"]]));
        if (st.drill === "pairs") cfgEl.append(seg("as", "drillAs", [["words", "words"], ["sentences", "sentences"]]));
      }
      if (st.mode === "text" || st.mode === "custom") {
        cfgEl.append(h("div", { class: "seg" }, h("button", {
          type: "button",
          "aria-pressed": String(st.simplified),
          title: "Lowercase, no punctuation",
          onclick: () => { store.set("simplified", !st.simplified); drawConfig(); newTest(); },
        }, "simplified")));
      }
      cfgEl.append(h("span", { class: "divider", "aria-hidden": "true" }));
      cfgEl.append(seg("pace cursor", "pace", [["off", "off"], ["auto", `auto (${autoPace()})`], ["fixed", "set"]]));
      if (st.pace === "fixed") {
        cfgEl.append(h("input", {
          type: "number", min: 10, max: 250, value: st.paceWpm, "aria-label": "Pace in WPM",
          onchange: (e) => { const v = Math.max(10, Math.min(250, Number(e.target.value) || 80)); store.set("paceWpm", v); e.target.blur(); newTest(); },
        }));
      }
    }

    function showEmpty(title, text, action) {
      testEl.hidden = true;
      extraEl.append(h("div", { class: "card empty" }, h("h2", {}, title), h("p", {}, text), action || null));
      setActive(null);
    }

    function newTest(repeat) {
      const st = store.settings();
      resultsEl.hidden = true;
      testEl.hidden = false;
      infoEl.textContent = "";
      extraEl.innerHTML = "";
      const sessions = store.sessions();
      let opts;
      let meta;
      let text = null;

      if (repeat && last) {
        const words = last.record.words.slice();
        opts = Object.assign({}, last.opts, { source: Object.assign({}, last.opts.source, { initial: () => words }) });
        meta = last.meta;
        text = last.text;
      } else if (st.mode === "words") {
        const list = st.wordList === "large" ? window.WORDS_LARGE : window.WORDS_200;
        opts = { source: S.randomWords(list), seconds: st.seconds };
        meta = { mode: "words", seconds: st.seconds, label: `${st.seconds}s \u00b7 ${st.wordList === "large" ? "1.4k" : "200"} words` };
      } else if (st.mode === "text") {
        text = S.chooseText(st.textLength, st.textTheme);
        opts = { source: S.textSource(text.text, st.simplified), seconds: 0 };
        meta = { mode: "text", textId: text.id, label: cap(st.textLength) };
      } else if (st.mode === "drill" && st.drill === "pairs") {
        const wp = S.weakPairList(sessions);
        infoEl.textContent = wp.fromHistory
          ? `Drilling your slowest letter pairs: ${wp.pairs.join("  ")}`
          : `Drilling common tricky pairs (${wp.pairs.join("  ")}) until there's enough of your own history.`;
        if (st.drillAs === "sentences") {
          text = S.pairText(wp.pairs);
          opts = { source: S.textSource(text.text, false), seconds: 0 };
          meta = { mode: "pairs", textId: text.id, label: "Weak pairs" };
        } else {
          opts = { source: S.pairWords(wp.pairs), seconds: 30 };
          meta = { mode: "pairs", seconds: 30, label: "Weak pairs" };
        }
      } else if (st.mode === "drill") {
        const words = RT.stats.troubleWords(sessions).slice(0, 12).map((x) => x.word);
        if (words.length < 3) {
          showEmpty("No trouble words yet",
            "After a few tests, the words you pause before or type slowly will show up here, and this drill brings each one back until it's smooth.",
            h("button", { class: "btn primary", type: "button", onclick: () => { store.set("mode", "words"); store.set("seconds", 30); drawConfig(); newTest(); } }, "Take a 30-second test"));
          return;
        }
        infoEl.textContent = `Each word comes back until you type it smoothly twice: ${words.join(", ")}`;
        opts = { source: S.troubleDrill(words, RT.stats.timingBaseline(sessions)), seconds: 0, maxSeconds: 120 };
        meta = { mode: "trouble", label: "Trouble words" };
      } else {
        const area = h("textarea", { class: "custom", placeholder: "Paste or type any text you'd like to practise, such as an email you write often.", "aria-label": "Your text" });
        area.value = st.customText;
        extraEl.append(area, h("div", { class: "row", style: "margin:8px 0 24px" },
          h("button", { class: "btn primary", type: "button", onclick: () => { store.set("customText", area.value); newTest(); } }, "Practise this text")));
        const clean = S.normalize(st.customText || "");
        if (!clean) {
          testEl.hidden = true;
          setActive(null);
          return;
        }
        opts = { source: S.textSource(clean, st.simplified), seconds: 0 };
        meta = { mode: "custom", label: "Your text" };
      }

      if (!repeat) {
        if (st.pace === "auto") opts.paceWpm = autoPace();
        else if (st.pace === "fixed") opts.paceWpm = st.paceWpm;
      }
      const prevAvg = averageWpm();
      const test = startTest(testEl, opts, {
        onTab: () => newTest(),
        onEsc: () => test.restart(true),
      });
      opts.onFinish = (result, record) => {
        saveSession(result, meta);
        last = { opts, meta, text, record };
        testEl.hidden = true;
        resultsEl.hidden = false;
        renderResults(resultsEl, result, {
          text, label: meta.label, prevAvg,
          onNext: () => newTest(), onRepeat: () => newTest(true),
        });
        setActive({ onTab: () => newTest(), onEsc: () => newTest(true), onEnter: () => newTest() });
        drawConfig(); // the auto pace label may have changed
      };
    }

    drawConfig();
    newTest();
  }

  // -------------------------------------------------------- Progress page

  function renderProgress(main) {
    main.innerHTML = "";
    setActive(null);
    const st = store.settings();
    const all = store.sessions();
    main.append(h("h1", {}, "Progress"));
    if (!all.length) {
      main.append(h("div", { class: "card empty" },
        h("h2", {}, "Nothing here yet"),
        h("p", {}, "Take a test and your speed, accuracy and weak spots will start to show up here."),
        h("a", { class: "btn primary", href: "#/type" }, "Start typing")));
      main.append(dataSection());
      return;
    }

    // Lesson runs (hidden words, targets) aren't normal typing, so they stay out of the averages.
    const filters = {
      all: (s) => s.mode !== "lesson",
      words: (s) => s.mode === "words",
      texts: (s) => s.mode === "text" || s.mode === "custom",
    };
    const days = { 7: 7, 30: 30, all: Infinity };
    const since = st.progressRange === "all" ? 0 : Date.now() - days[st.progressRange] * 86400000;
    const filtered = all.filter(filters[st.progressFilter] || filters.all);
    const inRange = filtered.filter((s) => s.ts >= since);

    const seg = (key, options) => h("div", { class: "seg" }, options.map(([v, t]) => h("button", {
      type: "button",
      "aria-pressed": String(st[key] === v),
      onclick: () => { store.set(key, v); renderProgress(main); },
    }, t)));
    main.append(h("div", { class: "config", style: "justify-content:flex-start;margin:8px 0 16px" },
      seg("progressFilter", [["all", "all tests"], ["words", "word tests"], ["texts", "quotes and texts"]]),
      h("span", { class: "divider", "aria-hidden": "true" }),
      seg("progressRange", [["7", "7 days"], ["30", "30 days"], ["all", "all time"]]),
    ));

    // Tiles
    const last10 = filtered.slice(-10);
    const avg = RT.stats.mean(last10.map((s) => s.wpm));
    const best = Math.max(...inRange.map((s) => s.wpm), 0);
    const practiceMs = inRange.reduce((a, s) => a + (s.durationMs || 0), 0);
    const tile = (label, value, sub, meter) => h("div", { class: "tile" },
      h("div", { class: "label" }, label), h("div", { class: "value" }, value), sub ? h("div", { class: "sub" }, sub) : null,
      meter != null ? h("div", { class: "meter", role: "img", "aria-label": `${round(meter)}% of the way to 100 WPM` }, h("div", { style: `width:${Math.min(100, meter)}%` })) : null);
    main.append(h("div", { class: "tiles" },
      tile("Average, last 10 runs", last10.length ? String(round(avg)) : "-", last10.length ? `${Math.max(0, round(100 - avg))} to go` : "", last10.length ? avg : null),
      tile("Best in range", inRange.length ? String(round(best)) : "-", "WPM"),
      tile("Accuracy, last 10", last10.length ? pct(RT.stats.mean(last10.map((s) => s.acc))) : "-"),
      tile("Consistency, last 10", last10.length ? pct(RT.stats.mean(last10.map((s) => s.consistency))) : "-"),
      tile("Routine streak", (() => { const n = RT.routine.streak(); return n ? `${n} ${n === 1 ? "day" : "days"}` : "-"; })(),
        plural(store.routineDays().length, "day") + " in total"),
      tile("Practice in range", practiceMs && practiceMs < 60000 ? "<1 min" : `${round(practiceMs / 60000)} min`, plural(inRange.length, "run")),
    ));

    // Speed by day
    const byDay = new Map();
    for (const s of inRange) {
      const k = dayKey(s.ts);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(s);
    }
    const dayRows = [...byDay.entries()].map(([k, list]) => ({
      date: new Date(list[0].ts),
      avg: RT.stats.mean(list.map((s) => s.wpm)),
      best: Math.max(...list.map((s) => s.wpm)),
      acc: RT.stats.mean(list.map((s) => s.acc)),
      cons: RT.stats.mean(list.map((s) => s.consistency)),
      n: list.length,
    }));
    if (dayRows.length) {
      const sec = h("div", { class: "section" });
      sec.append(h("div", { class: "section-head" }, h("h2", {}, "Speed by day"), h("span", { class: "small muted" }, "Line: daily average. Dots: best run.")));
      const card = h("div", { class: "card" });
      const chartEl = h("div");
      card.append(chartEl);
      sec.append(card);
      main.append(sec);
      RT.charts.line(chartEl, {
        height: 240,
        ariaLabel: "Words per minute by day, with the 100 WPM goal",
        n: dayRows.length,
        xLabel: (i) => fmtDate(dayRows[i].date),
        series: [
          { name: "Daily average", color: "var(--series-1)", values: dayRows.map((d) => round(d.avg)) },
          { name: "Best run", color: "var(--series-2)", values: dayRows.map((d) => round(d.best)), type: "dots" },
        ],
        refs: [{ y: 100, label: "Goal: 100" }],
        tooltip: (i) => ({
          title: fmtDate(dayRows[i].date),
          rows: [
            { name: "average", value: String(round(dayRows[i].avg)), color: "var(--series-1)" },
            { name: "best", value: String(round(dayRows[i].best)), color: "var(--series-2)" },
          ],
          note: plural(dayRows[i].n, "run"),
        }),
      });
      card.append(RT.charts.tableView(
        [{ label: "Day" }, { label: "Average", num: true }, { label: "Best", num: true }, { label: "Accuracy", num: true }, { label: "Consistency", num: true }, { label: "Runs", num: true }],
        dayRows.map((d) => [fmtDate(d.date), round(d.avg), round(d.best), pct(d.acc), pct(d.cons), d.n]),
      ));

      const sec2 = h("div", { class: "section" });
      sec2.append(h("div", { class: "section-head" }, h("h2", {}, "Accuracy and consistency")));
      const card2 = h("div", { class: "card" });
      const chart2 = h("div");
      card2.append(chart2);
      sec2.append(card2);
      main.append(sec2);
      const lows = dayRows.flatMap((d) => [d.acc, d.cons]);
      RT.charts.line(chart2, {
        height: 200,
        ariaLabel: "Accuracy and consistency by day, in percent",
        n: dayRows.length,
        xLabel: (i) => fmtDate(dayRows[i].date),
        // a floor that keeps four round steps up to 100%
        yMin: [80, 60, 20, 0].find((v) => v <= Math.min(...lows) - 2),
        yMax: 100,
        yFormat: (v) => `${round(v)}%`,
        series: [
          { name: "Accuracy", color: "var(--series-1)", values: dayRows.map((d) => d.acc) },
          { name: "Consistency", color: "var(--series-2)", values: dayRows.map((d) => d.cons) },
        ],
        tooltip: (i) => ({
          title: fmtDate(dayRows[i].date),
          rows: [
            { name: "accuracy", value: pct(dayRows[i].acc), color: "var(--series-1)" },
            { name: "consistency", value: pct(dayRows[i].cons), color: "var(--series-2)" },
          ],
        }),
      });
    }

    // Weak spots
    const pairs = RT.stats.weakPairs(all).slice(0, 10);
    const trouble = RT.stats.troubleWords(all).slice(0, 15);
    const weak = h("div", { class: "section two-col" });
    const pairCard = h("div", { class: "card" }, h("h3", {}, "Your 10 slowest letter pairs"));
    if (pairs.length) {
      const table = h("table", { class: "data" },
        h("thead", {}, h("tr", {}, h("th", {}, "Pair"), h("th", { class: "num" }, "Avg time"), h("th", { class: "num" }, "Typo rate"), h("th", {}, "Trend"))),
        h("tbody", {}, pairs.map((p) => h("tr", {},
          h("td", {}, h("span", { class: "pill" }, p.bg)),
          h("td", { class: "num" }, `${round(p.avgMs)} ms`),
          h("td", { class: "num" }, pct(p.errRate * 100)),
          h("td", { class: p.trendMs == null ? "muted" : p.trendMs < 0 ? "trend-faster" : "trend-slower" },
            p.trendMs == null ? "not enough data" : p.trendMs < 0 ? `${round(-p.trendMs)} ms faster` : `${round(p.trendMs)} ms slower`),
        ))),
      );
      pairCard.append(h("div", { class: "table-scroll" }, table),
        h("p", { class: "small", style: "margin:8px 0 0" }, h("a", { href: "#/type", onclick: drillLink("pairs") }, "Drill these pairs")));
    } else pairCard.append(h("p", { class: "ink-2" }, "A few more tests and your slowest pairs will show up here."));
    const wordCard = h("div", { class: "card" }, h("h3", {}, "Words you pause on most"));
    if (trouble.length) {
      wordCard.append(h("div", {}, trouble.map((w) => h("span", { class: "pill", title: plural(w.count, "time") }, w.word))),
        h("p", { class: "small", style: "margin:8px 0 0" }, h("a", { href: "#/type", onclick: drillLink("words") }, "Drill these words")));
    } else wordCard.append(h("p", { class: "ink-2" }, "Nothing yet."));
    weak.append(pairCard, wordCard);
    main.append(h("div", { class: "section-head", style: "margin-top:28px" }, h("h2", {}, "Weak spots"), h("span", { class: "small muted" }, "From your last 40 runs")), weak);

    // Weekly 60-second checks from the daily routine
    const checks = all.filter((s) => s.check);
    if (checks.length) {
      main.append(h("div", { class: "section" },
        h("div", { class: "section-head" }, h("h2", {}, "Weekly checks"), h("span", { class: "small muted" }, "60-second tests from the daily routine")),
        h("div", { class: "card table-scroll" }, h("table", { class: "data" },
          h("thead", {}, h("tr", {}, h("th", {}, "Date"), h("th", { class: "num" }, "WPM"), h("th", { class: "num" }, "Acc"), h("th", { class: "num" }, "Change"))),
          h("tbody", {}, checks.slice().reverse().map((s, k, arr) => {
            const prev = arr[k + 1];
            const diff = prev ? round(s.wpm - prev.wpm) : null;
            return h("tr", {},
              h("td", {}, fmtDate(new Date(s.ts))),
              h("td", { class: "num" }, String(round(s.wpm))),
              h("td", { class: "num" }, pct(s.acc)),
              h("td", { class: "num" + (diff > 0 ? " trend-faster" : "") }, diff == null ? "-" : `${diff > 0 ? "+" : ""}${diff}`));
          })),
        )),
      ));
    }

    // Recent runs
    const recentRuns = all.slice(-20).reverse();
    main.append(h("div", { class: "section" },
      h("div", { class: "section-head" }, h("h2", {}, "Recent runs")),
      h("div", { class: "card table-scroll" }, h("table", { class: "data" },
        h("thead", {}, h("tr", {}, h("th", {}, "When"), h("th", {}, "Test"), h("th", { class: "num" }, "WPM"), h("th", { class: "num" }, "Acc"), h("th", { class: "num" }, "Consistency"))),
        h("tbody", {}, recentRuns.map((s) => h("tr", {},
          h("td", {}, new Date(s.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })),
          h("td", {}, s.label || s.mode),
          h("td", { class: "num" }, String(round(s.wpm))),
          h("td", { class: "num" }, pct(s.acc)),
          h("td", { class: "num" }, s.consistency ? pct(s.consistency) : "-"),
        ))),
      )),
    ));
    main.append(dataSection());
  }

  function dataSection() {
    const status = h("p", { class: "small ink-2", role: "status" });
    const file = h("input", {
      type: "file", accept: "application/json,.json", hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const added = store.importJSON(await f.text());
          status.textContent = `Imported ${plural(added, "run")}.`;
          setTimeout(() => route(), 1200);
        } catch (err) {
          status.textContent = err.message || "That file couldn't be read.";
        }
      },
    });
    const download = () => {
      const blob = new Blob([store.exportJSON()], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: `road-to-100-${dayKey(Date.now())}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      status.textContent = "Saved a copy of your history.";
    };
    return h("div", { class: "section" },
      h("div", { class: "section-head" }, h("h2", {}, "Your data")),
      h("p", { class: "ink-2" }, "Your history is saved in this browser only. Export it to keep a backup, move it to another computer, or share it."),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: download }, "Export history"),
        h("button", { class: "btn", type: "button", onclick: () => file.click() }, "Import history"),
        h("button", {
          class: "btn danger", type: "button",
          onclick: () => {
            if (confirm("Delete all your runs and lesson progress from this browser? This can't be undone unless you've exported a copy.")) {
              store.clear();
              updateGoalChip();
              route();
            }
          },
        }, "Delete all"),
        file,
      ),
      status,
    );
  }

  // ----------------------------------------------------------- About page

  function renderAbout(main) {
    main.innerHTML = "";
    setActive(null);
    const texts = window.TEXTS;
    const books = new Map();
    for (const t of texts) if (t.source !== "Wikipedia") books.set(t.url + t.work, t);
    const wiki = texts.filter((t) => t.source === "Wikipedia");
    const counts = { quote: 0, paragraph: 0, long: 0 };
    for (const t of texts) for (const [k, f] of Object.entries(S.KINDS)) if (f(t)) counts[k]++;

    main.append(h("div", { class: "prose" },
      h("h1", {}, "About"),
      h("p", {}, "Road to 100 is a typing trainer for getting from the 60s to 100 words per minute. It measures what slows you down, not just how fast you are, and builds practice around it."),
      h("h2", {}, "How scores work"),
      h("ul", {},
        h("li", {}, "WPM counts the characters in correctly typed words (including spaces), divided by five, per minute, the same way Monkeytype does, so your numbers compare directly."),
        h("li", {}, "Raw counts every character you typed, right or wrong."),
        h("li", {}, "Accuracy is the share of keypresses that were right, including mistakes you later fixed."),
        h("li", {}, "Consistency measures how even your speed was from second to second (100% would mean perfectly even)."),
      ),
      h("h2", {}, "Your data"),
      h("p", {}, "Everything is stored in this browser (localStorage). Nothing is sent anywhere. Use Export on the Progress page to keep a copy."),
      h("h2", {}, "Keys"),
      h("ul", {},
        h("li", {}, h("kbd", {}, "tab"), " new test, or try again in a lesson"),
        h("li", {}, h("kbd", {}, "esc"), " restart the same text"),
        h("li", {}, h("kbd", {}, "option"), "+", h("kbd", {}, "backspace"), " (", h("kbd", {}, "ctrl"), "+", h("kbd", {}, "backspace"), " on Windows) delete the whole word"),
      ),
      h("h2", {}, "Texts and credits"),
      h("p", {}, `There are ${texts.length} texts: ${counts.quote} quotes, ${counts.paragraph} paragraphs and ${counts.long} long passages. Each one was cut word for word from its source; only curly quotes, dashes and accented letters were changed to keys you can type.`),
      h("p", {}, "Classic texts are public domain, taken from Project Gutenberg. Famous lines often circulate in different wording or with the wrong author; these follow the original texts and older public-domain translations, so some may read a little differently from versions you've seen."),
    ));
    const bookRows = [...books.values()].sort((a, b) => a.author.localeCompare(b.author));
    main.append(h("div", { class: "card table-scroll" }, h("table", { class: "data credits" },
      h("thead", {}, h("tr", {}, h("th", {}, "Author"), h("th", {}, "Work"), h("th", { class: "num" }, "Year"), h("th", {}, "Source"))),
      h("tbody", {}, bookRows.map((t) => h("tr", {},
        h("td", {}, t.author), h("td", {}, t.work), h("td", { class: "num" }, String(t.year)),
        h("td", {}, h("a", { href: t.url, target: "_blank", rel: "noopener" }, "Project Gutenberg"))))),
    )));
    main.append(h("div", { class: "prose", style: "margin-top:24px" },
      h("p", {},
        "Wikipedia excerpts are from the opening sections of the articles below, by Wikipedia contributors, licensed under ",
        h("a", { href: "https://creativecommons.org/licenses/by-sa/4.0/", target: "_blank", rel: "noopener" }, "CC BY-SA 4.0"),
        ". They were lightly edited for typing: pronunciation guides and non-English scripts were removed, and special characters were replaced. Each link goes to the exact revision used. The edited excerpts are shared under the same licence."),
    ));
    main.append(h("div", { class: "card" }, h("div", {}, wiki.map((t, k) => [
      h("a", { href: t.url, target: "_blank", rel: "noopener" }, t.work.replace("Wikipedia: ", "")),
      k < wiki.length - 1 ? ", " : "",
    ]))));
  }

  // ------------------------------------------------------------ chrome

  function updateGoalChip() {
    const chip = document.getElementById("goal-chip");
    const avg = averageWpm();
    chip.innerHTML = "";
    if (!avg) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.append("average ", h("b", {}, String(round(avg))), " \u2192 100");
  }

  // The theme on screen: your saved choice, or your system setting until you've made one.
  function currentTheme() {
    const mode = store.settings().themeMode;
    if (mode === "light" || mode === "dark") return mode;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  // Sun in dark mode, moon in light mode: the icon shows what a click switches to.
  function themeIcon(theme) {
    const NS = "http://www.w3.org/2000/svg";
    const el = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };
    const svg = el("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true" });
    if (theme === "dark") {
      svg.append(el("circle", { cx: "12", cy: "12", r: "4.5", fill: "currentColor" }));
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        svg.append(el("line", {
          x1: (12 + Math.cos(a) * 7.5).toFixed(2), y1: (12 + Math.sin(a) * 7.5).toFixed(2),
          x2: (12 + Math.cos(a) * 10).toFixed(2), y2: (12 + Math.sin(a) * 10).toFixed(2),
          stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round",
        }));
      }
    } else {
      svg.append(el("path", { d: "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z", fill: "currentColor" }));
    }
    return svg;
  }

  function applyTheme() {
    const mode = store.settings().themeMode;
    if (mode === "light" || mode === "dark") document.documentElement.dataset.theme = mode;
    else delete document.documentElement.dataset.theme;
    const theme = currentTheme();
    const btn = document.getElementById("theme-btn");
    const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.replaceChildren(themeIcon(theme));
  }
  // One click always flips what's on screen. Charts colour themselves from CSS variables,
  // so nothing needs redrawing and the page stays exactly where it is.
  document.getElementById("theme-btn").addEventListener("click", () => {
    store.set("themeMode", currentTheme() === "dark" ? "light" : "dark");
    applyTheme();
  });
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", applyTheme); // keep the icon right while following the system
  }

  // The footer shows this page's version, and says so when the site has a newer one
  // (browsers can keep serving an old copy for a few minutes after an update).
  function isNewer(a, b) {
    const pa = String(a).split(".").map(Number);
    const pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0;
    }
    return false;
  }

  function showVersion() {
    const el = document.getElementById("version");
    const v = window.APP_VERSION;
    if (!el || !v) return;
    el.textContent = ` \u00b7 Version ${v}`;
    fetch("version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((latest) => {
        if (!latest || !isNewer(latest.version, v)) return;
        el.classList.add("stale");
        el.append(" \u00b7 ", h("strong", {}, `A newer version (${latest.version}) is available.`), " ",
          // A new URL skips any cached copy of the page itself.
          h("a", { href: `${location.pathname}?v=${encodeURIComponent(latest.version)}${location.hash}` }, "Reload"));
      })
      .catch(() => {}); // offline, or opened as a file: the version alone is fine
  }

  function showStorageBanner() {
    document.getElementById("storage-banner").hidden = store.ok;
  }
  document.addEventListener("rt:storage", showStorageBanner);

  // ------------------------------------------------------------- routing

  function route() {
    const parts = (location.hash || "#/home").replace(/^#\/?/, "").split("/");
    const page = ["type", "routine", "learn", "progress", "about"].includes(parts[0]) ? parts[0] : "home";
    const main = document.getElementById("app");
    setActive(null);
    document.querySelectorAll(".nav a").forEach((a) => {
      if (a.dataset.route === page) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (page === "learn" && parts[1]) RT.tutorial.renderLesson(main, parts[1]);
    else if (page === "learn") { setActive(null); RT.tutorial.renderList(main); }
    else if (page === "progress") renderProgress(main);
    else if (page === "routine") RT.routine.render(main);
    else if (page === "about") renderAbout(main);
    else if (page === "type") renderType(main);
    else RT.home.render(main);
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true }); // so typing works straight after clicking a nav link
  }

  // Navigate, re-rendering even when we're already on that page.
  function go(hash) {
    if (location.hash === hash) route();
    else location.hash = hash;
  }

  RT.app = { saveSession, unsavedReason, renderResults, textCredit, setActive, startTest, averageWpm, isNewer };

  window.addEventListener("hashchange", route);
  applyTheme();
  showVersion();
  showStorageBanner();
  updateGoalChip();
  route();
})();
