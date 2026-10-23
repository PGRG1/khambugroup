import { createContext, useContext, useLayoutEffect, ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
}

const STORAGE_KEY = "khambu.theme";
const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const applyFixedTheme = () => {
  const root = document.documentElement;
  root.classList.remove("dark");
  root.style.colorScheme = "light";
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  // Lock before paint; old local/profile preferences and OS settings are ignored.
  useLayoutEffect(applyFixedTheme, []);

  return (
    <ThemeContext.Provider value={{ theme: "light", resolvedTheme: "light", setTheme: applyFixedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
