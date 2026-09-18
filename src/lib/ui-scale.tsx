/**
 * Globaler Größenregler (UI-Scale).
 *
 * Setzt die CSS-Variable --ui-scale auf <html>, wodurch die gesamte
 * rem-basierte Oberfläche kleiner/größer wird. Ziel: Größe live ausprobieren,
 * bevor die finale Größe festgelegt wird. Persistiert in localStorage.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.35;
export const UI_SCALE_DEFAULT = 1;
export const UI_SCALE_STEP = 0.05;

/** Voreinstellungen für schnelle, verlässliche Auswahl. */
export const UI_SCALE_PRESETS: { label: string; value: number }[] = [
  { label: "Kompakt", value: 0.9 },
  { label: "Standard", value: 1 },
  { label: "Groß", value: 1.1 },
  { label: "Größer", value: 1.25 },
];
const STORAGE_KEY = "hv.ui-scale";

type UIScaleContextValue = {
  scale: number;
  setScale: (value: number) => void;
  reset: () => void;
};

const UIScaleContext = createContext<UIScaleContextValue | null>(null);

function clamp(value: number) {
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, value));
}

export function UIScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState(UI_SCALE_DEFAULT);

  // Beim Mount gespeicherten Wert laden (nur im Browser).
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number.parseFloat(stored);
      if (!Number.isNaN(parsed)) setScaleState(clamp(parsed));
    }
  }, []);

  // Bei jeder Änderung CSS-Variable + Persistenz aktualisieren.
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(scale));
    window.localStorage.setItem(STORAGE_KEY, String(scale));
  }, [scale]);

  const setScale = (value: number) => setScaleState(clamp(value));
  const reset = () => setScaleState(UI_SCALE_DEFAULT);

  return (
    <UIScaleContext.Provider value={{ scale, setScale, reset }}>{children}</UIScaleContext.Provider>
  );
}

export function useUIScale() {
  const ctx = useContext(UIScaleContext);
  if (!ctx) throw new Error("useUIScale muss innerhalb von UIScaleProvider genutzt werden");
  return ctx;
}
