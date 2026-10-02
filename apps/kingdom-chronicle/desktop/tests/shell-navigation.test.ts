import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const rendererRoot = path.resolve(import.meta.dirname, "../src/renderer");

async function readStyleEntry(entryPath: string) {
  const entry = await readFile(entryPath, "utf8");
  const imports = [...entry.matchAll(/@import\s+["']([^"']+)["'];/g)];
  return (await Promise.all(imports.map((match) => readFile(path.resolve(path.dirname(entryPath), match[1]), "utf8")))).join("\n");
}

test("desktop rail keeps navigation accessible when labels are collapsed", async () => {
  const [source, styles] = await Promise.all([
    readFile(path.join(rendererRoot, "main.tsx"), "utf8"),
    readStyleEntry(path.join(rendererRoot, "shell.css")),
  ]);

  assert.match(source, /className="desktop-menu-toggle"/);
  assert.match(source, /aria-controls="desktop-navigation-menu"/);
  assert.match(source, /NavigationGlyph icon="settings"/);
  assert.match(source, /NavigationGlyph icon="updates"/);
  assert.match(source, /NavigationGlyph icon="about"/);
  assert.doesNotMatch(source, />ST<\/span>|>UP<\/span>|>AB<\/span>/);
  assert.doesNotMatch(source, /inert=\{!menuOpen/);
  assert.match(source, /useState\(false\)/);
  assert.match(source, /aria-label=\{item.label\}/);
  assert.doesNotMatch(source, /\{menuOpen && <div id="desktop-navigation-menu"/);
  assert.match(styles, /\.desktop-sidebar\.open/);
  assert.match(styles, /\.desktop-sidebar:not\(\.open\) \.desktop-nav-copy/);
  assert.match(styles, /transition: opacity 90ms ease 135ms/);
  assert.match(styles, /\.desktop-nav::-webkit-scrollbar-thumb/);
  assert.doesNotMatch(styles, /desktop-menu-content-in|translateX\(-8px\)/);
  assert.match(styles, /\.desktop-workspace \{ min-width: 0; grid-column: 2; \}/);
});
