#!/usr/bin/env python3
"""Build js/texts.js from public-domain books (Project Gutenberg) and Wikipedia.

Every text is cut out of its source between a start and an end anchor, so the
wording is exactly the source's (apart from ASCII clean-up for typing). Nothing
is typed in from memory.

Usage:
  python3 tools/build_texts.py                       # fetch sources, write js/texts.js
  python3 tools/build_texts.py --find walden "woods"  # show paragraphs containing a phrase
  python3 tools/build_texts.py --cache /some/dir      # where downloaded sources are kept
"""

import argparse
import json
import os
import re
import sys
import tempfile
import unicodedata
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "js", "texts.js")
UA = "Roadto100wps-texts/1.0 (https://github.com/codexjdub/Roadto100wps)"

# ---------------------------------------------------------------- sources ---

BOOKS = {
    "walden": dict(pg=205, author="Henry David Thoreau", work="Walden", year=1854),
    "artofwar": dict(pg=132, author="Sun Tzu", work="The Art of War (tr. Lionel Giles)", year=1910, numbered=True, brackets="drop"),
    "meditations": dict(pg=15877, author="Marcus Aurelius", work="Meditations (tr. George Long)", year=1862, numbered=True, brackets="unwrap"),
    "prince": dict(pg=1232, author="Niccolo Machiavelli", work="The Prince (tr. W. K. Marriott)", year=1908),
    "franklin": dict(pg=148, author="Benjamin Franklin", work="Autobiography", year=1791),
    "origin": dict(pg=1228, author="Charles Darwin", work="On the Origin of Species", year=1859),
    "douglass": dict(pg=23, author="Frederick Douglass", work="Narrative of the Life of Frederick Douglass", year=1845),
    "lincoln": dict(pg=14721, author="Abraham Lincoln", work="Gettysburg Address", year=1863),
    "lincoln2": dict(pg=8, author="Abraham Lincoln", work="Second Inaugural Address", year=1865),
    "pride": dict(pg=1342, author="Jane Austen", work="Pride and Prejudice", year=1813),
    "twocities": dict(pg=98, author="Charles Dickens", work="A Tale of Two Cities", year=1859),
    "puddnhead": dict(pg=102, author="Mark Twain", work="Pudd'nhead Wilson", year=1894),
    "frankenstein": dict(pg=84, author="Mary Shelley", work="Frankenstein", year=1818),
    "moby": dict(pg=2701, author="Herman Melville", work="Moby-Dick", year=1851),
    "dorian": dict(pg=174, author="Oscar Wilde", work="The Picture of Dorian Gray", year=1890),
    "gatsby": dict(pg=64317, author="F. Scott Fitzgerald", work="The Great Gatsby", year=1925),
    "alice": dict(pg=11, author="Lewis Carroll", work="Alice's Adventures in Wonderland", year=1865),
    "glass": dict(pg=12, author="Lewis Carroll", work="Through the Looking-Glass", year=1871),
    "declaration": dict(pg=1, author="Thomas Jefferson and others", work="Declaration of Independence", year=1776),
    "selfhelp": dict(pg=935, author="Samuel Smiles", work="Self-Help", year=1859),
    "upfrom": dict(pg=2376, author="Booker T. Washington", work="Up from Slavery", year=1901),
    "republic": dict(pg=1497, author="Plato", work="The Republic (tr. Benjamin Jowett)", year=1871),
    "tao": dict(pg=216, author="Laozi", work="Tao Te Ching (tr. James Legge)", year=1891),
    "emerson": dict(pg=2944, author="Ralph Waldo Emerson", work="Essays: First Series", year=1841),
    "keller": dict(pg=2397, author="Helen Keller", work="The Story of My Life", year=1903),
    "hamlet": dict(pg=1524, author="William Shakespeare", work="Hamlet", year=1603),
    "caesar": dict(pg=1522, author="William Shakespeare", work="Julius Caesar", year=1599),
    "stevenson": dict(pg=386, author="Robert Louis Stevenson", work="Virginibus Puerisque", year=1881),
    "aesop": dict(pg=21, author="Aesop", work="Fables (tr. George Fyler Townsend)", year=1867),
    "analects": dict(pg=3330, author="Confucius", work="The Analects (tr. James Legge)", year=1861),
    "epictetus": dict(pg=10661, author="Epictetus", work="Discourses (tr. George Long)", year=1877),
    "crisis": dict(pg=3741, author="Thomas Paine", work="The American Crisis", year=1776),
    "russell": dict(pg=5827, author="Bertrand Russell", work="The Problems of Philosophy", year=1912),
    "roosevelt": dict(pg=13930, author="Theodore Roosevelt", work="Citizenship in a Republic", year=1910),
    "james": dict(pg=57628, author="William James", work="The Principles of Psychology", year=1890),
}

# (book, start anchor, end anchor or None for end of paragraph, themes[, work override])
QUOTES = [
    ("walden", "I went to the woods because", "discover that I had not lived.", "life"),
    ("walden", "Our life is frittered away by detail.", "Simplicity, simplicity, simplicity!", "life"),
    ("walden", "If a man does not keep pace with his companions", "however measured or far away.", "courage"),
    ("walden", "If you have built castles in the air", "put the foundations under them.", "persistence"),
    ("walden", "I learned this, at least, by my experiment", "unexpected in common hours.", "persistence"),
    ("walden", "The mass of men lead lives of quiet desperation.", "confirmed desperation.", "life"),
    ("walden", "However mean your life is, meet it and live it", "call it hard names.", "life"),
    ("walden", "A lake is the landscape", "depth of his own nature.", "nature"),

    ("artofwar", "The art of war is of vital importance to the State.", "can on no account be neglected.", "strategy"),
    ("artofwar", "All warfare is based on deception.", "believe we are near.", "strategy"),
    ("artofwar", "Hence to fight and conquer in all your battles", "without fighting.", "strategy"),
    ("artofwar", "If you know the enemy and know yourself", "succumb in every battle.", "strategy"),
    ("artofwar", "Thus it is that in war the victorious strategist", "afterwards looks for victory.", "strategy"),
    ("artofwar", "There are not more than five musical notes", "can ever be heard.", "strategy"),
    ("artofwar", "The quality of decision is like the well-timed swoop of a falcon", "destroy its victim.", "strategy"),
    ("artofwar", "Energy may be likened to the bending of a crossbow", "releasing of the trigger.", "strategy"),
    ("artofwar", "Rapidity is the essence of war", "attack unguarded spots.", "strategy"),
    ("artofwar", "Let your rapidity be that of the wind", "immovability like a mountain.", "strategy"),
    ("artofwar", "Let your plans be dark and impenetrable as night", "fall like a thunderbolt.", "strategy"),
    ("artofwar", "Military tactics are like unto water", "no constant conditions.", "strategy"),
    ("artofwar", "Thus we may know that there are five essentials for victory", "interfered with by the sovereign.", "strategy"),
    ("artofwar", "Appear at points which the enemy must hasten to defend", "where you are not expected.", "strategy"),

    ("meditations", "Begin the morning by saying to thyself", "envious, unsocial.", "life"),
    ("meditations", "In the morning when thou risest unwillingly", "the work of a human being.", "practice"),
    ("meditations", "Such as are thy habitual thoughts", "dyed by the thoughts.", "practice"),
    ("meditations", "No longer talk at all about the kind of man", "but be such.", "courage"),
    ("meditations", "Look within. Within is the fountain of good", "if thou wilt ever dig.", "life"),
    ("meditations", "The best way of avenging thyself", "like the wrong-doer.", "life", {"nth": 2}),
    ("meditations", "Be like the promontory against which the waves continually break", "water around it.", "persistence"),
    ("meditations", "If it is not right, do not do it", "do not say it.", "life"),
    ("meditations", "The universe is transformation", "life is opinion.", "life"),
    ("meditations", "Men exist for the sake of one another.", "or bear with them.", "life"),

    ("prince", "A wise man ought always to follow the paths beaten by great men", "savour of it.", "practice"),
    ("prince", "it ought to be remembered that there is nothing more difficult", "do well under the new.", "courage"),
    ("prince", "I hold it to be true that Fortune is the arbiter", "or perhaps a little less.", "strategy"),
    ("prince", "the first opinion which one forms of a prince", "to keep them faithful.", "strategy"),

    ("franklin", "About this time I met with an odd volume of the Spectator", "make me master of it.", "practice"),
    ("franklin", "Industry. Lose no time", "unnecessary actions.", "practice"),
    ("franklin", "Resolution. Resolve to perform what you ought", "what you resolve.", "practice"),
    ("franklin", "Order. Let all your things have their places", "have its time.", "practice"),
    ("franklin", "I was surpris", "seeing them diminish.", "persistence"),

    ("origin", "There is grandeur in this view of life", "are being, evolved.", "science"),

    ("douglass", "I now understood what had been to me a most perplexing difficulty", "pathway from slavery to freedom.", "courage"),

    ("lincoln", "Fourscore and seven years ago", "shall not perish from the earth.", "history"),
    ("lincoln2", "With malice toward none", "with all nations.", "history"),
    ("pride", "It is a truth universally acknowledged", "in want of a wife.", "stories"),
    ("twocities", "It was the best of times", "superlative degree of comparison only.", "stories"),

    ("puddnhead", "Few things are harder to put up with", "a good example.", "life"),
    ("puddnhead", "Habit is habit", "a step at a time.", "practice"),
    ("puddnhead", "Let us endeavor so to live", "undertaker will be sorry.", "life"),
    ("puddnhead", "Behold, the fool saith", "watch that basket", "strategy"),

    ("frankenstein", "Nothing is so painful to the human mind as a great and sudden change.", "great and sudden change.", "life"),
    ("frankenstein", "Beware, for I am fearless and therefore powerful.", "therefore powerful.", "courage"),

    ("moby", "Call me Ishmael.", None, "stories"),

    ("dorian", "There is no such thing as a moral or an immoral book.", "That is all.", "life"),
    ("dorian", "The only way to get rid of a temptation is to yield to it.", "yield to it.", "life"),
    ("dorian", "there is only one thing in the world worse than being talked about", "not being talked about.", "life"),

    ("gatsby", "In my younger and more vulnerable years", "the advantages that you've had.", "stories"),
    ("gatsby", "Gatsby believed in the green light", "ceaselessly into the past.", "persistence"),

    ("alice", "Begin at the beginning,", "then stop.", "practice"),
    ("alice", "Would you tell me, please, which way I ought to go from here?", "said the Cat.", "life"),
    ("glass", "Now, here, you see, it takes all the running you can do", "twice as fast as that!", "persistence"),
    ("glass", "Why, sometimes I", "before breakfast.", "life"),

    ("declaration", "We hold these truths to be self-evident", "pursuit of Happiness.", "history"),

    ("selfhelp", "HEAVEN helps those who help themselves", "national vigour and strength.", "persistence", {"fix": [("HEAVEN", "Heaven")]}),
    ("selfhelp", "It may seem a simple affair to play upon a violin", "for twenty years together.", "practice"),
    ("selfhelp", "We must repeat and again repeat", "capable of achieving!", "practice"),
    ("selfhelp", "Much will be done if we do but try.", "worth a thousand aspirations.", "persistence"),
    ("selfhelp", "It is not eminent talent that is required", "energetically and perseveringly.", "persistence"),

    ("upfrom", "I have learned that success is to be measured", "while trying to succeed.", "persistence"),

    ("tao", "He who knows other men is discerning", "overcomes himself is mighty.", "life"),
    ("tao", "The tree which fills the arms grew from the tiniest sprout", "with a single step.", "persistence"),

    ("emerson", "Trust thyself: every heart vibrates to that iron string.", "iron string.", "courage", {"work": "Self-Reliance"}),
    ("emerson", "A foolish consistency is the hobgoblin of little minds", "divines.", "life", {"work": "Self-Reliance"}),
    ("emerson", "Insist on yourself; never imitate.", "never imitate.", "courage", {"work": "Self-Reliance"}),
    ("emerson", "Nothing can bring you peace but yourself.", "triumph of principles.", "life", {"work": "Self-Reliance"}),
    ("emerson", "Nothing great was ever achieved without enthusiasm.", "without enthusiasm.", "persistence", {"work": "Circles"}),

    ("hamlet", "This above all: to thine own self be true", "false to any man.", "life"),
    ("caesar", "The fault, dear Brutus, is not in our stars", "that we are underlings.", "courage"),
    ("caesar", "Cowards die many times before their deaths", "death but once.", "courage"),
    ("caesar", "There is a tide in the affairs of men", "shallows and in miseries.", "strategy"),

    ("crisis", "THESE are the times that try men's souls. The summer soldier", "the more glorious the triumph.", "courage", {"fix": [("THESE", "These")]}),
    ("roosevelt", "It is not the critic who counts", "neither victory nor defeat.", "courage"),
    ("douglass", "Thus, after a long, tedious effort for years", "how to write.", "persistence"),
    ("republic", "You know also that the beginning", "more readily taken.", "practice"),
    ("tao", "There is nothing in the world more soft and weak than water", "can be changed.", "nature"),
    ("hamlet", "Why, then 'tis none to you", "thinking makes it so.", "life"),
    ("stevenson", "Little do ye know your own blessedness", "the true success is to labour.", "persistence"),
    ("keller", "We walked down the path to the well-house", None, "practice"),
    ("russell", "The value of philosophy is, in fact,", "its very uncertainty.", "life"),
    ("russell", "Philosophy is to be studied, not for the sake", None, "life"),
    ("russell", "The value of philosophy is, in fact,", None, "life"),
    ("walden", "I went to the woods because", None, "life"),
    ("douglass", "After that, when I met with any boy who I knew could write", "I learned mainly how to write.", "practice"),
    ("declaration", "When in the Course of human events", "their Safety and Happiness.", "history"),
    ("origin", "It is interesting to contemplate an entangled bank", None, "science"),
    ("emerson", "There is a time in every man's education", "shall give him no peace.", "persistence", {"work": "Self-Reliance"}),
    ("james", "Habit is thus the enormous fly-wheel of society", "too late to begin again.", "practice"),

    ("aesop", "A HARE one day ridiculed", "Slow but steady wins the race.", "persistence", {"fix": [("A HARE", "A Hare")]}),
    ("aesop", "A CROW perishing with thirst", "mother of invention.", "persistence", {"fix": [("A CROW", "A Crow")]}),
    ("aesop", "THE ANTS were spending", "supperless to bed in the winter.", "practice", {"fix": [("THE ANTS", "The Ants")]}),

    ("analects", "Is it not pleasant to learn with a constant perseverance", "and application?", "practice", {"widen": False}),
    ("analects", "The Master said, 'Learning without thought", "without learning is perilous.'", "practice"),
    ("analects", "The Master said, 'Yu, shall I teach you", "this is knowledge.'", "life"),

    ("epictetus", "Every habit and faculty is maintained", "accustom yourself to do something else in place of it.", "practice"),
    ("epictetus", "Every habit and faculty is maintained", "if a writer, write.", "practice"),
    ("epictetus", "Men are disturbed not by the things which happen", "is the terrible thing.", "life"),
    ("epictetus", "Nothing great, said Epictetus, is produced suddenly", "and then ripen.", "persistence"),

    ("james", "Habit is thus the enormous fly-wheel of society", "conservative agent.", "practice"),
    ("james", "The second maxim is: Never suffer an exception", "a great many turns will wind again.", "practice"),
    ("james", "Keep the faculty of effort alive in you", "exercise every day.", "practice"),
    ("james", "Thus, we notice after exercising our muscles", "skate during the summer.", "practice"),
    ("james", "Could the young but realize how soon", "never to be undone.", "practice"),
]


# (article title, themes, max words) - opening sentences of the article
WIKI = [
    ("Moon", "space", 110),
    ("Sun", "space", 110),
    ("Mars", "space", 110),
    ("Jupiter", "space", 110),
    ("Black hole", "space", 120),
    ("Milky Way", "space", 110),
    ("Apollo 11", "space", 230),
    ("International Space Station", "space", 110),
    ("Voyager 1", "space", 110),
    ("Hubble Space Telescope", "space", 110),
    ("Photosynthesis", "science", 110),
    ("DNA", "science", 110),
    ("Lightning", "science", 110),
    ("Volcano", "science", 110),
    ("Octopus", "nature", 230),
    ("Honey bee", "nature", 230),
    ("Blue whale", "nature", 110),
    ("Tardigrade", "nature", 110),
    ("Coral reef", "nature", 110),
    ("Amazon rainforest", "nature", 110),
    ("Roman Empire", "history", 230),
    ("Ancient Egypt", "history", 110),
    ("Library of Alexandria", "history", 110),
    ("Silk Road", "history", 110),
    ("Renaissance", "history", 110),
    ("Industrial Revolution", "history", 110),
    ("Printing press", "inventions", 230),
    ("Telephone", "inventions", 110),
    ("Internet", "inventions", 230),
    ("World Wide Web", "inventions", 110),
    ("Wright brothers", "inventions", 230),
    ("Penicillin", "inventions", 110),
    ("Typewriter", "typing", 230),
    ("QWERTY", "typing", 230),
    ("Touch typing", "typing", 230),
    ("Words per minute", "typing", 120),
]

# ----------------------------------------------------------------- helpers ---

# Characters that aren't on an English keyboard, as code points so invisible ones stay readable.
REPLACE = {
    chr(0x2018): "'",  # left single quote
    chr(0x2019): "'",  # right single quote
    chr(0x201a): "'",
    chr(0x201b): "'",
    chr(0x201c): '"',  # left double quote
    chr(0x201d): '"',  # right double quote
    chr(0x201e): '"',
    chr(0x2014): ' - ',  # em dash
    chr(0x2013): '-',  # en dash
    chr(0x2012): '-',
    chr(0x2212): '-',  # minus
    chr(0x2010): '-',
    chr(0x2011): '-',
    chr(0x2026): '...',  # ellipsis
    chr(0x00a0): ' ',  # no-break space
    chr(0x202f): ' ',
    chr(0x2009): ' ',
    chr(0x2044): '/',  # fraction slash
    chr(0x00e6): 'ae',
    chr(0x00c6): 'Ae',
    chr(0x0153): 'oe',
    chr(0x0152): 'Oe',
    chr(0x00df): 'ss',
    chr(0x00d7): 'x',  # multiplication
    chr(0x00b1): '+/-',
    chr(0x2248): 'about ',
    chr(0x03b2): 'beta',  # beta
    chr(0x00b0) + "C": " degrees Celsius",
    chr(0x00b0) + "F": " degrees Fahrenheit",
    chr(0x00b0): " degrees",
}
SUPERSCRIPT_CHARS = [0x2070, 0x00b9, 0x00b2, 0x00b3, 0x2074, 0x2075, 0x2076, 0x2077, 0x2078, 0x2079, 0x207b]
SUPERSCRIPT = {cp: c for cp, c in zip(SUPERSCRIPT_CHARS, "0123456789-")}
SUPERSCRIPT_RUN = re.compile("[" + "".join(map(chr, SUPERSCRIPT_CHARS)) + "]+")

# Scripts that can't be typed on an English keyboard (IPA, Greek, Cyrillic, Hebrew, Arabic, Devanagari, CJK...).
NON_LATIN_RANGES = [(0x0250, 0x02FF), (0x0370, 0x03FF), (0x0400, 0x04FF), (0x0590, 0x06FF), (0x0900, 0x097F), (0x2E80, 0xFFFF)]
NON_LATIN = re.compile("[" + "".join(f"{chr(a)}-{chr(b)}" for a, b in NON_LATIN_RANGES) + "]")

def to_ascii(s):
    # Superscripts: 10 to the 8th -> 10^8, square km -> km^2
    s = SUPERSCRIPT_RUN.sub(lambda m: "^" + m.group(0).translate(SUPERSCRIPT), s)
    for k in sorted(REPLACE, key=len, reverse=True):
        s = s.replace(k, REPLACE[k])
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s


def tidy(s):
    s = re.sub(r"_([^_]+)_", r"\1", s)        # Gutenberg _italics_
    s = s.replace("_", "")
    s = re.sub(r"\[\d+\]", "", s)              # footnote markers
    s = s.replace("--", " - ")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    s = re.sub(r"- -", "-", s)
    return s.strip()


def clean(s):
    return tidy(to_ascii(s))


def fetch(url, cache_dir, name):
    path = os.path.join(cache_dir, name)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read().decode("utf-8", errors="replace")
    with open(path, "w", encoding="utf-8") as f:
        f.write(data)
    return data


def book_doc(key, cache_dir):
    meta = BOOKS[key]
    pg = meta["pg"]
    raw = fetch(f"https://www.gutenberg.org/cache/epub/{pg}/pg{pg}.txt", cache_dir, f"pg{pg}.txt")
    raw = raw.replace("\r", "")
    start = raw.find("*** START OF")
    end = raw.find("*** END OF")
    if start != -1:
        raw = raw[raw.find("\n", start) + 1:]
    if end != -1:
        raw = raw[: raw.find("*** END OF")]
    paras = []
    for p in re.split(r"\n\s*\n", raw):
        p = " ".join(line.strip() for line in p.split("\n"))
        if meta.get("brackets") == "drop":      # editor's commentary, e.g. Giles's notes on Sun Tzu
            while re.search(r"\[[^\[\]]*\]", p):
                p = re.sub(r"\s*\[[^\[\]]*\]", "", p)
        elif meta.get("brackets") == "unwrap":  # translator's added words: keep the words
            p = p.replace("[", "").replace("]", "")
        p = clean(p)
        if meta.get("numbered"):
            p = re.sub(r"^[0-9IVXL]+\.\s+", "", p)
        if p:
            paras.append(p)
    return "\n\n".join(paras)


def cut(doc, start, end, nth=1, widen=True):
    """Text from the nth `start` to the end of `end` (or end of paragraph), widened over quote marks."""
    start, end = clean(start), clean(end) if end else None
    i = -1
    for _ in range(nth):
        i = doc.find(start, i + 1)
        if i == -1:
            raise LookupError(f"start not found: {start!r}")
    if end is None:
        j = doc.find("\n\n", i)
        j = len(doc) if j == -1 else j
    else:
        j = doc.find(end, i)
        if j == -1 or j - i > 2500:
            raise LookupError(f"end not found near start: {end!r}")
        j += len(end)
    # Keep quotation marks balanced: include an opening quote right before the
    # start and closing quotes right after the end.
    if widen and i > 0 and doc[i - 1] in "\"'":
        i -= 1
    while widen and j < len(doc) and doc[j] in "\"'":
        j += 1
    text = doc[i:j].replace("\n\n", " ")
    return text[0].upper() + text[1:]


def wiki_intro(title, max_words, cache_dir):
    params = {
        "action": "query", "format": "json", "formatversion": "2", "redirects": "1",
        "prop": "extracts|revisions|info", "inprop": "url", "exintro": "1",
        "explaintext": "1", "rvprop": "ids", "titles": title,
    }
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params)
    data = json.loads(fetch(url, cache_dir, "wiki-" + re.sub(r"\W+", "_", title) + ".json"))
    page = data["query"]["pages"][0]
    extract = page["extract"]

    def drop_paren(m):
        inner = m.group(1)
        # A leading space means the API stripped a template (usually a pronunciation).
        if NON_LATIN.search(inner) or re.search(r"pronounced|listen|IPA|^\W*$|^\s", inner):
            return ""
        return m.group(0)

    for _ in range(2):  # nested parentheses
        extract = re.sub(r"\s?\(([^()]*)\)", drop_paren, extract)
    extract = re.sub(r"\(\s*[;,]\s*", "(", extract)
    extract = re.sub(chr(0x00d7) + r"10(\d{1,3})\b", r"x10^\1", extract)  # plain-text extract flattens 10<sup>8</sup>
    words, out = 0, []
    for para in extract.split("\n"):
        sentences = []
        for piece in re.split(r"(?<=[.!?])\s+(?=[A-Z\"'])", para.strip()):
            if sentences and re.search(r"\b[A-Z]\.$", sentences[-1]):  # "Frank E." is an initial
                sentences[-1] += " " + piece
            else:
                sentences.append(piece)
        for sentence in sentences:
            n = len(sentence.split())
            if NON_LATIN.search(to_ascii(sentence)):  # e.g. an etymology in Greek
                continue
            if not sentence or (out and words + n > max_words):
                break
            out.append(sentence)
            words += n
        else:
            continue
        break
    text = clean(" ".join(out))
    return text, page["title"], page["revisions"][0]["revid"], page["fullurl"]


# -------------------------------------------------------------------- main ---

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(tempfile.gettempdir(), "rt100-cache"))
    ap.add_argument("--find", nargs=2, metavar=("BOOK", "PHRASE"))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    if args.find:
        doc = book_doc(args.find[0], args.cache)
        needle = clean(args.find[1]).lower()
        for p in doc.split("\n\n"):
            if needle in p.lower():
                print(f"[{len(p.split())} words] {p}\n")
        return

    texts, failed, seen = [], [], set()
    for entry in QUOTES:
        key, start, end, themes = entry[:4]
        opts = entry[4] if len(entry) > 4 else {}
        meta = BOOKS[key]
        try:
            text = cut(book_doc(key, args.cache), start, end, opts.get("nth", 1), opts.get("widen", True))
        except LookupError as e:
            failed.append(f"{key}: {e}")
            continue
        for old, new in opts.get("fix", []):  # e.g. a chapter's opening word set in capitals
            text = text.replace(old, new, 1)
        bad = sorted({c for c in text if not (32 <= ord(c) < 127)})
        if bad:
            failed.append(f"{key}: non-ASCII {bad} in {text[:50]!r}")
            continue
        texts.append({
            "id": f"{key}-{slug(start)}" + ("-2" if f"{key}-{slug(start)}" in seen else ""),
            "text": text,
            "author": meta["author"],
            "work": opts.get("work", meta["work"]),
            "year": opts.get("year", meta["year"]),
            "themes": themes.split(","),
            "source": "Project Gutenberg",
            "url": f"https://www.gutenberg.org/ebooks/{meta['pg']}",
            "license": "Public domain",
        })
        seen.add(texts[-1]["id"])

    for title, themes, max_words in WIKI:
        try:
            text, real_title, revid, url = wiki_intro(title, max_words, args.cache)
        except (KeyError, IndexError, LookupError) as e:
            failed.append(f"wikipedia {title}: {e}")
            continue
        bad = sorted({c for c in text if not (32 <= ord(c) < 127)})
        if bad:
            failed.append(f"wikipedia {title}: non-ASCII {bad}")
            continue
        texts.append({
            "id": f"wiki-{slug(real_title)}",
            "text": text,
            "author": "Wikipedia contributors",
            "work": f"Wikipedia: {real_title}",
            "year": None,
            "themes": themes.split(","),
            "source": "Wikipedia",
            "url": f"{url}?oldid={revid}",
            "license": "CC BY-SA 4.0",
        })

    for t in texts:
        t["words"] = len(t["text"].split())

    ids = [t["id"] for t in texts]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        failed.append(f"duplicate ids: {sorted(dupes)}")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_texts.py - do not edit by hand.\n")
        f.write("// Project Gutenberg texts are public domain. Wikipedia excerpts are licensed\n")
        f.write("// CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); each entry links\n")
        f.write("// to the article revision it was taken from, lightly edited for typing.\n")
        f.write("window.TEXTS = ")
        json.dump(texts, f, indent=1, ensure_ascii=True)
        f.write(";\n")

    print(f"wrote {len(texts)} texts to {os.path.relpath(OUT, ROOT)}")
    if failed:
        print(f"\n{len(failed)} problems:")
        for msg in failed:
            print("  " + msg)
        sys.exit(1)


if __name__ == "__main__":
    main()
