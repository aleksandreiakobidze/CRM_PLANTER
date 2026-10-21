"use client";

import { Moon, Sun } from "@/components/icons";
import { useTheme } from "@/context/theme-context";

export function ThemeToggle({ className = "secondary theme-toggle" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const label = "თემის შეცვლა";
  return (
    <button type="button" className={className} onClick={toggleTheme} aria-label={label} title={label}>
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
