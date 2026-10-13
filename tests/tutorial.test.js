// Lesson targets (js/tutorial.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers");

const ctx = load(["js/tutorial.js"]);
const lesson = (id) => ctx.RT.tutorial.LESSONS.find((l) => l.id === id);

test("the Shift lesson needs Shift presses: capitals typed with Caps Lock don't pass", () => {
  const step = lesson("L5").steps[0];
  const run = (opp, same) => ({ acc: 98, shift: { opp, same } });
  assert.equal(step.check(run(0, 0)), false, "no Shift presses at all");
  assert.match(step.explain(run(0, 0)), /Caps Lock/);
  assert.equal(step.check(run(9, 1)), true);
  assert.equal(step.check(run(8, 2)), false, "under 90% with the opposite Shift");
  assert.equal(step.explain(run(8, 2)), null);
});
