import { useState, useEffect } from "react"

export type ThemeMode = "light" | "dark"

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light"
    const stored = localStorage.getItem("theme") as ThemeMode | null
    if (stored === "dark") return "dark"
    return "light"
  })

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light"
    return document.documentElement.classList.contains("dark") ? "dark" : "light"
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
      setResolvedTheme("dark")
    } else {
      root.classList.remove("dark")
      setResolvedTheme("light")
    }
  }, [theme])

  const setThemeMode = (mode: ThemeMode) => {
    setTheme(mode)
    localStorage.setItem("theme", mode)
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
