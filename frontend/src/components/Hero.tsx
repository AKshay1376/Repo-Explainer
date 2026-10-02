import React, { useState } from "react"
import { SearchIcon, ArrowRightIcon, AlertCircleIcon, CheckIcon } from "./ui/icons"

interface HeroProps {
  onAnalyze: (url: string) => void
  isLoading: boolean
  error?: string | null
  initialUrl?: string
  onClearError?: () => void
}

const SAMPLE_REPOS = [
  { label: "psf/requests", url: "https://github.com/psf/requests", desc: "Layered HTTP client" },
  { label: "pallets/flask", url: "https://github.com/pallets/flask", desc: "WSGI web microframework" },
  { label: "expressjs/express", url: "https://github.com/expressjs/express", desc: "Node.js router & middleware" },
]

export const Hero: React.FC<HeroProps> = ({
  onAnalyze,
  isLoading,
  error,
  initialUrl = "",
  onClearError,
}) => {
  const [url, setUrl] = useState(initialUrl)
  const [validationError, setValidationError] = useState<string | null>(null)

  React.useEffect(() => {
    if (initialUrl && !url) {
      setUrl(initialUrl)
    }
  }, [initialUrl])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)
    if (onClearError) onClearError()

    const trimmed = url.trim()
    if (!trimmed) {
      setValidationError("Please enter a valid GitHub repository URL.")
      return
    }

    const isFullUrl = trimmed.includes("github.com/")
    const isShorthand = /^[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/.test(trimmed)
    if (!isFullUrl && !isShorthand) {
      setValidationError("Enter a full URL or owner/repo shorthand (e.g. psf/requests)")
      return
    }

    onAnalyze(trimmed)
  }

  const handleSelectSample = (sampleUrl: string) => {
    setUrl(sampleUrl)
    setValidationError(null)
    if (onClearError) onClearError()
  }

  return (
    <section className="relative pt-20 pb-24 sm:pt-28 sm:pb-32 overflow-hidden border-b border-line bg-canvas">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-border/60 bg-brand-surface px-3.5 py-1 text-xs font-medium text-brand-text shadow-subtle mb-6 transition-colors">
          <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
          <span>Product Intelligence for Source Code</span>
        </div>

        {/* Hero statement with subtle brand emphasis */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tightest text-ink max-w-4xl mx-auto leading-[1.06]">
          Understand any <span className="text-brand">codebase</span> in seconds.
        </h1>

        {/* Hero description */}
        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-ink-secondary font-normal leading-relaxed">
          Transforms public GitHub repositories into structured architectural reports, entry-point call maps, and dependency insights. Grounded in source evidence.
        </p>

        {/* Interactive URL Form */}
        <div className="mx-auto mt-10 max-w-2xl">
          <form
            onSubmit={handleSubmit}
            className="relative flex flex-col sm:flex-row items-stretch sm:items-center rounded-2xl border border-line bg-ctrl-input p-2 shadow-card focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-all"
          >
            <div className="flex flex-1 items-center gap-3 pl-3 pr-2 py-1.5">
              <SearchIcon className="h-4 w-4 text-ink-tertiary shrink-0" strokeWidth={1.75} />
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (validationError) setValidationError(null)
                  if (onClearError) onClearError()
                }}
                placeholder="https://github.com/owner/repository"
                disabled={isLoading}
                aria-label="GitHub Repository URL"
                className="w-full bg-transparent text-sm text-ink placeholder-ink-tertiary outline-none disabled:opacity-50 font-normal"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-subtle transition-all hover:bg-brand-hover active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>{isLoading ? "Analyzing..." : "Analyze Repository"}</span>
              <ArrowRightIcon className="h-4 w-4" strokeWidth={2} />
            </button>
          </form>

          {validationError && (
            <p className="mt-2.5 text-left text-xs font-medium text-[#D70015] dark:text-[#FF453A] pl-2">
              {validationError}
            </p>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-left">
              <AlertCircleIcon className="h-4 w-4 text-[#D70015] dark:text-[#FF453A] shrink-0 mt-0.5" strokeWidth={2} />
              <div className="flex-1">
                <p className="text-xs font-semibold text-[#D70015] dark:text-[#FF453A]">Analysis Notice</p>
                <p className="mt-0.5 text-xs text-ink leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* Quick Selectors */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-ink-secondary">
            <span className="text-ink-tertiary">Verified samples:</span>
            {SAMPLE_REPOS.map((sample) => (
              <button
                key={sample.url}
                type="button"
                onClick={() => handleSelectSample(sample.url)}
                className="rounded-full apple-glass-control px-3 py-1 text-xs font-medium text-ink shadow-subtle cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span>{sample.label}</span>
                <span className="ml-1 text-[11px] text-ink-tertiary hidden md:inline">({sample.desc})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Real Product Showcase Frame with Restrained Brand Ambient Illumination */}
        <div className="relative mt-16 mx-auto max-w-4xl text-left">
          {/* Subtle brand glow behind preview */}
          <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(255,92,32,0.12),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(255,92,32,0.16),transparent_70%)] blur-2xl -z-10" />

          <div className="rounded-2xl border border-line dark:border-brand-border-subtle bg-surface p-2 shadow-float text-left transition-all">
            {/* Window Header */}
            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-2.5 bg-surface-inset rounded-t-xl">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56] border border-[#E0443E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] border border-[#DEA123]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F] border border-[#1AAB29]" />
                <span className="ml-3 font-mono text-xs text-ink-secondary">
                  report-preview — psf/requests
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft border border-brand-border/60 px-2 py-0.5 text-[10px] font-semibold text-brand-text">
                <CheckIcon className="h-3 w-3 text-brand" strokeWidth={2} />
                <span>Evidence Grounded</span>
              </div>
            </div>

            {/* Simulated Real Output Preview */}
            <div className="p-5 sm:p-7 space-y-4 font-mono text-xs text-ink bg-surface rounded-b-xl overflow-x-auto">
              <div className="flex flex-wrap items-center gap-2 font-sans pb-3 border-b border-line-subtle">
                <span className="font-semibold text-sm text-ink">requests</span>
                <span className="text-ink-tertiary">·</span>
                <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] text-ink-secondary">Python 3</span>
                <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] text-ink-secondary">51,000+ stars</span>
                <span className="rounded-full bg-surface-inset px-2 py-0.5 text-[11px] text-ink-secondary">8 files inspected</span>
              </div>

              <div>
                <p className="font-sans font-semibold text-xs text-ink mb-1.5">
                  Deterministic Architecture Model:
                </p>
                <pre className="p-3 bg-[#18181B] text-[#F4F4F5] rounded-lg overflow-x-auto leading-relaxed border border-line-subtle">
{`api.py (get/post/request)
  │
  ▼ constructs
sessions.py (Session / SessionRedirectMixin)
  │
  ▼ dispatches
models.py (Request ➔ PreparedRequest)
  │
  ▼ routes to
adapters.py (HTTPAdapter ➔ urllib3 connection pool)`}
                </pre>
              </div>

              <div className="font-sans text-xs text-ink-secondary flex items-center justify-between pt-1">
                <span>Classified with strict Fact / Inference boundaries.</span>
                <span className="text-[11px] text-ink-tertiary">Zero synthetic arrows</span>
              </div>
            </div>
          </div>
        </div>

        {/* Value metrics row */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 pt-8 border-t border-line-subtle text-left">
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-ink">0</div>
            <div className="text-xs text-ink-secondary mt-0.5">Secret leaks or token exposure</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-ink">AST</div>
            <div className="text-xs text-ink-secondary mt-0.5">Verified syntax & call relationships</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-brand">100%</div>
            <div className="text-xs text-ink-secondary mt-0.5">Deterministic fallback continuity</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-ink">5–15s</div>
            <div className="text-xs text-ink-secondary mt-0.5">Full repository synthesis latency</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero

