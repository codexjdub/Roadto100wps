// The site's own files: every script is loaded, and the version is the same everywhere.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, read } = require("./helpers");

const html = read("index.html");
const version = JSON.parse(read("version.json")).version;

test("index.html loads every script in js/, once, with app.js last", () => {
  const loaded = [...html.matchAll(/<script src="js\/([\w.-]+\.js)\?v=[^"]+"><\/script>/g)].map((m) => m[1]);
  const files = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js"));
  assert.deepEqual([...loaded].sort(), [...files].sort());
  assert.equal(loaded[loaded.length - 1], "app.js");
});

test("the version in index.html matches version.json, on every file link", () => {
  assert.match(html, new RegExp(`window\\.APP_VERSION = "${version.replace(".", "\\.")}";`));
  const links = [...html.matchAll(/(?:src|href)="(?:js\/[\w.-]+\.js|style\.css)\?v=([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 10);
  for (const v of links) assert.equal(v, version);
});

test("source files use escapes rather than literal non-ASCII characters", () => {
  for (const f of ["index.html", "style.css", ...fs.readdirSync(path.join(ROOT, "js")).map((f) => `js/${f}`)]) {
    if (f === "js/texts.js") continue;
    assert.match(read(f), /^[\x00-\x7f]*$/, `${f} has a literal non-ASCII character`);
  }
});
