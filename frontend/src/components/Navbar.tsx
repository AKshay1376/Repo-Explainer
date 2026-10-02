import React, { useState } from "react"
import { TerminalIcon, GithubIcon, RotateCcwIcon, MenuIcon, XIcon, SunIcon, MoonIcon } from "./ui/icons"
import { useTheme } from "../lib/theme"

interface NavbarProps {
  onReset?: () => void
  hasAnalysis?: boolean
}

export const Navbar: React.FC<NavbarProps> = ({ onReset, hasAnalysis }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const { resolvedTheme, toggleTheme } = useTheme()

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <header
      className={`sticky top-0 z-40 w-full transition-all duration-200 ${
        isScrolled ? "apple-glass-nav" : "apple-glass-nav-top"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand */}
        <button
          onClick={onReset}
          className="flex items-center gap-2.5 text-left transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand rounded-lg p-1"
          aria-label="Repo Explainer Home"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white shadow-subtle">
            <TerminalIcon className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight text-ink">
                Repo Explainer
              </span>
              <span className="rounded-full border border-brand-border/50 bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-text">
                v2.0
              </span>
            </div>
          </div>
        </button>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-ink-secondary" aria-label="Main Navigation">
          <button
            onClick={() => scrollTo("product-overview")}
            className="transition-colors hover:text-brand cursor-pointer focus-visible:outline-none focus-visible:text-brand focus-visible:underline underline-offset-4"
          >
            Overview
          </button>
          <button
            onClick={() => scrollTo("product-capabilities")}
            className="transition-colors hover:text-brand cursor-pointer focus-visible:outline-none focus-visible:text-brand focus-visible:underline underline-offset-4"
          >
            Capabilities
          </button>
          <button
            onClick={() => scrollTo("product-architecture")}
            className="transition-colors hover:text-brand cursor-pointer focus-visible:outline-none focus-visible:text-brand focus-visible:underline underline-offset-4"
          >
            Architecture
          </button>
          <button
            onClick={() => scrollTo("product-security")}
            className="transition-colors hover:text-brand cursor-pointer focus-visible:outline-none focus-visible:text-brand focus-visible:underline underline-offset-4"
          >
            Security Standard
          </button>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2.5">
          {/* Subtle Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full apple-glass-control text-ink-secondary hover:text-ink shadow-subtle cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {resolvedTheme === "dark" ? (
              <SunIcon className="h-4 w-4 text-brand" strokeWidth={1.75} />
            ) : (
              <MoonIcon className="h-4 w-4 text-ink-secondary" strokeWidth={1.75} />
            )}
          </button>

          {hasAnalysis && onReset && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-full apple-glass-control px-3.5 py-1.5 text-xs font-medium text-ink shadow-subtle cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
            >
              <RotateCcwIcon className="h-3 w-3 text-brand" />
              <span>New Analysis</span>
            </button>
          )}

          <a
            href="https://github.com/psf/requests"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-full apple-glass-control px-3.5 py-1.5 text-xs font-medium text-ink shadow-subtle focus-visible:ring-2 focus-visible:ring-brand"
          >
            <GithubIcon className="h-3.5 w-3.5 text-ink" strokeWidth={1.5} />
            <span>GitHub</span>
          </a>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden inline-flex items-center justify-center rounded-lg p-1.5 text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <XIcon className="h-5 w-5" />
            ) : (
              <MenuIcon className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown with Glass Treatment */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-line apple-glass-nav px-6 py-4 space-y-4">
          <div className="flex flex-col space-y-2.5 text-sm font-medium text-ink">
            <button
              onClick={() => scrollTo("product-overview")}
              className="text-left py-1 text-ink-secondary hover:text-brand transition-colors"
            >
              Overview
            </button>
            <button
              onClick={() => scrollTo("product-capabilities")}
              className="text-left py-1 text-ink-secondary hover:text-brand transition-colors"
            >
              Capabilities
            </button>
            <button
              onClick={() => scrollTo("product-architecture")}
              className="text-left py-1 text-ink-secondary hover:text-brand transition-colors"
            >
              Architecture
            </button>
            <button
              onClick={() => scrollTo("product-security")}
              className="text-left py-1 text-ink-secondary hover:text-brand transition-colors"
            >
              Security Standard
            </button>
          </div>

          <div className="pt-3 border-t border-line flex items-center justify-between text-xs text-ink-secondary">
            <span>Appearance</span>
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 rounded-full apple-glass-control px-3 py-1 text-xs font-medium text-ink"
            >
              {resolvedTheme === "dark" ? (
                <>
                  <SunIcon className="h-3.5 w-3.5 text-brand" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <MoonIcon className="h-3.5 w-3.5 text-ink-secondary" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

export default Navbar

