// Where the words come from: word lists, texts, your own text, and drills built from your history.
(function () {
  const RT = (window.RT = window.RT || {});

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Pasted text often has curly quotes, dashes and accents that aren't on the keyboard.
  function normalize(text) {
    return text
      .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
      .replace(/[\u201c\u201d\u201e]/g, '"')
      .replace(/\u2014/g, " - ")
      .replace(/[\u2010-\u2013\u2212]/g, "-")
      .replace(/\u2026/g, "...")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function simplify(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  }

  const toWords = (text) => text.split(" ").filter(Boolean);

  // ----------------------------------------------------------- word lists

  function randomWords(list) {
    let prev = "";
    const take = (n) => {
      const out = [];
      while (out.length < n) {
        const w = pick(list);
        if (w !== prev) { out.push(w); prev = w; }
      }
      return out;
    };
    return { initial: () => take(80), more: take };
  }

  // ----------------------------------------------------------------- texts

  const KINDS = {
    quote: (t) => t.words <= 40,
    paragraph: (t) => t.words > 40 && t.words <= 130,
    long: (t) => t.words > 130,
  };
  const recentTexts = [];

  function themes() {
    const seen = new Set();
    for (const t of window.TEXTS) t.themes.forEach((x) => seen.add(x));
    return [...seen].sort();
  }

  function chooseText(length, theme, minWords = 0) {
    let pool = window.TEXTS.filter((t) => KINDS[length](t) && t.words >= minWords && (theme === "all" || t.themes.includes(theme)));
    if (!pool.length) pool = window.TEXTS.filter((t) => KINDS[length](t));
    const fresh = pool.filter((t) => !recentTexts.includes(t.id));
    const t = pick(fresh.length ? fresh : pool);
    recentTexts.push(t.id);
    if (recentTexts.length > 15) recentTexts.shift();
    return t;
  }

  function textSource(text, simplified) {
    const words = toWords(simplified ? simplify(text) : text);
    return { initial: () => words };
  }

  // ---------------------------------------------------------- weak pairs

  // Same-finger pairs are slow for most people; used until there's enough of your own data.
  const DEFAULT_PAIRS = ["ed", "de", "ce", "un", "my", "br", "gr", "ft", "ny", "lo", "ol", "ki", "sw", "rt", "tr"];

  function weakPairList(sessions) {
    const rows = RT.stats.weakPairs(sessions);
    if (rows.length < 20) return { pairs: DEFAULT_PAIRS.slice(0, 8), fromHistory: false };
    return { pairs: rows.slice(0, 8).map((r) => r.bg), fromHistory: true, rows: rows.slice(0, 8) };
  }

  function countPairs(word, pairs) {
    let n = 0;
    const w = word.toLowerCase();
    for (let i = 0; i < w.length - 1; i++) if (pairs.includes(w.slice(i, i + 2))) n++;
    return n;
  }

  // Words packed with your weak pairs, mixed with some common words so it still flows.
  function pairWords(pairs) {
    const scored = window.WORDS_LARGE.map((w) => ({ w, n: countPairs(w, pairs) })).filter((x) => x.n > 0);
    const weighted = [];
    for (const x of scored) for (let k = 0; k < x.n; k++) weighted.push(x.w);
    let prev = "";
    const take = (n) => {
      const out = [];
      while (out.length < n) {
        const w = Math.random() < 0.75 && weighted.length ? pick(weighted) : pick(window.WORDS_200);
        if (w !== prev) { out.push(w); prev = w; }
      }
      return out;
    };
    return { initial: () => take(80), more: take };
  }

  // A quote or paragraph with a lot of your weak pairs in it.
  function pairText(pairs) {
    const ranked = window.TEXTS
      .filter((t) => t.words <= 130)
      .map((t) => ({ t, score: countPairs(t.text, pairs) / t.text.length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    return pick(ranked).t;
  }

  // -------------------------------------------------------- trouble words

  // Words you hesitate on come back until you type each one smoothly twice.
  function troubleDrill(words, baseline) {
    const need = 2;
    const pool = new Map(words.map((w) => [w, 0]));
    const total = pool.size;
    const gapLimit = baseline ? Math.max(baseline.gapMs * 1.3, 250) : 450;
    const charLimit = baseline ? baseline.perCharMs * 1.25 : 260;
    let prev = "";
    const take = (n) => {
      const out = [];
      const left = [...pool.keys()];
      if (!left.length) return out;
      while (out.length < n) {
        const w = left.length === 1 ? left[0] : pick(left.filter((x) => x !== prev));
        out.push(w);
        prev = w;
      }
      return out;
    };
    return {
      initial: () => take(30),
      more: take,
      onWord(info) {
        const w = RT.stats.drillWord(info.word);
        if (!pool.has(w)) return;
        const smooth = info.correct && (info.gapMs === null || info.gapMs <= gapLimit) && info.perCharMs <= charLimit;
        const n = smooth ? pool.get(w) + 1 : 0;
        if (n >= need) pool.delete(w); else pool.set(w, n);
      },
      done: () => pool.size === 0,
      status: () => `${total - pool.size}/${total} cleared`,
      remaining: () => [...pool.keys()],
    };
  }

  // ------------------------------------------------------- lesson sources

  const CHUNK_WORDS = () => window.WORDS_LARGE.filter((w) => /(ing|tion|ed|ly|er|ment)$/.test(w) && w.length <= 9);

  function commonWords() {
    return randomWords(window.WORDS_200.slice(0, 100).concat(shuffle(CHUNK_WORDS()).slice(0, 60)));
  }

  // Text with plenty of capitals and punctuation, for the Shift lesson.
  function capitalText() {
    const ranked = window.TEXTS
      .filter((t) => t.words >= 25 && t.words <= 90)
      .map((t) => ({ t, caps: (t.text.match(/[A-Z]/g) || []).length / t.words }))
      .sort((a, b) => b.caps - a.caps)
      .slice(0, 15);
    return pick(ranked).t;
  }

  RT.sources = {
    normalize, simplify, toWords, themes, chooseText, textSource,
    randomWords, weakPairList, pairWords, pairText, troubleDrill, commonWords, capitalText,
    KINDS,
  };
})();
