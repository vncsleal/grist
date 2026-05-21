import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/app/App";
import { initTheme } from "./components/app/useTheme";
import "./styles/global.css";

initTheme();

const container = document.getElementById("root");

if (!container) {
  throw new Error('Missing root element "#root".');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
