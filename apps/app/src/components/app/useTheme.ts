import { useEffect, useState } from "react";

const STORAGE_KEY = "quillby_theme";

function applyTheme(theme: "light" | "dark") {
  const html = document.documentElement;
  html.classList.toggle("dark", theme === "dark");
  html.classList.toggle("light", theme === "light");
  html.setAttribute("data-theme", theme);
}

/** Returns the resolved preference saved in localStorage, falling back to OS preference. */
export function getStoredTheme(): "light" | "dark" {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* ignore */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Call once at startup (before React renders) to avoid a flash of wrong theme. */
export function initTheme() {
  applyTheme(getStoredTheme());
}

export function useTheme(): [theme: "light" | "dark", setTheme: (t: "light" | "dark") => void] {
  const [theme, setThemeState] = useState<"light" | "dark">(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  return [theme, setThemeState];
}
