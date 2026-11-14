import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// After a new version is published, old screen files no longer exist.
// Reload once to pick up the fresh version instead of showing a blank screen.
const RELOAD_KEY = "bani:chunk-reload-at";
function reloadForStaleChunk() {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 10_000) return; // avoid reload loops
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
}
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadForStaleChunk();
});
window.addEventListener("unhandledrejection", (event) => {
  const msg = String((event.reason as Error)?.message ?? event.reason ?? "");
  if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg)) {
    event.preventDefault();
    reloadForStaleChunk();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
