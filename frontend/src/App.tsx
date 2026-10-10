import { apiFetch } from "./apiClient"
import React, { useEffect, useState } from "react"
import { Navbar } from "./components/Navbar"
import { Hero } from "./components/Hero"
import { ProductStory } from "./components/ProductStory"
import { LoadingState } from "./components/LoadingState"
import { Dashboard, type AnalysisData } from "./components/Dashboard"
import { LegalModal, type LegalDocType } from "./components/LegalModal"
import { ShieldCheckIcon, TerminalIcon, GithubIcon, InstagramIcon } from "./components/ui/icons"
import { localApi } from "./hooks/useProjects"
import type { SavedProject } from "./types/persistence"
import { setCsrfToken } from "./apiClient"
import { jobLabel } from "./lib/deployment"
import { ServiceUnavailable } from "./components/ServiceUnavailable"

const HomeView = React.lazy(() => import("./components/Home/HomeView").then(module => ({ default: module.HomeView })))
const ProjectDashboard = React.lazy(() => import("./components/Projects/ProjectDashboard").then(module => ({ default: module.ProjectDashboard })))

export const App: React.FC = () => {
  const [runtime, setRuntime] = useState<"checking" | "online" | "offline">("checking")
  const [authMode, setAuthMode] = useState("disabled")
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [authError, setAuthError] = useState("")
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({})
  const [job, setJob] = useState<{ id: string; status: string; progress: number; message: string; repo_url: string } | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "saved" | "error">("idle")
  const [currentUrl, setCurrentUrl] = useState<string>("")
  const [data, setData] = useState<AnalysisData | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [legalDoc, setLegalDoc] = useState<LegalDocType>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [requestedTab, setRequestedTab] = useState<string | null>(null)
  const [requestedFile, setRequestedFile] = useState<string | null>(null)

  const checkServer = async () => {
    setRuntime("checking")
    try {
      const [sessionResponse, capabilityResponse] = await Promise.all([
        apiFetch("/api/auth/session"), apiFetch("/api/capabilities"),
      ])
      if (!sessionResponse.ok || !capabilityResponse.ok) throw new Error("Server unavailable")
      const session = await sessionResponse.json()
      const available = await capabilityResponse.json()
      setAuthMode(session.auth_mode || "disabled")
      setAuthenticated(Boolean(session.authenticated))
      setCsrfToken(session.csrf_token || null)
      setCapabilities(available.capabilities || {})
      setRuntime("online")
    } catch { setRuntime("offline") }
  }
  useEffect(() => {
    void checkServer()
    const required = () => { setAuthenticated(false); setCsrfToken(null) }
    window.addEventListener("repo-auth-required", required)
    return () => window.removeEventListener("repo-auth-required", required)
  }, [])

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setAuthError("")
    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Sign in failed")
      setCsrfToken(result.csrf_token)
      setAuthenticated(true)
      setPassword("")
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Sign in failed") }
  }

  const queueAnalysis = async (url: string) => {
    try {
      const response = await apiFetch("/api/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "repository_analysis", repo_url: url }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not queue analysis")
      setJob(result.job)
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Could not queue analysis") }
  }
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return
    const timer = window.setInterval(async () => {
      try {
        const response = await apiFetch(`/api/jobs/${job.id}`)
        if (!response.ok) throw new Error()
        setJob((await response.json()).job)
      } catch { setJob(previous => previous && { ...previous, status: "failed", message: "Job status unavailable" }) }
    }, 1200)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status])
  const cancelJob = async () => {
    if (!job) return
    const response = await apiFetch(`/api/jobs/${job.id}/cancel`, { method: "POST" })
    if (response.ok) setJob((await response.json()).job)
  }

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
      const response = await apiFetch("/api/analyze", {
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

  if (runtime === "offline") return <ServiceUnavailable retry={() => void checkServer()} />
  if (runtime === "checking") return (
    <main className="min-h-screen flex items-center justify-center bg-canvas text-ink p-8">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold">Connecting to Repo Explainer…</h1>
      </div>
    </main>
  )

  if (authMode !== "disabled" && !authenticated) return (
    <main className="min-h-screen flex items-center justify-center bg-canvas text-ink p-8">
      <form onSubmit={event => void signIn(event)} className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 space-y-4">
        <h1 className="text-xl font-semibold">Sign in to Repo Explainer</h1>
        <p className="text-sm text-ink-secondary">This deployment requires a session before project actions.</p>
        <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required
          aria-label="Deployment password" className="w-full rounded-lg border border-line bg-canvas p-3" />
        {authError && <p role="alert" className="text-sm text-red-600">{authError}</p>}
        <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-white">Sign in</button>
      </form>
    </main>
  )

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink selection:bg-brand/20 selection:text-brand-text">
      <Navbar onReset={handleReset} hasAnalysis={status === "success"} />

      <main className="flex-1">
        {job && <div role="status" className="mx-auto max-w-5xl px-6 pt-4 text-sm text-ink">
          <div className="rounded-xl border border-line bg-surface p-3">
            <strong>Background analysis: {jobLabel(job.status)}</strong> · {job.progress}% · {job.message}
            {job.status === "queued" && <button onClick={() => void cancelJob()} className="ml-3 text-brand">Cancel</button>}
            {job.status === "completed" && <button onClick={() => void handleAnalyze(job.repo_url)} className="ml-3 text-brand">Open project</button>}
            {["completed", "failed", "cancelled"].includes(job.status) && <button onClick={() => setJob(null)} className="ml-3 text-ink-secondary">Dismiss</button>}
          </div>
        </div>}
        {status === "idle" && (
          <>
            <React.Suspense fallback={<p className="p-8 text-sm">Loading saved projects…</p>}><HomeView onAnalyze={handleAnalyze} onOpenProject={handleOpenProject} /></React.Suspense>
            <Hero onAnalyze={handleAnalyze} onQueue={queueAnalysis} isLoading={false} />
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
              onQueue={queueAnalysis}
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
          <Dashboard data={data} onReset={handleReset} repoUrl={currentUrl} projectId={projectId} initialTab={requestedTab} initialFileOverride={requestedFile} capabilities={capabilities} />
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
              {authMode !== "disabled" && <button onClick={() => {
                void apiFetch("/api/auth/logout", { method: "POST" }).finally(() => {
                  setCsrfToken(null); setAuthenticated(false); setStatus("idle")
                })
              }} className="hover:text-brand transition-colors">Sign out</button>}
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
