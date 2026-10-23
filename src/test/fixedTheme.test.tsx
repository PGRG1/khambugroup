import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/components/theme/ThemeProvider";

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return <button onClick={() => setTheme("dark")}>{theme}/{resolvedTheme}</button>;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.unstubAllGlobals();
});

describe("fixed portal theme", () => {
  it("ignores and clears a saved dark preference before paint", () => {
    localStorage.setItem("khambu.theme", "dark");
    document.documentElement.classList.add("dark");
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem("khambu.theme")).toBeNull();
  });

  it("does not consult or subscribe to OS dark settings", () => {
    localStorage.setItem("khambu.theme", "system");
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal("matchMedia", matchMedia);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole("button").textContent).toBe("light/light");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("cannot activate dark via the compatibility setter", () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("light/light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});