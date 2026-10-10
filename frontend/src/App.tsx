import React, { useState } from "react"
import { Navbar } from "./components/Navbar"
import { Hero } from "./components/Hero"
import { ProductStory } from "./components/ProductStory"
import { LoadingState } from "./components/LoadingState"
import { Dashboard, type AnalysisData } from "./components/Dashboard"
import { LegalModal, type LegalDocType } from "./components/LegalModal"
import { ShieldCheckIcon, TerminalIcon, GithubIcon, InstagramIcon } from "./components/ui/icons"
import { localApi } from "./hooks/useProjects"
import type { SavedProject } from "./types/persistence"

const HomeView = React.lazy(() => import("./components/Home/HomeView").then(module => ({ default: module.HomeView })))
const ProjectDashboard = React.lazy(() => import("./components/Projects/ProjectDashboard").then(module => ({ default: module.ProjectDashboard })))

export const App: React.FC = () => {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "saved" | "error">("idle")
  const [currentUrl, setCurrentUrl] = useState<string>("")
  const [data, setData] = useState<AnalysisData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [requestedTab, setRequestedTab] = useState<string | null>(null)
  const [requestedFile, setRequestedFile] = useState<string | null>(null)

  const handleOpenProject = (project: SavedProject) => {
    void localApi(`/projects/${project.id}/open`, "POST", {}).catch(() => undefined)
    setProjectId(project.id)
    setCurrentUrl(project.repo_url)
    setData(null)
    setStatus("saved")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleAnalyze = async (url: string, tab?: string, file?: string) => {
    setCurrentUrl(url)
    setRequestedTab(tab || null)
    setRequestedFile(file || null)
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
      try {
        const saved = await localApi<{ project: { id: string } }>("/projects", "POST", {
          repo_url: url, name: result.info?.name, branch: result.info?.default_branch,
          repo_sha: result.repository_model?.metadata?.latest_commit_sha || null,
        })
        setProjectId(saved.project.id)
      } catch { setProjectId(null) }
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
    setProjectId(null)
    setRequestedTab(null)
    setRequestedFile(null)
    setErrorMessage(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink selection:bg-brand/20 selection:text-brand-text">
      <Navbar onReset={handleReset} hasAnalysis={status === "success"} />

      <main className="flex-1">
        {status === "idle" && (
          <>
            <React.Suspense fallback={<p className="p-8 text-sm">Loading saved projects…</p>}><HomeView onAnalyze={handleAnalyze} onOpenProject={handleOpenProject} /></React.Suspense>
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
          <Dashboard data={data} onReset={handleReset} repoUrl={currentUrl} projectId={projectId} initialTab={requestedTab} initialFileOverride={requestedFile} />
        )}
        {status === "saved" && projectId && <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><React.Suspense fallback={<p className="text-sm">Loading saved project…</p>}><ProjectDashboard projectId={projectId} currentSha={null} onNavigate={view => void handleAnalyze(currentUrl, view)} onOpenFile={path => void handleAnalyze(currentUrl, "explorer", path)} onHome={handleReset} /></React.Suspense></div>}
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
              <span>Source stays read-only during analysis; local patches require review, validation, and explicit approval.</span>
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
