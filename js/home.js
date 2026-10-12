// Home: the first page you see, always showing one clear next step.
(function () {
  const RT = (window.RT = window.RT || {});

  function startingSpeed() {
    RT.store.set("mode", "words");
    RT.store.set("seconds", 60);
    RT.store.set("wordList", "200");
    location.hash = "#/type";
  }

  function nextLesson() {
    return RT.tutorial.LESSONS.find((l) => !RT.store.lesson(l.id).done) || null;
  }

  function render(main) {
    const h = RT.ui.h;
    const sessions = RT.store.sessions();
    const core = sessions.filter((s) => s.mode !== "lesson");
    const routine = RT.routine.status();
    const lessonsDone = RT.tutorial.LESSONS.filter((l) => RT.store.lesson(l.id).done).length;

    // Getting started: until you've measured your speed and tried the routine once.
    const measured = core.some((s) => s.mode === "words" && s.seconds === 60) || core.length >= 3;
    const triedRoutine = RT.store.routineDays().length > 0 || routine.started;
    main.innerHTML = "";

    if (!measured || !triedRoutine) {
      const steps = [
        {
          title: "Measure your starting speed",
          text: "One 60-second test with common words, so you can see your progress later.",
          done: measured, action: startingSpeed, label: "Start the test",
        },
        {
          title: "Do the daily routine",
          text: "About 20 minutes a day: a warm-up, fast and careful runs, and real text. This is where most of your progress comes from.",
          done: triedRoutine, action: () => { location.hash = "#/routine"; }, label: "Start the routine",
        },
        {
          title: "Work through the lessons",
          text: `Seven short lessons on technique, each with a target to pass${lessonsDone ? ` (${lessonsDone} of 7 done)` : ""}.`,
          done: lessonsDone === RT.tutorial.LESSONS.length, action: () => { location.hash = "#/learn"; }, label: "Open the lessons",
        },
      ];
      const next = steps.find((st) => !st.done);
      main.append(
        h("h1", {}, "Welcome to Road to 100"),
        h("p", { class: "ink-2" }, "This trainer finds what slows your typing down and builds practice around it. Here's the plan:"),
        h("ol", { class: "plan" }, steps.map((st) => h("li", { class: st.done ? "done" : st === next ? "next" : "" },
          h("div", { class: "plan-title" }, st.done ? "\u2713 " : "", st.title),
          h("div", { class: "plan-text" }, st.text),
          st === next ? h("button", { class: "btn primary", type: "button", onclick: st.action }, st.label, " ", h("kbd", {}, "enter")) : null,
        ))),
        h("p", { class: "small" }, "Just want to type? ", h("a", { href: "#/type" }, "Free practice \u2192")),
      );
      RT.app.setActive(next ? { onEnter: next.action } : null);
      return;
    }

    // Every day after that: the routine first, then everything else.
    const avg = RT.stats.recentAverage(core);
    const go = () => { location.hash = "#/routine"; };
    let card;
    if (routine.done) {
      card = h("div", { class: "card today done" },
        h("div", { class: "today-title" }, "\u2713 Daily routine done for today"),
        h("p", { class: "ink-2" }, "Nice work. Come back tomorrow, or keep going with free practice or a lesson."),
        h("a", { class: "btn", href: "#/routine" }, "See today's summary"));
    } else {
      card = h("div", { class: "card today" },
        h("div", { class: "today-title" }, "Daily routine"),
        h("p", { class: "ink-2" }, routine.started
          ? `${routine.doneRuns} of ${routine.total} runs done. Pick up where you left off.`
          : "About 20 minutes: a warm-up, fast and careful runs, trouble words and real text."),
        h("button", { class: "btn primary", type: "button", onclick: go }, routine.started ? "Continue" : "Start", " ", h("kbd", {}, "enter")));
    }
    const facts = [];
    if (avg) facts.push(h("span", {}, h("strong", {}, `${Math.round(avg)} WPM`), " average", avg < 100 ? ` \u00b7 ${Math.round(100 - avg)} to go` : " \u00b7 goal reached"));
    if (routine.streak) facts.push(h("span", {}, `${routine.streak}-day streak`));
    const lesson = nextLesson();
    const idx = lesson ? RT.tutorial.LESSONS.indexOf(lesson) + 1 : 0;

    const calendar = h("div");
    RT.calendar.render(calendar);
    main.append(
      h("h1", {}, "Today"),
      card,
      h("p", { class: "today-facts" }, facts.map((f, k) => [k ? " \u00b7 " : "", f])),
      calendar,
      h("ul", { class: "today-links" },
        lesson
          ? h("li", {}, "Next lesson: ", h("a", { href: `#/learn/${lesson.id}` }, `${idx}. ${lesson.title} \u2192`))
          : h("li", {}, "\u2713 All 7 lessons passed. ", h("a", { href: "#/learn" }, "Revisit them \u2192")),
        h("li", {}, "Just want to type? ", h("a", { href: "#/type" }, "Free practice \u2192")),
        h("li", {}, "How it's going: ", h("a", { href: "#/progress" }, "Progress \u2192")),
      ),
    );
    RT.app.setActive(routine.done ? null : { onEnter: go });
  }

  RT.home = { render };
})();
