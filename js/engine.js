// The typing test: renders words, takes keystrokes, records timings, and hands a result to onFinish.
(function () {
  const RT = (window.RT = window.RT || {});
  const MAX_EXTRA = 10;      // extra letters allowed past the end of a word
  const SHOW_WPM = 110;      // timed tests show enough words up front for this speed
  const BUFFER_AHEAD = 15;   // ...and add more at the bottom if you get within this many of the end
  const BUFFER_CHUNK = 25;
  const SHIFTED = /[A-Z~!@#$%^&*()_+{}|:"<>?]/;

  // Which Shift key is held, tracked globally (keyup can happen outside the test).
  const shiftDown = { ShiftLeft: false, ShiftRight: false };
  window.addEventListener("keydown", (e) => { if (e.code in shiftDown) shiftDown[e.code] = true; }, true);
  window.addEventListener("keyup", (e) => { if (e.code in shiftDown) shiftDown[e.code] = false; }, true);
  window.addEventListener("blur", () => { shiftDown.ShiftLeft = shiftDown.ShiftRight = false; });
  function shiftSide() {
    if (shiftDown.ShiftLeft && !shiftDown.ShiftRight) return "L";
    if (shiftDown.ShiftRight && !shiftDown.ShiftLeft) return "R";
    return null;
  }

  /**
   * opts:
   *   source       { initial(): string[], more?(n): string[], onWord?(info), done?(): bool }
   *   seconds      time limit; 0 means the test ends at the end of the text
   *   maxSeconds   hard cap for open-ended drills
   *   hideActive   hide the rest of a word once you start it (reading-ahead lesson)
   *   paceWpm      show a ghost cursor moving at this speed
   *   onStart(), onFinish(result, record), onProgress(progress)
   */
  RT.createTest = function (root, opts) {
    root.innerHTML = "";
    const el = document.createElement("div");
    el.className = "test";
    el.innerHTML = `
      <div class="test-top" aria-live="off"><span class="live-main"></span><span class="live-wpm"></span><span class="caps" hidden>Caps Lock is on</span></div>
      <div class="words-wrap" role="textbox" aria-label="Typing area. Start typing to begin.">
        <div class="words"></div>
        <div class="ghost" hidden></div>
        <div class="caret idle"></div>
      </div>
      <div class="test-hint"></div>`;
    root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    const wordsEl = $(".words");
    const caretEl = $(".caret");
    const ghostEl = $(".ghost");
    const liveMain = $(".live-main");
    const liveWpm = $(".live-wpm");
    const capsEl = $(".caps");
    const hintEl = $(".test-hint");

    let s; // test state
    let ticker = null;
    let raf = null;

    function reset(sameWords) {
      stopTimers();
      let words = sameWords && s ? s.words.slice(0, s.initialCount) : opts.source.initial().slice();
      // The text never moves while you type, so a timed test shows all of its words at once.
      if (opts.seconds && opts.source.more) {
        const need = Math.ceil((opts.seconds * SHOW_WPM) / 60);
        words = words.length >= need ? words.slice(0, need) : words.concat(opts.source.more(need - words.length));
      }
      s = {
        words,
        initialCount: words.length,
        typed: words.map(() => ""),
        wi: 0,
        started: false,
        finished: false,
        t0: 0,
        events: [],
        wordTimes: [],
        typos: [],
        open: null,
        snapshots: [],
        els: [],
        starts: [],        // character offset of each word, for the pace cursor
      };
      wordsEl.innerHTML = "";
      appendWords(words, 0);
      caretEl.classList.add("idle");
      ghostEl.hidden = true;
      liveWpm.textContent = "";
      updateLive(0);
      hintEl.textContent = opts.hint || "Start typing when you're ready.";
      requestAnimationFrame(placeCaret);
    }

    function appendWords(list, from) {
      const frag = document.createDocumentFragment();
      list.forEach((word, k) => {
        const j = from + k;
        const w = document.createElement("div");
        w.className = "word";
        for (const ch of word) {
          const sp = document.createElement("span");
          sp.textContent = ch;
          w.appendChild(sp);
        }
        s.els[j] = w;
        s.starts[j] = j === 0 ? 0 : s.starts[j - 1] + s.words[j - 1].length + 1;
        frag.appendChild(w);
      });
      wordsEl.appendChild(frag);
    }

    function ensureBuffer() {
      if (!opts.source.more) return;
      if (s.words.length - s.wi < BUFFER_AHEAD) {
        const more = opts.source.more(BUFFER_CHUNK);
        if (!more || !more.length) return;
        const from = s.words.length;
        s.words.push(...more);
        s.typed.push(...more.map(() => ""));
        appendWords(more, from);
      }
    }

    function renderWord(j) {
      const w = s.els[j];
      if (!w) return;
      const word = s.words[j];
      const t = s.typed[j];
      const spans = w.children;
      for (let i = 0; i < word.length; i++) {
        spans[i].className = i < t.length ? (t[i] === word[i] ? "ok" : "bad") : "";
      }
      // extra letters typed past the end of the word
      while (w.children.length > word.length + Math.max(0, t.length - word.length)) w.removeChild(w.lastChild);
      for (let i = word.length; i < t.length; i++) {
        let sp = spans[i];
        if (!sp) { sp = document.createElement("span"); w.appendChild(sp); }
        sp.textContent = t[i];
        sp.className = "extra";
      }
      w.classList.toggle("err", j < s.wi && t !== word);
      w.classList.toggle("hide", !!opts.hideActive && j === s.wi && t.length > 0);
    }

    function letterBox(j, i) {
      const w = s.els[j];
      if (!w) return null;
      const spans = w.children;
      if (i < spans.length) return { x: spans[i].offsetLeft, y: w.offsetTop, h: w.offsetHeight };
      const lastSp = spans[spans.length - 1];
      return { x: lastSp ? lastSp.offsetLeft + lastSp.offsetWidth : w.offsetLeft, y: w.offsetTop, h: w.offsetHeight };
    }

    function placeCaret() {
      if (!s || s.finished) return;
      const box = letterBox(s.wi, s.typed[s.wi].length);
      if (!box) return;
      const y = box.y + (box.h - caretEl.offsetHeight) / 2;
      caretEl.style.transform = `translate(${box.x}px, ${y}px)`;
      if (s.started) keepInView(box);
    }

    // A long passage can be taller than the window. The text stays put; the page scrolls
    // only when the cursor is about to go off the bottom (or top) of the screen.
    function keepInView(box) {
      const top = wordsEl.getBoundingClientRect().top + box.y;
      if (top > window.innerHeight - box.h * 3 || top < 0) {
        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollBy({ top: top - window.innerHeight / 3, behavior: reduce ? "auto" : "smooth" });
      }
    }

    function placeGhost(elapsed) {
      const cps = (opts.paceWpm * 5) / 60000;
      const idx = Math.floor(elapsed * cps);
      // find the word containing this character offset
      let lo = 0, hi = s.words.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (s.starts[mid] <= idx) lo = mid; else hi = mid - 1;
      }
      const i = Math.min(idx - s.starts[lo], s.words[lo].length);
      const box = letterBox(lo, i);
      if (!box || lo >= s.words.length) { ghostEl.hidden = true; return; }
      ghostEl.hidden = false;
      const y = box.y + (box.h - ghostEl.offsetHeight) / 2;
      ghostEl.style.transform = `translate(${box.x}px, ${y}px)`;
    }

    function updateLive(elapsed) {
      if (opts.seconds) {
        const left = Math.max(0, Math.ceil(opts.seconds - elapsed / 1000));
        liveMain.textContent = s.started ? String(left) : String(opts.seconds);
      } else if (opts.source.done) {
        liveMain.textContent = opts.source.status ? opts.source.status() : "";
      } else {
        const done = s.wi;
        liveMain.textContent = `${done}/${s.words.length}`;
      }
      if (s.started && elapsed > 2000) {
        const w = RT.stats.wpmOf(RT.stats.correctChars(s.words, s.typed, s.wi), elapsed);
        liveWpm.textContent = `${Math.round(w)} wpm`;
      }
    }

    function start(now) {
      s.started = true;
      s.t0 = now;
      caretEl.classList.remove("idle");
      hintEl.textContent = "";
      if (opts.onStart) opts.onStart();
      ticker = setInterval(tick, 50);
      if (opts.paceWpm) raf = requestAnimationFrame(frame);
    }

    function frame() {
      if (!s.started || s.finished) return;
      placeGhost(performance.now() - s.t0);
      raf = requestAnimationFrame(frame);
    }

    function tick() {
      const elapsed = performance.now() - s.t0;
      // one snapshot of correct characters per whole second, for the WPM line
      while (elapsed >= (s.snapshots.length + 1) * 1000) {
        s.snapshots.push(RT.stats.correctChars(s.words, s.typed, s.wi));
      }
      updateLive(elapsed);
      if (opts.seconds && elapsed >= opts.seconds * 1000) finish(opts.seconds * 1000);
      else if (opts.maxSeconds && elapsed >= opts.maxSeconds * 1000) finish(elapsed);
    }

    function stopTimers() {
      clearInterval(ticker);
      ticker = null;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    function finish(durationMs, endedOnSpace) {
      if (s.finished) return;
      s.finished = true;
      stopTimers();
      caretEl.classList.add("idle");
      ghostEl.hidden = true;
      const record = {
        words: s.words,
        typed: s.typed,
        wi: s.wi,
        events: s.events.filter((e) => e.t <= durationMs),
        wordTimes: s.wordTimes,
        typos: s.typos.concat(s.open ? [{ w: s.open.w, i: s.open.i, t: s.open.t, ms: null }] : []),
        snapshots: s.snapshots,
        durationMs,
        endedOnSpace: !!endedOnSpace,
      };
      const result = RT.stats.compute(record);
      if (opts.onFinish) opts.onFinish(result, record);
    }

    // ---------------------------------------------------------- input

    function typeChar(k, e) {
      const now = performance.now();
      if (!s.started) start(now);
      const j = s.wi;
      const word = s.words[j];
      const cur = s.typed[j];
      if (cur.length >= word.length + MAX_EXTRA) return;
      const i = cur.length;
      const expected = word[i];
      const ok = expected === k;
      s.typed[j] = cur + k;
      const t = now - s.t0;
      const ev = { t, k, w: j, i, ok };
      if (expected === undefined) ev.x = 1;
      if (e.shiftKey && SHIFTED.test(k)) {
        ev.sh = shiftSide();
        ev.hand = RT.stats.handOf(e.code);
      }
      s.events.push(ev);
      if (!s.wordTimes[j]) s.wordTimes[j] = { start: t, end: null };

      // Typo cost: from the first wrong key in a word until that position is right again.
      // (For extra letters past the end, the word being right again is the fix.)
      if (!ok && (!s.open || s.open.w !== j)) s.open = { w: j, i, t };
      else if (ok && s.open && s.open.w === j && i + 1 >= Math.min(s.open.i + 1, word.length) && s.typed[j] === word.slice(0, i + 1)) {
        s.typos.push({ w: j, i: s.open.i, t: s.open.t, ms: t - s.open.t });
        s.open = null;
      }

      renderWord(j);
      placeCaret();
      // A text ends as soon as its last word is typed correctly.
      if (!opts.seconds && j === s.words.length - 1 && s.typed[j] === word && !opts.source.more) finish(t);
    }

    function typeSpace() {
      if (!s.started) return;
      const j = s.wi;
      if (!s.typed[j]) return; // a space at the start of a word does nothing
      const t = performance.now() - s.t0;
      const word = s.words[j];
      const typed = s.typed[j];
      s.events.push({ t, k: " ", w: j, i: typed.length, ok: typed.length >= word.length, sp: 1 });
      s.wordTimes[j].end = t;
      if (s.open && s.open.w === j) {
        s.typos.push({ w: j, i: s.open.i, t: s.open.t, ms: null }); // moved on without fixing it
        s.open = null;
      }
      if (opts.source.onWord) {
        const wt = s.wordTimes[j];
        const prev = s.wordTimes[j - 1];
        opts.source.onWord({
          word,
          correct: typed === word,
          gapMs: prev && prev.end != null ? wt.start - prev.end : null,
          perCharMs: (wt.end - wt.start) / word.length,
        });
      }
      const lastWord = j === s.words.length - 1 && !opts.source.more;
      if ((lastWord && !opts.seconds) || (opts.source.done && opts.source.done())) {
        finish(t, true);
        return;
      }
      if (lastWord) return;
      s.wi++;
      ensureBuffer();
      renderWord(j);
      renderWord(s.wi);
      placeCaret();
      updateLive(t);
    }

    function backspace(wholeWord) {
      if (!s.started) return;
      const t = performance.now() - s.t0;
      let j = s.wi;
      if (!s.typed[j]) {
        // Step back into the previous word only if it has a mistake (like Monkeytype).
        if (j === 0 || s.typed[j - 1] === s.words[j - 1] || !s.els[j - 1]) return;
        s.wi = --j;
        const last = s.typos[s.typos.length - 1];
        if (last && last.w === j && last.ms == null && (!s.open || s.open.w !== j + 1)) {
          s.typos.pop(); // reopen an unfixed typo now that it's being fixed
          s.open = { w: j, i: last.i, t: last.t };
        } else if (s.open && s.open.w === j + 1) {
          s.open = null; // its letters were deleted
        }
        s.events.push({ t, k: "Backspace", w: j, bs: 1 });
        if (!wholeWord) {
          renderWord(j + 1);
          renderWord(j);
          placeCaret();
          return;
        }
      }
      s.typed[j] = wholeWord ? "" : s.typed[j].slice(0, -1);
      s.events.push({ t, k: "Backspace", w: j, bs: wholeWord ? 2 : 1 });
      renderWord(j);
      renderWord(j + 1);
      placeCaret();
    }

    // Returns true when the key was used by the test.
    function key(e) {
      if (!s || s.finished) return false;
      capsEl.hidden = !(e.getModifierState && e.getModifierState("CapsLock"));
      const k = e.key;
      if (k === "Backspace") {
        backspace(e.altKey || e.ctrlKey || e.metaKey);
        return true;
      }
      if (e.ctrlKey || e.metaKey) return false;
      if (k === " ") { typeSpace(); return true; }
      if (k.length === 1) { typeChar(k, e); return true; }
      return false;
    }

    function onResize() {
      if (s && !s.finished) placeCaret();
    }
    window.addEventListener("resize", onResize);

    reset(false);

    return {
      key,
      restart(same) { reset(!!same); },
      get running() { return !!s && s.started && !s.finished; },
      get finished() { return !!s && s.finished; },
      destroy() {
        if (s) s.finished = true;
        stopTimers();
        window.removeEventListener("resize", onResize);
        el.remove();
      },
    };
  };
})();
