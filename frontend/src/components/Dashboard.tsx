import React, { useState } from "react"
import {
  StarIcon,
  GitBranchIcon,
  CodeIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  RotateCcwIcon,
  ExternalLinkIcon,
  LayersIcon,
  FolderTreeIcon,
  FileCodeIcon,
  GithubIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  WorkflowIcon,
  ZapIcon,
  SparklesIcon,
} from "./ui/icons"
import { ReportView } from "./ReportView"
import { RepositoryExplorer } from "./RepositoryExplorer"
import { FileInspector } from "./FileInspector"
import type { RepositoryModel } from "../types/repository"
import type { AskRepoScope } from "../types/qa"
import type { TraceTrigger, ExecutionFlow } from "../types/trace"
import type { ImpactTrigger } from "../types/impact"
import type { SourceLocation } from "../types/source"
import type { PlanTrigger } from "../types/refactor"
import type { PatchTrigger } from "../types/patch"
import type { DocumentTarget } from "../types/documentation"
import { localApi } from "../hooks/useProjects"
import { useSessionState } from "../hooks/useSessionState"
import { tabAvailable } from "../lib/deployment"
import { WorkspaceShell } from "./WorkspaceShell"
import { availableViews, type WorkspaceView } from "../lib/workspaceNavigation"
import { useWorkspaceNavigation } from "../hooks/useWorkspaceNavigation"
import { ErrorBoundary } from "./ErrorBoundary"
import { ViewSkeleton } from "./ui/ViewSkeleton"
import { emitProductEvent } from "../lib/productEvents"
import { useToast } from "./ui/Toasts"

import { sourceForStep, sourceForImpact } from "../lib/sourceNavigation"

export interface AnalysisData {
  info: {
    name: string
    description: string
    stars: number
    language: string | null
    default_branch: string
  }
  tech_stack: string[]
  folder_summary: Record<string, string[]>
  key_files: string[]
  report: string
  repository_model?: RepositoryModel
}

interface DashboardProps {
  data: AnalysisData
  onReset: () => void
  repoUrl: string
  projectId?: string | null
  initialTab?: string | null
  initialFileOverride?: string | null
  capabilities?: Record<string, boolean>
  onSettings?: () => void
}

type DashboardTab = WorkspaceView

const RefactorPlannerView = React.lazy(() => import("./RefactorPlanner/RefactorPlannerView").then((module) => ({ default: module.RefactorPlannerView })))
const HumanizeView = React.lazy(() => import("./Humanize/HumanizeView").then((module) => ({ default: module.HumanizeView })))
const SourceViewer = React.lazy(() => import("./SourceViewer/SourceViewer").then((module) => ({ default: module.SourceViewer })))
const PatchReviewView = React.lazy(() => import("./PatchReview/PatchReviewView").then((module) => ({ default: module.PatchReviewView })))
const ValidationView = React.lazy(() => import("./Validation/ValidationView").then((module) => ({ default: module.ValidationView })))
const ProjectHealthView = React.lazy(() => import("./ProjectHealth/ProjectHealthView").then((module) => ({ default: module.ProjectHealthView })))
const GitHistoryView = React.lazy(() => import("./GitHistory/GitHistoryView").then((module) => ({ default: module.GitHistoryView })))
const DocumentationView = React.lazy(() => import("./Documentation/DocumentationView").then((module) => ({ default: module.DocumentationView })))
const ProjectDashboard = React.lazy(() => import("./Projects/ProjectDashboard").then((module) => ({ default: module.ProjectDashboard })))
const ArchitectureGraph = React.lazy(() => import("./ArchitectureGraph/ArchitectureGraph").then(module => ({ default: module.ArchitectureGraph })))
const AskRepo = React.lazy(() => import("./AskRepo/AskRepo").then(module => ({ default: module.AskRepo })))
const ExecutionFlowView = React.lazy(() => import("./ExecutionFlow/ExecutionFlowView").then(module => ({ default: module.ExecutionFlowView })))
const ChangeImpactView = React.lazy(() => import("./ChangeImpact/ChangeImpactView").then(module => ({ default: module.ChangeImpactView })))

export const Dashboard: React.FC<DashboardProps> = ({
  data,
  onReset,
  repoUrl,
  projectId,
  initialTab,
  initialFileOverride,
  capabilities,
  onSettings = () => undefined,
}) => {
  const localFeatures = capabilities?.local_filesystem !== false
  const patchAvailable = capabilities?.patch_apply !== false
  const validatorAvailable = capabilities?.validator_execution !== false
  const [copied, setCopied] = useState(false)
  const toast = useToast()
  const [isStructureOpen, setIsStructureOpen] = useState(false)

  const { info, tech_stack, folder_summary, key_files, report, repository_model } = data

  // Initial file selection: first entrypoint, or first key file, or first parsed file
  const initialFile = React.useMemo(() => {
    if (initialFileOverride && repository_model?.files?.[initialFileOverride]) return initialFileOverride
    if (repository_model?.entry_points && repository_model.entry_points.length > 0) {
      return repository_model.entry_points[0].path
    }
    if (key_files && key_files.length > 0) {
      return key_files[0]
    }
    const all = Object.keys(repository_model?.files || {})
    return all.length ? all[0] : null
  }, [repository_model, key_files, initialFileOverride])

  const allowedViews = React.useMemo(() => availableViews(capabilities || {}, !!projectId, !!repository_model),
    [capabilities, projectId, repository_model])
  const fallback: DashboardTab = projectId ? "project" : repository_model ? "health" : "report"
  const workspace = useWorkspaceNavigation(repository_model, projectId, allowedViews, fallback, initialFile, initialTab)
  const activeTab = workspace.view
  const selectedFile = workspace.file
  React.useEffect(() => { emitProductEvent("view_opened", { view: activeTab }) }, [activeTab])
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set([activeTab]))
  React.useEffect(() => { setVisitedTabs(previous => new Set(previous).add(activeTab)) }, [activeTab])
  const [sourceLocation, setSourceLocation] = useState<SourceLocation | null>(null)
  const navigateTab = React.useCallback((tab: DashboardTab) => {
    if (!tabAvailable(tab, capabilities)) return
    setVisitedTabs((previous) => new Set(previous).add(tab))
    workspace.navigate({ view: tab })
  }, [capabilities, workspace.navigate])
  const openSource = React.useCallback((location: SourceLocation) => {
    setSourceLocation({ ...location, requestId: Date.now() })
    if (projectId) void localApi(`/projects/${projectId}/recent`, "POST", { type: "file", target: location.path, view: "source" }).catch(() => undefined)
    workspace.navigate({ view: "source", file: location.path, line: location.startLine || null, endLine: location.endLine || null })
  }, [workspace.navigate, projectId])
  const [historyTarget, setHistoryTarget] = useState<{ path: string; requestId: number } | null>(null)
  const openHistory = React.useCallback((path: string) => {
    setHistoryTarget({ path, requestId: Date.now() })
    navigateTab("history")
  }, [navigateTab])
  const [documentTarget, setDocumentTarget] = useState<DocumentTarget | null>(null)
  const openDocumentation = React.useCallback((target: DocumentTarget) => {
    setDocumentTarget({ ...target, requestId: Date.now() })
    navigateTab("docs")
  }, [navigateTab])
  const [humanizeTarget, setHumanizeTarget] = useState<{ path: string; requestId: number } | null>(null)
  const openHumanize = React.useCallback((path: string) => {
    setHumanizeTarget({ path, requestId: Date.now() })
    navigateTab("humanize")
  }, [navigateTab])
  const [planTrigger, setPlanTrigger] = useState<PlanTrigger | null>(null)
  const openPlan = React.useCallback((trigger: PlanTrigger) => {
    setPlanTrigger({ ...trigger, requestId: Date.now() })
    navigateTab("refactor")
  }, [navigateTab])
  const [patchTrigger, setPatchTrigger] = useState<PatchTrigger | null>(null)
  const openPatch = React.useCallback((trigger: PatchTrigger) => {
    setPatchTrigger({ ...trigger, requestId: Date.now() })
    navigateTab("patch")
  }, [navigateTab])
  const [askScope, setAskScope] = useState<AskRepoScope | undefined>(undefined)
  const [traceTrigger, setTraceTrigger] = useState<TraceTrigger | undefined>(undefined)
  const [impactTrigger, setImpactTrigger] = useState<ImpactTrigger | null>(null)

  const handleAnalyzeImpact = (trigger: ImpactTrigger) => {
    setImpactTrigger(trigger)
    navigateTab("impact")
  }

  const handleSelectFile = (path: string, pushHistory = true) => {
    workspace.navigate({ file: path, symbol: null, line: null, endLine: null }, !pushHistory)
    if (projectId) void localApi(`/projects/${projectId}/recent`, "POST", { type: "file", target: path, view: "explorer" }).catch(() => undefined)
  }
  const revision = repository_model?.metadata?.latest_commit_sha || null
  const restore = React.useCallback((view: string | null, file: string | null) => {
    if (initialTab) return
    workspace.navigate({ ...(file && repository_model?.files?.[file] ? { file } : {}),
      ...(view && allowedViews.includes(view as DashboardTab) ? { view: view as DashboardTab } : {}) }, true)
  }, [repository_model, workspace.navigate, initialTab, allowedViews])
  const { stale: staleSession } = useSessionState(projectId || null, revision, activeTab, selectedFile, restore)

  const handleAskAboutFile = (filePath: string) => {
    setAskScope({ file: filePath })
    navigateTab("ask")
  }

  const handleAskAboutEdge = (edgeData: { source: string; target: string; type: string }) => {
    setAskScope({ edge: edgeData })
    navigateTab("ask")
  }

  const handleInspectFileFromAsk = (filePath: string) => {
    handleSelectFile(filePath)
    navigateTab("explorer")
  }

  const handleShowInGraphFromAsk = (filePath: string) => {
    handleSelectFile(filePath)
    navigateTab("graph")
  }

  const handleTraceFile = (filePath: string, symbol?: string) => {
    setTraceTrigger({
      startFile: filePath,
      startSymbol: symbol,
    })
    navigateTab("flow")
  }

  const handleTraceRoute = (routeStr: string) => {
    setTraceTrigger({
      route: routeStr,
    })
    navigateTab("flow")
  }

  const handleTraceEdge = (edgeData: { source: string; target: string; type: string }) => {
    setTraceTrigger({
      startFile: edgeData.source,
    })
    navigateTab("flow")
  }

  const handleTraceFromAsk = (candidateFiles: string[], query?: string) => {
    if (candidateFiles.length > 0) {
      setTraceTrigger({
        startFile: candidateFiles[0],
        askRepoContext: {
          candidate_files: candidateFiles,
          query,
        },
      })
      navigateTab("flow")
    }
  }

  const handleExplainFlowWithAsk = (flow: ExecutionFlow) => {
    if (flow.steps && flow.steps.length > 0) {
      setAskScope({ file: flow.steps[0].file })
    }
    navigateTab("ask")
  }

  const handleNavigateBack = workspace.back
  const handleNavigateForward = workspace.forward

  const handleCopy = () => {
    void navigator.clipboard.writeText(report).then(() => {
      setCopied(true); toast("Report copied."); setTimeout(() => setCopied(false), 2000)
    }).catch(() => undefined)
  }

  const handleDownload = () => {
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const safeName = (info.name || "repository").toLowerCase().replace(/[^a-z0-9]/g, "-")
    a.href = url
    a.download = `${safeName}-report.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast("Report exported.")
  }

  const githubUrl = repoUrl.startsWith("http") ? repoUrl : `https://${repoUrl}`
  const contextualCommands = [
    { id: "selected-source", label: "View Source", description: selectedFile || undefined,
      enabled: !!selectedFile, run: () => selectedFile && openSource({ path: selectedFile }) },
    { id: "selected-impact", label: "Analyze Impact", description: selectedFile || undefined,
      enabled: !!selectedFile, run: () => selectedFile && handleAnalyzeImpact({ file: selectedFile }) },
    { id: "selected-humanize", label: "Humanize File", description: selectedFile || undefined,
      enabled: !!selectedFile, run: () => selectedFile && openHumanize(selectedFile) },
    { id: "selected-plan", label: "Create Refactor Plan", description: selectedFile || undefined,
      enabled: !!selectedFile, run: () => selectedFile && openPlan({ planType: "split_large_file", target: selectedFile }) },
    { id: "selected-history", label: "View File History", description: selectedFile || undefined,
      enabled: !!selectedFile && localFeatures, run: () => selectedFile && openHistory(selectedFile) },
    { id: "selected-doc", label: "Document File", description: selectedFile || undefined,
      enabled: !!selectedFile, run: () => selectedFile && openDocumentation({ type: "MODULE", scope: selectedFile }) },
    { id: "selected-definition", label: "View Definition", description: workspace.location.symbol || undefined,
      enabled: !!selectedFile && !!workspace.location.symbol, run: () => selectedFile && openSource({ path: selectedFile,
        startLine: workspace.location.line || undefined, endLine: workspace.location.line || undefined }) },
    { id: "selected-rename", label: "Create Rename Plan", description: workspace.location.symbol || undefined,
      enabled: !!selectedFile && !!workspace.location.symbol, run: () => selectedFile && workspace.location.symbol &&
        openPlan({ planType: "rename_symbol", target: `${selectedFile}::${workspace.location.symbol}` }) },
  ]

  return (
    <WorkspaceShell location={workspace.location} model={repository_model} projectId={projectId}
      repoName={info.name} branch={info.default_branch} sha={revision} capabilities={capabilities || {}}
      canBack={workspace.canBack} canForward={workspace.canForward} onBack={handleNavigateBack} onForward={handleNavigateForward}
      onNavigate={navigateTab} onHome={onReset} onSettings={onSettings} commands={contextualCommands}
      onOpenFile={(path, view) => view === "source" ? openSource({ path }) : workspace.navigate({ view, file: path })}
      onOpenSymbol={symbol => { openSource({ path: symbol.file, startLine: symbol.line || undefined, endLine: symbol.line || undefined }); workspace.navigate({ symbol: symbol.name }, true) }}>
    <div className="mx-auto max-w-7xl space-y-10">
      {(activeTab === "report" || activeTab === "project") && <>
      {/* 1. Top Repository Info Banner */}
      <div className="rounded-3xl border border-line bg-surface p-6 sm:p-10 shadow-card">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-ink flex items-center gap-2.5">
                <FileCodeIcon className="h-7 w-7 text-brand" strokeWidth={1.75} />
                <span>{info.name}</span>
              </h1>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-ctrl-tagBorder bg-ctrl-tag px-2.5 py-0.5 text-xs font-medium text-ink">
                  <StarIcon className="h-3.5 w-3.5 text-[#B25E00] dark:text-[#FBBF24]" fill="#F59E0B" />
                  <span>{info.stars.toLocaleString()}</span>
                </span>

                {info.language && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-ctrl-tagBorder bg-ctrl-tag px-2.5 py-0.5 text-xs font-medium text-ink">
                    <CodeIcon className="h-3.5 w-3.5 text-brand" strokeWidth={1.75} />
                    <span>{info.language}</span>
                  </span>
                )}

                <span className="inline-flex items-center gap-1 rounded-full border border-ctrl-tagBorder bg-ctrl-tag px-2.5 py-0.5 text-xs font-medium text-ink-secondary">
                  <GitBranchIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span>{info.default_branch}</span>
                </span>
              </div>
            </div>

            <p className="text-sm text-ink-secondary leading-relaxed max-w-3xl">
              {info.description || "No repository description provided."}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-full apple-glass-control px-3.5 py-2 text-xs font-medium text-ink shadow-subtle transition-all cursor-pointer"
              title="Copy Markdown Report to clipboard"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5 text-brand" strokeWidth={2} />
                  <span className="text-brand">Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon className="h-3.5 w-3.5 text-ink-secondary" />
                  <span>Copy Report</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-subtle transition-all hover:bg-brand-hover active:scale-[0.98] cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
              title="Download report.md"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              <span>Download .md</span>
            </button>

            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full apple-glass-control px-3.5 py-2 text-xs font-medium text-ink shadow-subtle hover:border-brand-border active:scale-[0.98] transition-all"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              <span>Open on GitHub</span>
              <ExternalLinkIcon className="h-3 w-3 text-ink-tertiary" />
            </a>

            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-full apple-glass-control px-3 py-2 text-xs font-medium text-ink-secondary hover:text-ink hover:border-brand-border active:scale-[0.98] transition-all cursor-pointer"
            >
              <RotateCcwIcon className="h-3 w-3 text-brand" />
              <span>Analyze Another</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Metadata Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Tech Stack Card */}
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-4">
            <LayersIcon className="h-4 w-4 text-brand" strokeWidth={1.75} />
            <span>Detected Tech Stack</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {tech_stack.length > 0 ? (
              tech_stack.map((tech) => (
                <span
                  key={tech}
                  className="inline-flex items-center rounded-lg border border-line-subtle bg-surface-inset px-2.5 py-1 text-xs font-medium text-ink"
                >
                  {tech}
                </span>
              ))
            ) : (
              <span className="text-xs text-ink-tertiary">No specific technologies identified</span>
            )}
          </div>
        </div>

        {/* Key Files Inspected */}
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <FileCodeIcon className="h-4 w-4 text-brand" strokeWidth={1.75} />
              <span>Key Architecture Files ({key_files.length})</span>
            </div>
            <span className="text-[10px] text-ink-tertiary">Click to inspect</span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {key_files.map((file) => (
              <button
                key={file}
                onClick={() => {
                  handleSelectFile(file)
                  navigateTab("explorer")
                }}
                className={`w-full text-left flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-mono transition-all cursor-pointer ${
                  selectedFile === file
                    ? "bg-brand-surface border-brand text-brand-text font-semibold"
                    : "bg-surface-inset border-line-subtle text-ink hover:border-brand-border"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                  <span className="truncate">{file}</span>
                </div>
                <span className="text-[10px] text-ink-tertiary shrink-0">inspect</span>
              </button>
            ))}
          </div>
        </div>

        {/* Project Structure Summary */}
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <FolderTreeIcon className="h-4 w-4 text-brand" strokeWidth={1.75} />
              <span>Project Structure</span>
            </div>
            <button
              onClick={() => setIsStructureOpen(!isStructureOpen)}
              className="text-[11px] font-medium text-brand hover:text-brand-hover flex items-center gap-0.5 cursor-pointer"
            >
              {isStructureOpen ? "Collapse" : "Expand all"}
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs text-ink">
            {Object.entries(folder_summary).map(([folder, files]) => (
              <div key={folder} className="rounded-lg bg-surface-inset border border-line-subtle p-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-medium text-ink">
                    {folder === "." ? "Root" : folder}
                  </span>
                  <span className="text-[10px] text-ink-tertiary">
                    {files.length} {files.length === 1 ? "file" : "files"}
                  </span>
                </div>
                {isStructureOpen && (
                  <div className="mt-1.5 pl-2.5 space-y-0.5 border-l border-line">
                    {files.slice(0, 10).map((f) => {
                      const fullPath = folder === "." ? f : `${folder}/${f}`
                      return (
                        <button
                          key={f}
                          onClick={() => {
                            handleSelectFile(fullPath)
                            navigateTab("explorer")
                          }}
                          className="w-full text-left font-mono text-[11px] text-ink-secondary hover:text-brand truncate block cursor-pointer"
                          title={`Inspect ${fullPath}`}
                        >
                          {f}
                        </button>
                      )
                    })}
                    {files.length > 10 && (
                      <div className="text-[10px] text-ink-tertiary italic">
                        + {files.length - 10} more files
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      </>}
      {staleSession && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Repository changed since last session. Analyze latest or continue with the current snapshot. Patch and refactor contexts were not restored.</p>}
      {!localFeatures && <p className="rounded-xl border border-line bg-surface p-3 text-sm text-ink-secondary">Local filesystem, patch apply, validator execution, and Git history are available only in a local or trusted deployment.</p>}
      {/* The workspace sidebar owns view navigation; visited views remain mounted below. */}
      {/* Views stay mounted after first visit so conversations and graph position survive navigation. */}
      {projectId && visitedTabs.has("project") && <div hidden={activeTab !== "project"}><React.Suspense fallback={<p className="p-8 text-sm">Loading project…</p>}><ProjectDashboard projectId={projectId} currentSha={revision} onNavigate={view => navigateTab(view as DashboardTab)} onOpenFile={path => { handleSelectFile(path); navigateTab("explorer") }} onHome={onReset} /></React.Suspense></div>}
      {repository_model && visitedTabs.has("docs") && <div hidden={activeTab !== "docs"}>
        <React.Suspense fallback={<ViewSkeleton title="Documentation" />}><ErrorBoundary feature="Documentation">
          <DocumentationView repoUrl={repoUrl} model={repository_model} target={documentTarget} initialSection={workspace.location.section} visible={activeTab === "docs"} onSelectSection={section => workspace.navigate({ view: "docs", section })} onOpenSource={openSource} onCreatePatch={openPatch} projectId={projectId} />
        </ErrorBoundary></React.Suspense>
      </div>}
      {repository_model && visitedTabs.has("history") && <div hidden={activeTab !== "history"}>
        <div className="mb-3 flex gap-3 text-xs"><button onClick={() => openDocumentation({ type: "CHANGE_SUMMARY" })} className="text-brand">Generate Change Summary</button><button onClick={() => openDocumentation({ type: "CHANGE_SUMMARY", options: { period: "30d" } })} className="text-brand">Generate Evolution Summary</button></div>
        <React.Suspense fallback={<ViewSkeleton title="Git History" />}><ErrorBoundary feature="Git History">
          <GitHistoryView repoUrl={repoUrl} model={repository_model} target={{ path: historyTarget?.path || workspace.location.file || undefined, commit: workspace.location.commit, requestId: historyTarget?.requestId || 0 }} onSelectCommit={commit => workspace.navigate({ view: "history", commit })}
            onOpenSource={openSource} onAnalyzeImpact={(path) => handleAnalyzeImpact({ file: path })}
            onHumanize={openHumanize} onCreatePlan={(path) => openPlan({ planType: "split_large_file", target: path })} />
        </ErrorBoundary></React.Suspense>
      </div>}
      {repository_model && visitedTabs.has("health") && <div hidden={activeTab !== "health"}>
        <button onClick={() => openDocumentation({ type: "TECH_DEBT" })} className="mb-3 text-xs font-semibold text-brand">Generate Technical Debt Report</button>
        <React.Suspense fallback={<ViewSkeleton title="Project Health" />}><ErrorBoundary feature="Project Health">
          <ProjectHealthView repoUrl={repoUrl} model={repository_model} onOpenSource={openSource}
            onAnalyzeImpact={handleAnalyzeImpact} onHumanize={openHumanize} onCreatePlan={openPlan}
            onAskRepo={handleAskAboutFile} onInspectFile={(path) => { handleSelectFile(path); navigateTab("explorer") }}
            onCreatePatch={openPatch} onTraceFlow={handleTraceFile} />
        </ErrorBoundary></React.Suspense>
      </div>}
      {repository_model && visitedTabs.has("explorer") && <div hidden={activeTab !== "explorer"}>
        <ErrorBoundary feature="Explorer">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 rounded-3xl border border-line bg-surface shadow-card overflow-hidden">
            <RepositoryExplorer model={repository_model} selectedFile={selectedFile} onSelectFile={handleSelectFile} />
          </div>
          <div className="lg:col-span-7 rounded-3xl border border-line bg-surface shadow-card overflow-hidden sticky top-6">
            <FileInspector filePath={selectedFile} model={repository_model} onSelectFile={handleSelectFile}
              onNavigateBack={handleNavigateBack} onNavigateForward={handleNavigateForward} canGoBack={workspace.canBack}
              canGoForward={workspace.canForward} onClose={() => workspace.navigate({ file: null }, true)}
              onAskAboutFile={handleAskAboutFile} onTraceFile={handleTraceFile} onTraceRoute={handleTraceRoute}
              onAnalyzeImpact={handleAnalyzeImpact} onOpenSource={openSource} onHumanize={openHumanize} onCreatePlan={openPlan} onCreatePatch={openPatch}
              onDocument={(path) => openDocumentation({ type: "MODULE", scope: path })} />
          </div>
        </div>
        </ErrorBoundary>
      </div>}
      {repository_model && visitedTabs.has("graph") && <div hidden={activeTab !== "graph"} className="rounded-3xl border border-line bg-surface p-4 sm:p-6 shadow-card space-y-4">
        <ErrorBoundary feature="Architecture graph">
        <div className="flex gap-3 text-xs"><button onClick={() => openDocumentation({ type: "ARCHITECTURE" })} className="text-brand">Export Architecture Documentation / Diagram</button>{selectedFile && <button onClick={() => openDocumentation({ type: "MODULE", scope: selectedFile })} className="text-brand">Document Module / Subsystem</button>}</div>
        <React.Suspense fallback={<ViewSkeleton title="Architecture Graph" />}><ArchitectureGraph model={repository_model} selectedFile={selectedFile} onSelectFile={handleSelectFile}
          onNavigateBack={handleNavigateBack} onNavigateForward={handleNavigateForward} canGoBack={workspace.canBack}
          canGoForward={workspace.canForward} onAskAboutFile={handleAskAboutFile}
          onAskAboutEdge={handleAskAboutEdge} onTraceFile={handleTraceFile} onTraceRoute={handleTraceRoute}
          onTraceEdge={handleTraceEdge} onAnalyzeImpact={handleAnalyzeImpact} onOpenSource={openSource} /></React.Suspense>
        </ErrorBoundary>
      </div>}
      {visitedTabs.has("ask") && <div hidden={activeTab !== "ask"}>
        <ErrorBoundary feature="Ask Repo">
        {repository_model && <div className="mb-3 flex gap-3 text-xs"><button onClick={() => openDocumentation({ type: "MODULE", scope: askScope?.file || selectedFile || "" })} className="text-brand">Document this module</button><button onClick={() => openDocumentation({ type: "API" })} className="text-brand">Generate API docs</button><button onClick={() => openDocumentation({ type: "EXECUTION_FLOW", scope: askScope?.file || selectedFile || "" })} className="text-brand">Explain this execution flow</button></div>}
        <React.Suspense fallback={<ViewSkeleton title="Ask Repo" />}><AskRepo repoUrl={repoUrl} model={repository_model} initialScope={askScope}
          onInspectFile={handleInspectFileFromAsk} onShowInGraph={handleShowInGraphFromAsk}
          onTraceFlow={handleTraceFromAsk} onAnalyzeImpact={handleAnalyzeImpact} onOpenSource={openSource} onHumanize={openHumanize} /></React.Suspense>
        </ErrorBoundary>
      </div>}
      {repository_model && visitedTabs.has("flow") && <div hidden={activeTab !== "flow"}>
        <ErrorBoundary feature="Execution Flow">
        <button onClick={() => openDocumentation({ type: "EXECUTION_FLOW", scope: traceTrigger?.startFile, options: { route: traceTrigger?.route, query: traceTrigger?.query } })} className="mb-3 text-xs font-semibold text-brand">Document This Flow</button>
        <React.Suspense fallback={<ViewSkeleton title="Execution Flow" />}><ExecutionFlowView repoUrl={repoUrl} model={repository_model} initialTrigger={traceTrigger}
          onInspectFile={handleInspectFileFromAsk} onShowInGraph={handleShowInGraphFromAsk}
          onExplainFlowWithAsk={handleExplainFlowWithAsk} onAnalyzeImpact={handleAnalyzeImpact}
          onOpenSource={(step) => openSource(sourceForStep(step, repository_model))} onHumanize={openHumanize} onCreatePlan={openPlan}
          onDocumentFlow={(flow) => openDocumentation({ type: "EXECUTION_FLOW", scope: flow.steps[0]?.file, options: { flow_id: flow.id } })} /></React.Suspense>
        </ErrorBoundary>
      </div>}
      {repository_model && visitedTabs.has("impact") && <div hidden={activeTab !== "impact"} className="rounded-3xl border border-line bg-surface p-4 sm:p-6 shadow-card space-y-4">
        <ErrorBoundary feature="Change Impact">
        <React.Suspense fallback={<ViewSkeleton title="Change Impact" />}><ChangeImpactView repoUrl={repoUrl} repositoryModel={repository_model} trigger={impactTrigger}
          onSelectFile={handleSelectFile} onNavigateTab={(tab) => navigateTab(tab as "explorer" | "graph")}
          onTraceFlow={handleTraceFile} onAskRepo={() => { setAskScope(undefined); navigateTab("ask") }}
          onOpenSource={(node) => openSource(sourceForImpact(node, repository_model))} onHumanize={openHumanize} onCreatePlan={openPlan} /></React.Suspense>
        </ErrorBoundary>
      </div>}
      {repository_model && visitedTabs.has("source") && <div hidden={activeTab !== "source"}>
        <React.Suspense fallback={<ViewSkeleton title="Source Viewer" />}><ErrorBoundary feature="Source Viewer">
          <SourceViewer repoUrl={repoUrl} model={repository_model} location={sourceLocation && sourceLocation.path === workspace.location.file && (sourceLocation.startLine || null) === workspace.location.line && (sourceLocation.endLine || null) === workspace.location.endLine ? sourceLocation : (workspace.location.file ? { path: workspace.location.file, startLine: workspace.location.line || undefined, endLine: workspace.location.endLine || undefined, requestId: workspace.location.line || 0 } : null)} onNavigate={next => { setSourceLocation(next); workspace.navigate({ file: next.path, line: next.startLine || null, endLine: next.endLine || null }, true) }} visible={activeTab === "source"} onHumanize={openHumanize} onCreatePlan={openPlan} onCreatePatch={openPatch} onViewHistory={openHistory}
            onDocument={(path, symbol) => openDocumentation({ type: "MODULE", scope: path, options: symbol ? { symbol } : undefined })} />
        </ErrorBoundary></React.Suspense>
      </div>}
      {repository_model && visitedTabs.has("humanize") && <div hidden={activeTab !== "humanize"}>
        <React.Suspense fallback={<ViewSkeleton title="Humanize" />}><ErrorBoundary feature="Humanize">
          <HumanizeView repoUrl={repoUrl} model={repository_model} target={humanizeTarget}
            onOpenSource={openSource} onAnalyzeImpact={handleAnalyzeImpact} onAskRepo={handleAskAboutFile} onCreatePlan={openPlan} onCreatePatch={openPatch} />
        </ErrorBoundary></React.Suspense>
      </div>}
      {repository_model && visitedTabs.has("refactor") && <div hidden={activeTab !== "refactor"}>
        {planTrigger && <button onClick={() => openDocumentation({ type: "REFACTOR_NOTES", scope: planTrigger.target, options: { plan_type: planTrigger.planType } })} className="mb-3 text-xs font-semibold text-brand">Export Refactor Plan</button>}
        <React.Suspense fallback={<ViewSkeleton title="Refactor Planner" />}><ErrorBoundary feature="Refactor Planner">
          <RefactorPlannerView repoUrl={repoUrl} model={repository_model} trigger={planTrigger}
            projectId={projectId}
            onOpenSource={openSource} onOpenImpact={(path) => handleAnalyzeImpact({ file: path })}
            onOpenGraph={handleShowInGraphFromAsk} onCreatePatch={openPatch}
            onDocumentPlan={(target, planType) => openDocumentation({ type: "REFACTOR_NOTES", scope: target, options: { plan_type: planType } })} />
        </ErrorBoundary></React.Suspense>
      </div>}
      {repository_model && visitedTabs.has("patch") && <div hidden={activeTab !== "patch"}>
        <React.Suspense fallback={<ViewSkeleton title="Patch Review" />}><ErrorBoundary feature="Patch Review">
          <PatchReviewView repoUrl={repoUrl} model={repository_model} trigger={patchTrigger}
            onOpenImpact={(path) => handleAnalyzeImpact({ file: path })}
            onOpenSource={(path) => openSource({ path })} />
        </ErrorBoundary></React.Suspense>
      </div>}
      {repository_model && visitedTabs.has("validation") && <div hidden={activeTab !== "validation"}>
        <React.Suspense fallback={<ViewSkeleton title="Validation" />}><ErrorBoundary feature="Validation">
          <ValidationView repoUrl={repoUrl} paths={selectedFile ? [selectedFile] : []} />
        </ErrorBoundary></React.Suspense>
      </div>}
      {activeTab === "report" && <div className="rounded-3xl border border-line bg-surface p-6 sm:p-12 shadow-card"><ReportView reportMarkdown={report} /></div>}
    </div>
    </WorkspaceShell>
  )
}

export default Dashboard
