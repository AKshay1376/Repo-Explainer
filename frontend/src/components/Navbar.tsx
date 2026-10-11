import React from "react"
import { TerminalIcon, GithubIcon, RotateCcwIcon, SunIcon, MoonIcon } from "./ui/icons"
import { useTheme } from "../lib/theme"

interface NavbarProps {
  onReset?: () => void
  hasAnalysis?: boolean
  onSettings?: () => void
}

export const Navbar: React.FC<NavbarProps> = ({ onReset, hasAnalysis, onSettings }) => {
  const { resolvedTheme, toggleTheme } = useTheme()
  return <header className="sticky top-0 z-40 w-full border-b border-line bg-canvas/95 backdrop-blur">
    <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-2 px-3 py-3 sm:px-6">
      <button onClick={onReset} aria-label="Repo Explainer Home" className="flex min-w-0 items-center gap-2 rounded-lg p-1 text-left focus-visible:ring-2 focus-visible:ring-brand">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white"><TerminalIcon className="h-4 w-4" strokeWidth={2} /></span>
        <span className="truncate text-sm font-semibold text-ink">Repo Explainer</span>
        <span className="hidden rounded-full border border-brand-border/50 bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-text sm:inline">v2.0</span>
      </button>
      <nav aria-label="Application actions" className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <button onClick={onSettings} aria-label="Settings" className="rounded-full border border-line px-2 py-1.5 text-xs text-ink focus-visible:ring-2 focus-visible:ring-brand sm:px-3">Settings</button>
        <button onClick={toggleTheme} aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`} className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-secondary focus-visible:ring-2 focus-visible:ring-brand">
          {resolvedTheme === "dark" ? <SunIcon className="h-4 w-4 text-brand" /> : <MoonIcon className="h-4 w-4" />}
        </button>
        {hasAnalysis && onReset && <button onClick={onReset} aria-label="New Analysis" title="New Analysis" className="flex h-8 items-center gap-1.5 rounded-full border border-line px-2 text-xs text-ink focus-visible:ring-2 focus-visible:ring-brand sm:px-3"><RotateCcwIcon className="h-4 w-4 text-brand" /><span className="hidden sm:inline">New Analysis</span></button>}
        <a href="https://github.com/AKshay1376/Repo-Explainer" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="hidden h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-ink sm:flex"><GithubIcon className="h-4 w-4" /><span>GitHub</span></a>
      </nav>
    </div>
  </header>
}

export default Navbar
