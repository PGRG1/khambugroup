import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/tables.css";
import { installStaleChunkRecovery } from "./utils/staleChunkRecovery";

// After a new version is published, old screen files no longer exist.
// Reload once to pick up the fresh version instead of showing a blank screen.
installStaleChunkRecovery(window);

createRoot(document.getElementById("root")!).render(<App />);
