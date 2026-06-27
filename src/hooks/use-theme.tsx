import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem("ses-theme") as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const t = getInitial();
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);

  const update = (t: Theme) => {
    setTheme(t);
    window.localStorage.setItem("ses-theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
  };

  return { theme, setTheme: update, toggle: () => update(theme === "dark" ? "light" : "dark") };
}
