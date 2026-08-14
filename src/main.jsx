// src/main.jsx
import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { initializeGoogleAnalytics } from "./lib/googleAnalytics.js";
import "./index.css";

initializeGoogleAnalytics();

// When a new version deploys, old page code-split chunks (e.g. Results.js)
// get replaced with new hashed filenames. A visitor who already had the
// site open, then clicks somewhere that lazy-loads a route they haven't
// visited yet, ends up requesting a chunk file that no longer exists (404)
// and hits a blank white page. Vite fires this event when that happens;
// reload once to pick up the current build instead of leaving them stuck.
window.addEventListener("vite:preloadError", () => {
  const key = "hf-last-preload-reload-at";
  const last = Number(sessionStorage.getItem(key) || 0);
  const now = Date.now();
  // Only suppress a repeat reload within 10s of the last one, so this can't
  // loop forever on a genuinely broken deploy, but still protects visitors
  // again if it happens later (e.g. across a future deploy in a long-lived
  // tab).
  if (now - last < 10000) return;
  sessionStorage.setItem(key, String(now));
  window.location.reload();
});

const rootElement = document.getElementById("root");
const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Home is eagerly imported by the browser app, so its server tree can hydrate
// exactly. Other indexable routes are code-split: their crawler-visible build
// snapshot is replaced with a normal client root instead of attempting to
// hydrate through a lazy Suspense boundary with a different server tree.
if (
  rootElement.dataset.prerenderedRoute === "/" &&
  window.location.pathname === "/"
) {
  hydrateRoot(rootElement, app);
} else {
  rootElement.replaceChildren();
  createRoot(rootElement).render(app);
}
