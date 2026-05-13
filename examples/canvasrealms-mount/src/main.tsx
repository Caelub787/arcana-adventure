import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@arcana/library-dialogs/theme.css";
import "./canvasrealms-skin.css";

createRoot(document.getElementById("root")!).render(<App />);
