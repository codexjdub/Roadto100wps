// Scoring (the same definitions Monkeytype uses) and analysis of what slows you down.
(function () {
  const RT = (window.RT = window.RT || {});

  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const mean = (a) => (a.length ? sum(a) / a.length : 0);
  function median(a) {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function stdev(a) {
    const m = mean(a);
    return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
  }
  // Monkeytype's consistency: maps the coefficient of variation of per-second speed to 0-100.
  function kogasa(cov) {
    return 100 * (1 - Math.tanh(cov + cov ** 3 / 3 + cov ** 5 / 5));
  }
  const wpmOf = (chars, ms) => (ms > 0 ? chars / 5 / (ms / 60000) : 0);

  // Characters that count toward WPM: correctly typed words plus the spaces after them,
  // and the correct start of the word in progress.
  function correctChars(words, typed, wi) {
    let n = 0;
    for (let j = 0; j < wi; j++) if (typed[j] === words[j]) n += words[j].length + 1;
    const cur = typed[wi] || "";
    if (wi < words.length && words[wi].startsWith(cur)) n += cur.length;
    return n;
  }

  // Which hand types a key, by physical position. Used to check Shift technique.
  const LEFT = new Set(["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5",
    "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG",
    "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB"]);
  const RIGHT = new Set(["Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal",
    "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", "Backslash",
    "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote", "KeyN", "KeyM", "Comma", "Period", "Slash"]);
  function handOf(code) {
    if (LEFT.has(code)) return "L";
    if (RIGHT.has(code)) return "R";
    return null; // Digit6 is typed with either hand
  }

  const drillWord = (w) => w.toLowerCase().replace(/[^a-z']/g, "").replace(/^'+|'+$/g, "");

  /**
   * Turn a finished test into a result.
   * rec: { words, typed, wi, events, wordTimes, typos, snapshots, durationMs, timed }
   * events: { t, k, w, i, ok, x (extra), sp (space), bs (backspace), sh, hand }
   */
  function compute(rec) {
    const { words, typed, events, wordTimes, durationMs } = rec;
    const last = Math.min(rec.wi, words.length - 1);

    // Characters, like Monkeytype's correct/incorrect/extra/missed.
    const chars = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    let wpmChars = 0;
    let rawChars = 0;
    let wordsTyped = 0;
    for (let j = 0; j <= last; j++) {
      const t = typed[j] || "";
      const w = words[j];
      const done = j < last || rec.endedOnSpace; // a space was typed after this word
      if (!done && !t) continue;
      wordsTyped++;
      for (let i = 0; i < Math.min(t.length, w.length); i++) t[i] === w[i] ? chars.correct++ : chars.incorrect++;
      chars.extra += Math.max(0, t.length - w.length);
      if (done) {
        chars.missed += Math.max(0, w.length - t.length);
        if (t === w) wpmChars += w.length + 1;
        rawChars += t.length + 1;
      } else {
        if (w.startsWith(t)) wpmChars += t.length;
        rawChars += t.length;
      }
    }
    const wpm = wpmOf(wpmChars, durationMs);
    const raw = wpmOf(rawChars, durationMs);

    const presses = events.filter((e) => !e.bs);
    const good = presses.filter((e) => e.ok).length;
    const acc = presses.length ? (good / presses.length) * 100 : 0;

    // Per-second speed: keypresses in each second, like Monkeytype's grey "raw" line.
    const n = Math.max(1, Math.ceil(durationMs / 1000));
    const counts = new Array(n).fill(0);
    const errs = new Array(n).fill(0);
    const wordAt = new Array(n).fill(null);
    const tally = Array.from({ length: n }, () => new Map());
    const paused = new Array(n).fill(false); // seconds overlapped by a gap of 0.7 s or more
    let prevT = 0;
    for (const e of events) {
      if (e.t > durationMs) break;
      const b = Math.min(n - 1, Math.floor(e.t / 1000));
      if (e.t - prevT >= 700) {
        for (let k = Math.floor(prevT / 1000); k <= b; k++) paused[k] = true;
      }
      prevT = e.t;
      if (e.bs) continue;
      counts[b]++;
      if (!e.ok) errs[b]++;
      tally[b].set(e.w, (tally[b].get(e.w) || 0) + 1);
    }
    for (let b = 0; b < n; b++) {
      let best = null;
      let bestN = 0;
      for (const [w, c] of tally[b]) if (c > bestN) { best = w; bestN = c; }
      if (best === null) {
        const next = events.find((e) => e.t >= b * 1000 && !e.bs);
        best = next ? next.w : null;
      }
      wordAt[b] = best;
    }
    const lastLen = durationMs - (n - 1) * 1000;
    const rawPS = counts.map((c, b) => (b === n - 1 ? (c * 12 * 1000) / Math.max(lastLen, 1) : c * 12));
    if (n > 1 && lastLen < 500) {
      // A sliver of a final second is too noisy to plot on its own: fold it into the one before.
      rawPS[n - 2] = ((counts[n - 2] + counts[n - 1]) * 12 * 1000) / (1000 + lastLen);
      errs[n - 2] += errs[n - 1];
      rawPS.pop();
      errs.pop();
      wordAt.pop();
      paused[n - 2] = paused[n - 2] || paused[n - 1];
    }
    const secs = rawPS.length;
    const wpmPS = [];
    for (let s = 0; s < secs; s++) {
      const snap = rec.snapshots[s];
      wpmPS.push(s === secs - 1 || snap === undefined ? wpm : wpmOf(snap, (s + 1) * 1000));
    }
    const consistency = secs >= 2 && mean(rawPS) > 0 ? kogasa(stdev(rawPS) / mean(rawPS)) : 0;

    // Dips: seconds well below your typical speed in this run, with the likely cause.
    const med = median(rawPS);
    const dips = [];
    if (secs >= 4 && med > 0) {
      let s = 0;
      while (s < secs) {
        if (rawPS[s] < med * 0.65) {
          let low = s;
          let e = s;
          while (e + 1 < secs && rawPS[e + 1] < med * 0.65) {
            e++;
            if (rawPS[e] < rawPS[low]) low = e;
          }
          const typo = errs.slice(Math.max(0, s - 1), e + 1).some((x) => x > 0);
          const pause = paused.slice(s, e + 1).some(Boolean);
          const wIdx = wordAt[low];
          dips.push({
            s: low,
            value: Math.round(rawPS[low]),
            word: wIdx === null ? "" : words[wIdx],
            cause: typo ? "typo" : pause ? "pause" : "slow",
          });
          s = e + 1;
        } else s++;
      }
      dips.sort((a, b) => a.value - b.value);
      dips.splice(4);
      dips.sort((a, b) => a.s - b.s);
    }

    // Letter pairs: time between two correct keys inside a word, and typos on the second key.
    const bigrams = {};
    let prev = null;
    for (const e of events) {
      if (e.t > durationMs) break;
      if (e.bs || e.sp || e.x) { prev = null; continue; }
      if (e.i > 0) {
        const w = words[e.w];
        const a = w[e.i - 1];
        const b = w[e.i];
        if (/^[a-z]$/.test(a) && /^[a-z]$/.test(b)) {
          const rec2 = (bigrams[a + b] = bigrams[a + b] || [0, 0, 0]);
          if (!e.ok) rec2[2]++;
          else if (prev && prev.ok && prev.w === e.w && prev.i === e.i - 1) {
            const dt = e.t - prev.t;
            if (dt > 0 && dt < 1500) { rec2[0] += dt; rec2[1]++; }
          }
        }
      }
      prev = e;
    }

    // Words: pauses before starting a word, and words typed slowly.
    const backs = new Map();
    for (const e of events) if (e.bs) backs.set(e.w, (backs.get(e.w) || 0) + 1);
    const gaps = [];
    const perChar = [];
    for (let j = 0; j <= last; j++) {
      const wt = wordTimes[j];
      if (!wt || wt.end == null) continue;
      if (j > 0 && wordTimes[j - 1] && wordTimes[j - 1].end != null) {
        const g = wt.start - wordTimes[j - 1].end;
        if (g >= 0) gaps.push({ j, g });
      }
      if (typed[j] === words[j] && words[j].length >= 2 && !backs.get(j)) {
        perChar.push({ j, ms: (wt.end - wt.start) / words[j].length });
      }
    }
    const medGap = median(gaps.map((x) => x.g));
    const medPerChar = median(perChar.map((x) => x.ms));
    const uniq = (arr) => [...new Set(arr.filter((w) => w.length >= 2))];
    const hesitations = uniq(gaps.filter((x) => x.g > Math.max(medGap * 1.5, 300)).map((x) => drillWord(words[x.j])));
    const slowWords = uniq(perChar.filter((x) => words[x.j].length >= 3 && x.ms > medPerChar * 1.5).map((x) => drillWord(words[x.j])));

    // Typos and how long each took to fix.
    const typos = rec.typos.filter((t) => t.t <= durationMs);
    const fixed = typos.filter((t) => t.ms != null);
    const typoStats = {
      n: typos.length,
      fixed: fixed.length,
      totalMs: Math.round(sum(fixed.map((t) => t.ms))),
      avgMs: fixed.length ? Math.round(mean(fixed.map((t) => t.ms))) : 0,
    };

    // Shift technique: capitals and symbols typed with Shift on the other hand.
    const shift = { opp: 0, same: 0 };
    for (const e of events) {
      if (!e.sh || !e.hand) continue;
      e.sh === e.hand ? shift.same++ : shift.opp++;
    }

    return {
      wpm, raw, acc, consistency, durationMs,
      chars,
      perSecond: {
        raw: rawPS.map((x) => Math.round(x)),
        wpm: wpmPS.map((x) => Math.round(x * 10) / 10),
        err: errs,
        word: wordAt.map((w) => (w === null ? "" : words[w])),
      },
      dips,
      bigrams,
      hesitations,
      slowWords,
      medGapMs: Math.round(medGap),
      medPerCharMs: Math.round(medPerChar),
      typos: typoStats,
      shift,
      wordsTyped,
    };
  }

  // ------------------------------------------------------------ history

  // Combine letter-pair timings over recent sessions; the slowest and most error-prone come first.
  function weakPairs(sessions, opts = {}) {
    const limit = opts.limit || 40;
    const minSamples = opts.minSamples || 6;
    const recent = sessions.filter((s) => s.bigrams).slice(-limit);
    const agg = {};
    recent.forEach((s, idx) => {
      const half = idx < recent.length / 2 ? "a" : "b";
      for (const [bg, [ms, n, err]] of Object.entries(s.bigrams)) {
        const r = (agg[bg] = agg[bg] || { ms: 0, n: 0, err: 0, a: [0, 0], b: [0, 0] });
        r.ms += ms; r.n += n; r.err += err;
        r[half][0] += ms; r[half][1] += n;
      }
    });
    const rows = Object.entries(agg).filter(([, r]) => r.n >= minSamples);
    const totalMs = sum(rows.map(([, r]) => r.ms));
    const totalN = sum(rows.map(([, r]) => r.n));
    const overall = totalN ? totalMs / totalN : 0;
    return rows
      .map(([bg, r]) => {
        const avg = r.ms / r.n;
        const errRate = r.err / (r.n + r.err);
        const early = r.a[1] >= 3 ? r.a[0] / r.a[1] : null;
        const late = r.b[1] >= 3 ? r.b[0] / r.b[1] : null;
        return {
          bg, avgMs: avg, n: r.n, errRate,
          score: (avg / overall) * (1 + 3 * errRate),
          trendMs: early !== null && late !== null ? late - early : null,
        };
      })
      .sort((x, y) => y.score - x.score);
  }

  // Words you most often paused before or typed slowly.
  function troubleWords(sessions, limit = 30) {
    const counts = new Map();
    for (const s of sessions.slice(-limit)) {
      for (const w of [...(s.hesitations || []), ...(s.slowWords || [])]) counts.set(w, (counts.get(w) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word, count]) => ({ word, count }));
  }

  function recentAverage(sessions, n = 10, key = "wpm") {
    const r = sessions.slice(-n);
    return r.length ? mean(r.map((s) => s[key] || 0)) : null;
  }

  function timingBaseline(sessions) {
    const r = sessions.slice(-10).filter((s) => s.medGapMs && s.medPerCharMs);
    if (!r.length) return null;
    return { gapMs: median(r.map((s) => s.medGapMs)), perCharMs: median(r.map((s) => s.medPerCharMs)) };
  }

  RT.stats = { compute, correctChars, wpmOf, handOf, median, mean, kogasa, weakPairs, troubleWords, recentAverage, timingBaseline, drillWord };
})();
