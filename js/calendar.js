// A month calendar of your practice for the Home page: each day's average WPM, and the days
// you finished the daily routine.
(function () {
  const RT = (window.RT = window.RT || {});

  // Per-day totals from saved runs. Lesson runs are left out, as in the averages elsewhere.
  function summarizeDays(sessions, routineDays) {
    const out = {};
    for (const s of sessions) {
      if (s.mode === "lesson") continue;
      const k = RT.ui.dayKey(s.ts);
      const d = (out[k] = out[k] || { runs: 0, ms: 0, wpm: 0, best: 0, acc: 0, routine: false });
      d.runs++;
      d.ms += s.durationMs || 0;
      d.wpm += s.wpm;
      d.acc += s.acc;
      d.best = Math.max(d.best, s.wpm);
    }
    for (const d of Object.values(out)) {
      d.wpm /= d.runs;
      d.acc /= d.runs;
    }
    for (const k of routineDays) (out[k] = out[k] || { runs: 0, ms: 0, wpm: 0, best: 0, acc: 0 }).routine = true;
    return out;
  }

  // Days practised in a month (month is 0-11), and the daily average on the first and last of them.
  function monthSummary(days, year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    const keys = Object.keys(days).filter((k) => k.startsWith(prefix) && days[k].runs).sort();
    return {
      days: keys.length,
      first: keys.length ? days[keys[0]].wpm : null,
      last: keys.length ? days[keys[keys.length - 1]].wpm : null,
    };
  }

  // 0 = Sunday ... 6 = Saturday, from the browser's locale where it can tell.
  function firstDayOfWeek() {
    try {
      const loc = new Intl.Locale(navigator.language);
      const info = (loc.getWeekInfo && loc.getWeekInfo()) || loc.weekInfo;
      if (info && info.firstDay) return info.firstDay % 7;
    } catch (e) { /* older browsers */ }
    return navigator.language === "en-US" ? 0 : 1;
  }

  function render(container) {
    const h = RT.ui.h;
    const days = summarizeDays(RT.store.sessions(), RT.store.routineDays());
    const today = new Date();
    const todayKey = RT.ui.dayKey(today);
    const keys = Object.keys(days).sort();
    const earliest = keys.length ? new Date(`${keys[0]}T12:00:00`) : today;
    const start = firstDayOfWeek();
    let view = new Date(today.getFullYear(), today.getMonth(), 1);
    const root = h("section", { class: "cal", "aria-label": "Practice calendar" });
    container.append(root);

    const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    function describe(d, info) {
      if (!info) return `${fmtDay(d)}: no practice`;
      const parts = [fmtDay(d)];
      if (info.runs) {
        parts.push(`${info.runs} ${info.runs === 1 ? "run" : "runs"}`, `${Math.max(1, Math.round(info.ms / 60000))} min`,
          `average ${Math.round(info.wpm)} WPM`, `best ${Math.round(info.best)}`, `${Math.round(info.acc)}% accuracy`);
      }
      if (info.routine) parts.push("routine done");
      return parts.join(" \u00b7 ");
    }

    function draw() {
      root.replaceChildren();
      const y = view.getFullYear();
      const m = view.getMonth();
      const sum = monthSummary(days, y, m);
      const isCurrent = y === today.getFullYear() && m === today.getMonth();
      const canGoBack = view > new Date(earliest.getFullYear(), earliest.getMonth(), 1);
      const go = (delta) => { view = new Date(y, m + delta, 1); draw(); };
      let summary = "No practice this month";
      if (sum.days === 1) summary = `1 day \u00b7 ${Math.round(sum.first)} WPM`;
      else if (sum.days > 1) summary = `${sum.days} days \u00b7 ${Math.round(sum.first)} \u2192 ${Math.round(sum.last)} WPM`;
      root.append(h("div", { class: "cal-head" },
        h("button", { class: "icon-btn", type: "button", "aria-label": "Previous month", disabled: !canGoBack, onclick: () => go(-1) }, "\u2039"),
        h("h2", {}, view.toLocaleDateString(undefined, { month: "long", year: "numeric" })),
        h("button", { class: "icon-btn", type: "button", "aria-label": "Next month", disabled: isCurrent, onclick: () => go(1) }, "\u203a"),
        h("span", { class: "cal-summary" }, summary),
      ));

      const detail = h("p", { class: "cal-detail", "aria-live": "polite" }, "Hover over or tap a day for details.");
      const grid = h("div", { class: "cal-grid" });
      for (let i = 0; i < 7; i++) {
        const wd = new Date(2024, 0, 7 + ((start + i) % 7)); // 7 Jan 2024 was a Sunday
        grid.append(h("div", { class: "cal-wd", "aria-hidden": "true" }, wd.toLocaleDateString(undefined, { weekday: "short" })));
      }
      const lead = (new Date(y, m, 1).getDay() - start + 7) % 7;
      for (let i = 0; i < lead; i++) grid.append(h("div", { "aria-hidden": "true" }));
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      for (let n = 1; n <= daysInMonth; n++) {
        const d = new Date(y, m, n);
        const key = RT.ui.dayKey(d);
        if (key > todayKey) {
          grid.append(h("div", { class: "cal-day future", "aria-hidden": "true" }, h("span", { class: "cal-num" }, String(n))));
          continue;
        }
        const info = days[key];
        const cls = ["cal-day"];
        if (info && info.routine) cls.push("routine");
        else if (info && info.runs) cls.push("practised");
        if (key === todayKey) cls.push("is-today");
        const label = describe(d, info);
        const show = () => { detail.textContent = label; };
        grid.append(h("button", { class: cls.join(" "), type: "button", "aria-label": label, onmouseenter: show, onfocus: show, onclick: show },
          h("span", { class: "cal-num" }, String(n)),
          info && info.runs ? h("span", { class: "cal-wpm" }, String(Math.round(info.wpm))) : null));
      }
      root.append(grid, detail, h("div", { class: "cal-legend" },
        h("span", {}, h("span", { class: "cal-key routine" }), "Routine done"),
        h("span", {}, h("span", { class: "cal-key practised" }), "Practised"),
        h("span", {}, h("span", { class: "cal-key is-today" }), "Today"),
        h("span", {}, "Numbers are that day's average WPM"),
      ));
    }

    draw();
  }

  RT.calendar = { render, summarizeDays, monthSummary };
})();
