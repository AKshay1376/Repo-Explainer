import { useState, useEffect } from "react"

export type ThemeMode = "system" | "light" | "dark"

function preferredTheme(): "light" | "dark" {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system"
    const stored = localStorage.getItem("theme") as ThemeMode | null
    return stored === "dark" || stored === "light" ? stored : "system"
  })

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light"
    return document.documentElement.classList.contains("dark") ? "dark" : "light"
  })

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const resolved = theme === "system" ? preferredTheme() : theme
      root.classList.toggle("dark", resolved === "dark")
      setResolvedTheme(resolved)
    }
    apply()
    const listener = () => apply()
    window.addEventListener("repo-theme-changed", listener)
    const media = window.matchMedia?.("(prefers-color-scheme: dark)")
    media?.addEventListener?.("change", listener)
    return () => { window.removeEventListener("repo-theme-changed", listener); media?.removeEventListener?.("change", listener) }
  }, [theme])

  const setThemeMode = (mode: ThemeMode) => {
    setTheme(mode)
    localStorage.setItem("theme", mode)
    window.dispatchEvent(new Event("repo-theme-changed"))
  }

  const toggleTheme = () => {
    if (resolvedTheme === "dark") {
      setThemeMode("light")
    } else {
      setThemeMode("dark")
    }
  }

  return {
    theme,
    resolvedTheme,
    setThemeMode,
    toggleTheme,
  }
}
