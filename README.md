# Road to 100

A typing trainer for getting from the 60s to 100 words per minute. Beyond measuring your speed, it finds what slows you down: pauses before words, slow letter pairs, and typos along with how long they take to fix. Then it builds practice around those.

**Use it here:** https://codexjdub.github.io/Roadto100wps/

## What's in it

- **Home.** Always shows your next step. On a first visit: measure your starting speed, try the daily routine, then the lessons. After that: today's routine, your average and streak, and your next lesson.
- **Practice.** 15, 30 or 60 second word tests, scored the same way as Monkeytype so the numbers compare directly. Also quotes, paragraphs and long passages from classic books, *The Art of War* and Wikipedia, with an option to type them in lowercase without punctuation.
- **Results that explain themselves.** A per-second speed graph with each slowdown numbered and labelled (for example "right after a typo in 'between'"), what your typos cost, the words you paused on, and your slowest letter pairs.
- **Daily routine.** About 20 minutes in a set order: a weak-pair warm-up, 10 runs taking turns between pushing past your pace and typing cleanly, trouble words, real text, and a 60-second check once a week. It picks up where you left off that day, stops early if your accuracy drops (a sign you're tired), and keeps a streak.
- **Drills.** Words or sentences full of your slowest letter pairs, a trouble-word drill that brings back each word you hesitate on until you type it smoothly twice, and an optional pace cursor to race.
- **Lessons.** Seven short lessons (reading ahead, no stalls, typo recovery, common words, Shift and punctuation, push and clean, relaxed hands), each with an exercise and a target to pass.
- **Progress.** Speed, accuracy and consistency by day against the 100 WPM goal, plus your weak spots over time.

## Your data

Everything is saved in your browser's localStorage, and nothing is sent anywhere. Use **Export history** on the Progress page to back it up or move it to another computer.

## Running it locally

Open `index.html` in a browser. There's no build step and there are no dependencies.

## Tests

Two sets of tests, neither needing anything installed beyond Node and Chrome. GitHub runs both on every push (see the Actions tab).

- **Logic tests** for scoring, slowdown detection, letter pairs, drills, the text collection, saving and importing history, and the routine's steps:

  ```bash
  node --test tests/*.test.js
  ```

- **Browser tests** that load the real app and type into it: text never vanishing past five lines, results with nothing broken, typo costs, the theme button, a full daily routine, and no "null" or "NaN" on any page. Run them headless with `bash tools/browser_tests.sh`, or open `tests/browser.html` from any local web server to watch them run. They use separate test storage, so your history is never touched.

## Versions

The footer shows which version you're running, and tells you when the site has a newer one. Before pushing a change, run `python3 tools/bump_version.py <new version>`. It updates `version.json`, the version in `index.html`, and the `?v=` on every file link, so browsers load the new files instead of cached ones.

## Texts and licences

- Classic texts are in the public domain and come from [Project Gutenberg](https://www.gutenberg.org/). Each text is cut word for word from its source; only curly quotes, dashes and accented letters were changed to characters you can type.
- Wikipedia excerpts are by Wikipedia contributors, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). They were lightly edited for typing: pronunciations and non-English scripts were removed, and special characters were replaced. Each entry in `js/texts.js` links to the exact article revision used, and the edited excerpts are available under the same licence.
- `tools/build_texts.py` rebuilds `js/texts.js`. It downloads each source and cuts out the text between a start and an end phrase, so adding a quote means adding one line with its anchors.
