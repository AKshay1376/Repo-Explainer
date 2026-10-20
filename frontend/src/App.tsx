import { apiFetch } from "./apiClient"
import React, { useEffect, useRef, useState } from "react"
import { Navbar } from "./components/Navbar"
import { Hero } from "./components/Hero"
import { LoadingState } from "./components/LoadingState"
import type { AnalysisData } from "./components/Dashboard"
import { LegalModal, type LegalDocType } from "./components/LegalModal"
import { TerminalIcon, GithubIcon } from "./components/ui/icons"
import { localApi } from "./hooks/useProjects"
import type { SavedProject } from "./types/persistence"
import { setCsrfToken } from "./apiClient"
import { jobLabel } from "./lib/deployment"
import { ServiceUnavailable } from "./components/ServiceUnavailable"
import { SettingsDialog } from "./components/SettingsDialog"
import { Onboarding } from "./components/Onboarding"
import { getLastRequestId } from "./apiClient"
import { emitProductEvent } from "./lib/productEvents"
import { HomeCommands } from "./components/HomeCommands"

const HomeView = React.lazy(() => import("./components/Home/HomeView").then(module => ({ default: module.HomeView })))
const ProjectDashboard = React.lazy(() => import("./components/Projects/ProjectDashboard").then(module => ({ default: module.ProjectDashboard })))
const Dashboard = React.lazy(() => import("./components/Dashboard").then(module => ({ default: module.Dashboard })))
const ProductStory = React.lazy(() => import("./components/ProductStory").then(module => ({ default: module.ProductStory })))
const LifecycleGraph = React.lazy(() => import("./components/Lifecycle/LifecycleGraph").then(module => ({ default: module.LifecycleGraph })))

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [homeCommandsOpen, setHomeCommandsOpen] = useState(false)
  const [showProductTour, setShowProductTour] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => typeof localStorage !== "undefined" && localStorage.getItem("repo-explainer:onboarded") !== "1")
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null)
  const linkedRepoOpened = useRef(false)

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
  useEffect(() => {
    if (status === "success") return
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setHomeCommandsOpen(true) }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [status])

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
    emitProductEvent("analysis_started")
    setCurrentUrl(url)
    setRequestedTab(tab || null)
    setRequestedFile(file || null)
    setErrorMessage(null)
    setErrorRequestId(null)
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
        setErrorRequestId(response.headers.get("X-Request-ID") || getLastRequestId())
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
      emitProductEvent("analysis_completed")
      // Smooth scroll to results
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err: any) {
      setErrorMessage("Could not connect to the analysis service. Please check that the server is running.")
      setErrorRequestId(getLastRequestId())
      setStatus("error")
    }
  }

  useEffect(() => {
    if (linkedRepoOpened.current || runtime !== "online" || (authMode !== "disabled" && !authenticated) || status !== "idle") return
    const repo = new URLSearchParams(window.location.search).get("repo")
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return
    linkedRepoOpened.current = true
    void handleAnalyze(`https://github.com/${repo}`)
  }, [runtime, authMode, authenticated, status])

  const handleReset = () => {
    window.history.pushState({}, "", "/")
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
      <Navbar onReset={handleReset} hasAnalysis={status === "success"} onSettings={() => setSettingsOpen(true)} />

      <main className="flex-1">
        {job && <div role="status" className="mx-auto max-w-5xl px-6 pt-4 text-sm text-ink">
          <div className="rounded-xl border border-line bg-surface p-3">
            <strong>Background analysis: {jobLabel(job.status)}</strong> · {job.progress}% · {job.message}
            <div className="mt-2"><React.Suspense fallback={null}><LifecycleGraph type="job" status={job.status} detail={`${job.progress}% complete`} compact /></React.Suspense></div>
            {job.status === "queued" && <button onClick={() => void cancelJob()} className="ml-3 text-brand">Cancel</button>}
            {job.status === "completed" && <button onClick={() => void handleAnalyze(job.repo_url)} className="ml-3 text-brand">Open project</button>}
            {["completed", "failed", "cancelled"].includes(job.status) && <button onClick={() => setJob(null)} className="ml-3 text-ink-secondary">Dismiss</button>}
          </div>
        </div>}
        {status === "idle" && (
          <>
            <React.Suspense fallback={<p className="p-8 text-sm">Loading saved projects…</p>}><HomeView onAnalyze={handleAnalyze} onQueue={queueAnalysis} onOpenProject={handleOpenProject} onSettings={() => setSettingsOpen(true)} /></React.Suspense>
            <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6"><button onClick={() => setShowProductTour(!showProductTour)} aria-expanded={showProductTour} className="text-sm font-semibold text-brand">{showProductTour ? "Hide product tour" : "Explore how Repo Explainer works"}</button></div>
            {showProductTour && <React.Suspense fallback={<p className="p-8 text-sm">Loading product tour…</p>}><ProductStory onSelectSample={(sampleUrl) => handleAnalyze(sampleUrl)} /></React.Suspense>}
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
              initialUrl={currentUrl}
              onClearError={() => {
                setErrorMessage(null)
                setStatus("idle")
              }}
            />
            {errorMessage && <div role="alert" className="mx-auto max-w-2xl rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950 dark:bg-rose-950/20 dark:text-rose-100"><strong>Analysis needs attention.</strong> {errorMessage}{errorRequestId && <p className="mt-2 font-mono text-xs">Request ID: {errorRequestId}</p>}<div className="mt-3 flex gap-3"><button onClick={() => void handleAnalyze(currentUrl)} className="font-semibold underline">Retry</button><button onClick={handleReset} className="underline">Choose another repository</button></div><details className="mt-2"><summary className="cursor-pointer">Technical details</summary><p>The request did not complete. Use the request ID in server logs if this persists.</p></details></div>}
          </>
        )}

        {status === "success" && data && (
          <React.Suspense fallback={<LoadingState repoUrl={currentUrl} />}><Dashboard data={data} onReset={handleReset} repoUrl={currentUrl} projectId={projectId} initialTab={requestedTab} initialFileOverride={requestedFile} capabilities={capabilities} onSettings={() => setSettingsOpen(true)} /></React.Suspense>
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
                href="https://github.com/AKshay1376/Repo-Explainer"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand transition-colors inline-flex items-center gap-1"
              >
                <GithubIcon className="h-3.5 w-3.5" />
                <span>Source repository</span>
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
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} capabilities={capabilities} onResetOnboarding={() => { localStorage.removeItem("repo-explainer:onboarded"); setSettingsOpen(false); setShowOnboarding(true) }} />}
      {showOnboarding && status === "idle" && <Onboarding onClose={() => { localStorage.setItem("repo-explainer:onboarded", "1"); setShowOnboarding(false) }} />}
      {homeCommandsOpen && status !== "success" && <HomeCommands onClose={() => setHomeCommandsOpen(false)} onSettings={() => setSettingsOpen(true)} onHome={handleReset} />}
    </div>
  )
}

export default App
