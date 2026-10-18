"use client";

import { useState, useEffect } from "react";

type Theme = "dark" | "light";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fi-theme") as Theme | null;
      if (saved === "light") {
        setTheme("light");
        document.documentElement.setAttribute("data-theme", "light");
      }
    } catch { /* silent */ }
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("fi-theme", next); } catch { /* silent */ }
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "6px 10px",
        cursor: "pointer",
        fontSize: 14,
        lineHeight: 1,
        color: "var(--text-primary)",
        transition: "background 0.15s",
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
