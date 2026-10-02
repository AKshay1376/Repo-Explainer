import React, { useState } from "react"
import { Navbar } from "./components/Navbar"
import { Hero } from "./components/Hero"
import { ProductStory } from "./components/ProductStory"
import { LoadingState } from "./components/LoadingState"
import { Dashboard, type AnalysisData } from "./components/Dashboard"
import { LegalModal, type LegalDocType } from "./components/LegalModal"
import { ShieldCheckIcon, TerminalIcon, GithubIcon, InstagramIcon } from "./components/ui/icons"

export const App: React.FC = () => {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [currentUrl, setCurrentUrl] = useState<string>("")
  const [data, setData] = useState<AnalysisData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null)

  const handleAnalyze = async (url: string) => {
    setCurrentUrl(url)
    setErrorMessage(null)
    setStatus("loading")

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        let msg = result.error || "AI analysis could not be completed. Please try again."
        if (response.status === 404) {
          msg = "Repository not found. Check the URL and try again."
        } else if (response.status === 429) {
          msg = "GitHub API rate limit reached. Please try again later."
        }
        setErrorMessage(msg)
        setStatus("error")
        return
      }

      setData(result)
      setStatus("success")
      // Smooth scroll to results
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err: any) {
      setErrorMessage("Could not connect to the analysis service. Please check that the server is running.")
      setStatus("error")
    }
  }

  const handleReset = () => {
    setStatus("idle")
    setData(null)
    setErrorMessage(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink selection:bg-brand/20 selection:text-brand-text">
      <Navbar onReset={handleReset} hasAnalysis={status === "success"} />

      <main className="flex-1">
        {status === "idle" && (
          <>
            <Hero onAnalyze={handleAnalyze} isLoading={false} />
            <ProductStory onSelectSample={(sampleUrl) => handleAnalyze(sampleUrl)} />
          </>
        )}

        {status === "loading" && (
          <LoadingState repoUrl={currentUrl} />
        )}

        {status === "error" && (
          <>
            <Hero
              onAnalyze={handleAnalyze}
              isLoading={false}
              error={errorMessage}
              initialUrl={currentUrl}
              onClearError={() => {
                setErrorMessage(null)
                setStatus("idle")
              }}
            />
            <ProductStory onSelectSample={(sampleUrl) => handleAnalyze(sampleUrl)} />
          </>
        )}

        {status === "success" && data && (
          <Dashboard data={data} onReset={handleReset} repoUrl={currentUrl} />
        )}
      </main>

      {/* Apple-style minimalist footer with orange brand accent */}
      <footer className="border-t border-line-subtle bg-canvas-subtle/50 dark:bg-[#151417] py-12 text-xs text-ink-tertiary transition-colors">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-line-subtle pb-6">
            <div className="flex items-center gap-2.5 text-ink font-semibold text-sm">
              <div className="h-6 w-6 rounded-md bg-brand text-white flex items-center justify-center shadow-subtle">
                <TerminalIcon className="h-3.5 w-3.5" strokeWidth={2} />
              </div>
              <span>Repo Explainer</span>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-xs text-ink-secondary">
              <button
                onClick={() => setLegalDoc("privacy")}
                className="hover:text-brand transition-colors cursor-pointer"
              >
                Privacy Policy
              </button>
              <button
                onClick={() => setLegalDoc("terms")}
                className="hover:text-brand transition-colors cursor-pointer"
              >
                Terms of Service
              </button>
              <a
                href="https://github.com/psf/requests"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand transition-colors inline-flex items-center gap-1"
              >
                <GithubIcon className="h-3.5 w-3.5" />
                <span>Reference Repository</span>
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:text-brand-hover transition-colors inline-flex items-center gap-1 font-medium"
                title="Follow on Instagram"
              >
                <InstagramIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Instagram</span>
              </a>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px] text-ink-secondary">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
              <span>Zero-leakage security engine: source code is treated strictly as untrusted read-only evidence.</span>
            </div>
            <div className="text-ink-secondary">
              Built to help developers understand unfamiliar codebases faster.
            </div>
          </div>
        </div>
      </footer>

      {/* Accessible Draft Legal Modal */}
      <LegalModal type={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  )
}

export default App

