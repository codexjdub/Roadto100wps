// Saves sessions, settings and lesson progress in this browser (localStorage).
(function () {
  const RT = (window.RT = window.RT || {});
  // Test pages (?test in the URL) keep their own data so they never touch your history.
  const testing = typeof location !== "undefined" && /[?&]test\b/.test(location.search);
  const KEY = testing ? "rt100.test" : "rt100.v1";
  const DETAIL_LIMIT = 300; // keep per-key detail for the most recent sessions only

  const DEFAULT_SETTINGS = {
    mode: "words",          // words | text | drill | custom
    seconds: 30,
    wordList: "200",        // 200 | large
    textLength: "quote",    // quote | paragraph | long
    textTheme: "all",
    simplified: false,
    drill: "pairs",         // pairs | words
    drillAs: "words",       // words | sentences
    pace: "off",            // off | auto | fixed
    paceWpm: 80,
    customText: "",
    themeMode: "auto",      // auto | light | dark
    progressFilter: "all",
    progressRange: "30",
  };

  function empty() {
    return { version: 1, sessions: [], settings: Object.assign({}, DEFAULT_SETTINGS), lessons: {}, routine: null, routineDays: [] };
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const d = JSON.parse(raw);
      if (!d || !Array.isArray(d.sessions)) return empty();
      d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
      d.lessons = d.lessons || {};
      d.routine = d.routine || null;
      d.routineDays = Array.isArray(d.routineDays) ? d.routineDays : [];
      return d;
    } catch (e) {
      return empty();
    }
  }

  let db = read();
  let ok = true;

  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      ok = true;
    } catch (e) {
      ok = false;
    }
    document.dispatchEvent(new CustomEvent("rt:storage", { detail: { ok } }));
    return ok;
  }

  function prune() {
    const extra = db.sessions.length - DETAIL_LIMIT;
    for (let i = 0; i < extra; i++) {
      const s = db.sessions[i];
      delete s.bigrams;
      delete s.perSecond;
    }
  }

  RT.store = {
    get ok() { return ok; },
    sessions() { return db.sessions; },
    settings() { return db.settings; },
    set(key, value) {
      db.settings[key] = value;
      write();
    },
    addSession(session) {
      db.sessions.push(session);
      prune();
      write();
    },
    lesson(id) { return db.lessons[id] || {}; },
    setLesson(id, data) {
      db.lessons[id] = Object.assign({}, db.lessons[id], data);
      write();
    },
    // Where today's daily routine is up to: { day, step, run, cleanMisses, stopped, done }.
    routine() { return db.routine; },
    setRoutine(state) {
      db.routine = state;
      if (state && state.done && !db.routineDays.includes(state.day)) db.routineDays.push(state.day);
      write();
    },
    routineDays() { return db.routineDays; },
    exportJSON() {
      return JSON.stringify({ app: "road-to-100", exported: new Date().toISOString(), data: db }, null, 1);
    },
    // Merges sessions by id, so importing the same file twice adds nothing.
    importJSON(text) {
      const parsed = JSON.parse(text);
      const data = parsed && parsed.data ? parsed.data : parsed;
      if (!data || !Array.isArray(data.sessions)) throw new Error("This file doesn't look like a Road to 100 export.");
      const have = new Set(db.sessions.map((s) => s.id));
      let added = 0;
      for (const s of data.sessions) {
        if (s && s.id && typeof s.wpm === "number" && !have.has(s.id)) {
          db.sessions.push(s);
          added++;
        }
      }
      db.sessions.sort((a, b) => a.ts - b.ts);
      for (const [id, v] of Object.entries(data.lessons || {})) {
        if (!db.lessons[id]) db.lessons[id] = v;
      }
      for (const day of data.routineDays || []) if (!db.routineDays.includes(day)) db.routineDays.push(day);
      db.routineDays.sort();
      prune();
      write();
      return added;
    },
    clear() {
      const settings = db.settings;
      db = empty();
      db.settings = settings;
      write();
    },
  };

  // Probe once so the page can warn when saving is blocked (private windows, disabled storage).
  try {
    localStorage.setItem(KEY + ".probe", "1");
    localStorage.removeItem(KEY + ".probe");
  } catch (e) {
    ok = false;
  }
})();
