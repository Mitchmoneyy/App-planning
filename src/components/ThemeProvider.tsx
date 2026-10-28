"use client";

/**
 * Light / dark mode. Follows the device setting by default; the user can pick
 * light or dark explicitly (remembered on this device). The globe listens to
 * `theme` to cross-fade between day and night Earth.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const STORAGE_KEY = "gs-theme";

/**
 * Runs before the page paints (inlined in <head>) so there's no flash of the
 * wrong theme. Keep in sync with the logic below.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})()`;

interface ThemeContext {
  pref: ThemePref;
  theme: Theme;
  setPref(pref: ThemePref): void;
  toggle(): void;
}

const Ctx = createContext<ThemeContext | null>(null);

const systemTheme = (): Theme => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from what the boot script already applied, so first render matches.
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser-only state after mount */
    setPrefState(readPref());
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const apply = useCallback((next: Theme) => {
    const root = document.documentElement;
    if (root.dataset.theme === next) return setTheme(next);
    root.classList.add("theme-transition");
    root.dataset.theme = next;
    setTheme(next);
    window.setTimeout(() => root.classList.remove("theme-transition"), 700);
  }, []);

  // Follow the device setting while in "system" mode.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(systemTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref, apply]);

  const setPref = useCallback(
    (next: ThemePref) => {
      try {
        if (next === "system") localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage blocked: still switch for this visit
      }
      setPrefState(next);
      apply(next === "system" ? systemTheme() : next);
    },
    [apply],
  );

  const toggle = useCallback(() => setPref(theme === "dark" ? "light" : "dark"), [theme, setPref]);

  const value = useMemo(() => ({ pref, theme, setPref, toggle }), [pref, theme, setPref, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/** Sun / moon button. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={`icon-pill ${className}`}
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
