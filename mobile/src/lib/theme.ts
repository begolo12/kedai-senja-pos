export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "tera-theme.v1";

export function getThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    // ignore storage access errors
  }
  return "system";
}

export function getEffectiveTheme(mode: ThemeMode = getThemeMode()): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") {
    root.dataset.theme = mode;
  } else {
    delete root.dataset.theme;
  }
  const effective = getEffectiveTheme(mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", effective === "dark" ? "#12151a" : "#ffffff");
  }
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // ignore storage access errors
  }
  applyTheme(mode);
}

export function initTheme() {
  applyTheme(getThemeMode());
  if (typeof window === "undefined" || !window.matchMedia) return;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => {
    if (getThemeMode() === "system") {
      applyTheme("system");
    }
  };
  mq.addEventListener?.("change", listener);
}
