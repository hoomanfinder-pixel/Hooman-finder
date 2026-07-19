import { readFile, rm, writeFile } from "node:fs/promises";
import { render } from "../dist/server/entry-server.js";

const indexPath = new URL("../dist/index.html", import.meta.url);
const spaPath = new URL("../dist/spa.html", import.meta.url);
const serverPath = new URL("../dist/server", import.meta.url);
const rootPlaceholder = '<div id="root"></div>';

const shell = await readFile(indexPath, "utf8");

if (!shell.includes(rootPlaceholder)) {
  throw new Error("Could not find the Vite root placeholder in dist/index.html.");
}

const homepage = shell.replace(
  rootPlaceholder,
  `<div id="root" data-prerendered-home="true">${render("/")}</div>`
);

// Keep an empty shell for every client-routed URL. This prevents homepage
// content from appearing in raw dog/profile HTML while still letting `/`
// paint meaningful content before JavaScript runs.
await writeFile(spaPath, shell);
await writeFile(indexPath, homepage);
await rm(serverPath, { recursive: true, force: true });

console.log("Prerendered homepage and wrote dist/spa.html.");
