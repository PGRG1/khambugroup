import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installChunkRecovery } from "./utils/chunkRecovery";

installChunkRecovery();

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
