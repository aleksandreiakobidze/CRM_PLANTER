"use client";

import { useTheme } from "@/context/theme-context";

export function ThemeToggle({ className = "secondary theme-toggle" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button type="button" className={className} onClick={toggleTheme} aria-label={theme === "dark" ? "ნათელი რეჟიმი" : "მუქი რეჟიმი"}>
      {theme === "dark" ? "ნათელი" : "მუქი"}
    </button>
  );
}
