import { readFile, rm, writeFile } from "node:fs/promises";
import { render } from "../dist/server/entry-server.js";

const indexPath = new URL("../dist/index.html", import.meta.url);
const spaPath = new URL("../dist/spa.html", import.meta.url);
const serverPath = new URL("../dist/server", import.meta.url);
const rootPlaceholder = '<div id="root"></div>';

const shell = await readFile(indexPath, "utf8");
const stylesheetMatch = shell.match(
  /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i
);

if (!shell.includes(rootPlaceholder)) {
  throw new Error("Could not find the Vite root placeholder in dist/index.html.");
}

if (!stylesheetMatch || !stylesheetMatch[1].startsWith("/assets/")) {
  throw new Error("Could not find the generated Vite stylesheet in dist/index.html.");
}

const stylesheetPath = new URL(`../dist${stylesheetMatch[1]}`, import.meta.url);
const stylesheet = await readFile(stylesheetPath, "utf8");
const homepageShell = shell.replace(
  stylesheetMatch[0],
  `<style data-home-styles>${stylesheet.replace(/<\/style/gi, "<\\/style")}</style>`
);
const homepage = homepageShell.replace(
  rootPlaceholder,
  `<div id="root" data-prerendered-home="true">${render("/")}</div>`
);

// Keep an empty shell for every client-routed URL. This prevents homepage
// content from appearing in raw dog/profile HTML while still letting `/`
// paint meaningful content before JavaScript runs. Only the homepage gets the
// generated stylesheet inline, removing its final render-blocking request
// without changing CSS delivery or caching for direct visits to other routes.
await writeFile(spaPath, shell);
await writeFile(indexPath, homepage);
await rm(serverPath, { recursive: true, force: true });

console.log("Prerendered homepage with inline styles and wrote dist/spa.html.");
