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
import { ArchitectureGraph } from "./ArchitectureGraph/ArchitectureGraph"
import { AskRepo } from "./AskRepo/AskRepo"
import { ExecutionFlowView } from "./ExecutionFlow/ExecutionFlowView"
import { ChangeImpactView } from "./ChangeImpact/ChangeImpactView"
import type { RepositoryModel } from "../types/repository"
import type { AskRepoScope } from "../types/qa"
import type { TraceTrigger, ExecutionFlow } from "../types/trace"
import type { ImpactTrigger } from "../types/impact"
import type { SourceLocation } from "../types/source"
import type { PlanTrigger } from "../types/refactor"

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
}

const RefactorPlannerView = React.lazy(() => import("./RefactorPlanner/RefactorPlannerView").then((module) => ({ default: module.RefactorPlannerView })))
const HumanizeView = React.lazy(() => import("./Humanize/HumanizeView").then((module) => ({ default: module.HumanizeView })))
const SourceViewer = React.lazy(() => import("./SourceViewer/SourceViewer").then((module) => ({ default: module.SourceViewer })))

export const Dashboard: React.FC<DashboardProps> = ({
  data,
  onReset,
  repoUrl,
}) => {
  const [copied, setCopied] = useState(false)
  const [isStructureOpen, setIsStructureOpen] = useState(false)

  const { info, tech_stack, folder_summary, key_files, report, repository_model } = data

  // Initial file selection: first entrypoint, or first key file, or first parsed file
  const initialFile = React.useMemo(() => {
    if (repository_model?.entry_points && repository_model.entry_points.length > 0) {
      return repository_model.entry_points[0].path
    }
    if (key_files && key_files.length > 0) {
      return key_files[0]
    }
    const all = Object.keys(repository_model?.files || {})
    return all.length ? all[0] : null
  }, [repository_model, key_files])

  const [selectedFile, setSelectedFile] = useState<string | null>(initialFile)
  const [history, setHistory] = useState<string[]>(initialFile ? [initialFile] : [])
  const [historyIndex, setHistoryIndex] = useState<number>(initialFile ? 0 : -1)
  const [activeTab, setActiveTab] = useState<"explorer" | "graph" | "ask" | "flow" | "impact" | "report" | "source" | "humanize" | "refactor">(
    repository_model ? "explorer" : "report"
  )
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set([repository_model ? "explorer" : "report"]))
  const [sourceLocation, setSourceLocation] = useState<SourceLocation | null>(null)
  const navigateTab = React.useCallback((tab: "explorer" | "graph" | "ask" | "flow" | "impact" | "report" | "source" | "humanize" | "refactor") => {
    setVisitedTabs((previous) => new Set(previous).add(tab))
    setActiveTab(tab)
  }, [])
  const openSource = React.useCallback((location: SourceLocation) => {
    setSourceLocation({ ...location, requestId: Date.now() })
    navigateTab("source")
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
  const [askScope, setAskScope] = useState<AskRepoScope | undefined>(undefined)
  const [traceTrigger, setTraceTrigger] = useState<TraceTrigger | undefined>(undefined)
  const [impactTrigger, setImpactTrigger] = useState<ImpactTrigger | null>(null)

  const handleAnalyzeImpact = (trigger: ImpactTrigger) => {
    setImpactTrigger(trigger)
    navigateTab("impact")
  }

  const handleSelectFile = (path: string, pushHistory = true) => {
    setSelectedFile(path)
    if (pushHistory) {
      const nextHistory = history.slice(0, historyIndex + 1).concat(path)
      setHistory(nextHistory)
      setHistoryIndex(nextHistory.length - 1)
    }
  }

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

  const handleNavigateBack = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1
      setHistoryIndex(newIdx)
      setSelectedFile(history[newIdx])
    }
  }

  const handleNavigateForward = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1
      setHistoryIndex(newIdx)
      setSelectedFile(history[newIdx])
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
  }

  const githubUrl = repoUrl.startsWith("http") ? repoUrl : `https://${repoUrl}`

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
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
          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                  selectedFile === file && activeTab === "explorer"
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

      {/* 3. Section Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-surface-subtle/80 border border-line">
          <button
            onClick={() => navigateTab("explorer")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "explorer"
                ? "bg-surface text-ink shadow-subtle border border-line"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <FolderTreeIcon className="h-4 w-4 text-brand" />
            <span>Interactive Code Explorer</span>
            {repository_model && (
              <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-brand-surface text-brand-text border border-brand-border/40 font-mono">
                {Object.keys(repository_model.files || {}).length} files
              </span>
            )}
          </button>

          <button
            onClick={() => navigateTab("graph")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "graph"
                ? "bg-surface text-ink shadow-subtle border border-line"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <LayersIcon className="h-4 w-4 text-brand" />
            <span>Architecture Graph</span>
          </button>

          <button
            onClick={() => navigateTab("ask")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "ask"
                ? "bg-surface text-ink shadow-subtle border border-line"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <MessageSquareIcon className="h-4 w-4 text-brand" />
            <span>Ask Repo</span>
          </button>

          <button
            onClick={() => navigateTab("flow")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "flow"
                ? "bg-surface text-ink shadow-subtle border border-line"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <WorkflowIcon className="h-4 w-4 text-brand" />
            <span>Execution Flow</span>
          </button>

          <button
            onClick={() => navigateTab("impact")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "impact"
                ? "bg-surface text-ink shadow-subtle border border-line"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <ZapIcon className="h-4 w-4 text-brand" />
            <span>Change Impact</span>
          </button>

          <button
            onClick={() => navigateTab("source")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${activeTab === "source" ? "bg-surface text-ink shadow-subtle border border-line" : "text-ink-secondary hover:text-ink"}`}
          ><CodeIcon className="h-4 w-4 text-brand" /><span>Source Code</span></button>

          <button onClick={() => navigateTab("humanize")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${activeTab === "humanize" ? "bg-surface text-ink shadow-subtle border border-line" : "text-ink-secondary hover:text-ink"}`}>
            <SparklesIcon className="h-4 w-4 text-brand" /><span>Humanize Codebase</span>
          </button>

          <button onClick={() => navigateTab("refactor")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-ink-secondary hover:text-ink"><WorkflowIcon className="h-4 w-4 text-brand" /><span>Refactor Planner</span></button>

          <button
            onClick={() => navigateTab("report")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "report"
                ? "bg-surface text-ink shadow-subtle border border-line"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            <FileCodeIcon className="h-4 w-4 text-brand" />
            <span>Executive Report</span>
          </button>
        </div>
      </div>

      {/* Views stay mounted after first visit so conversations and graph position survive navigation. */}
      {repository_model && visitedTabs.has("explorer") && <div hidden={activeTab !== "explorer"}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 rounded-3xl border border-line bg-surface shadow-card overflow-hidden">
            <RepositoryExplorer model={repository_model} selectedFile={selectedFile} onSelectFile={handleSelectFile} />
          </div>
          <div className="lg:col-span-7 rounded-3xl border border-line bg-surface shadow-card overflow-hidden sticky top-6">
            <FileInspector filePath={selectedFile} model={repository_model} onSelectFile={handleSelectFile}
              onNavigateBack={handleNavigateBack} onNavigateForward={handleNavigateForward} canGoBack={historyIndex > 0}
              canGoForward={historyIndex < history.length - 1} onClose={() => setSelectedFile(null)}
              onAskAboutFile={handleAskAboutFile} onTraceFile={handleTraceFile} onTraceRoute={handleTraceRoute}
              onAnalyzeImpact={handleAnalyzeImpact} onOpenSource={openSource} onHumanize={openHumanize} onCreatePlan={openPlan} />
          </div>
        </div>
      </div>}
      {repository_model && visitedTabs.has("graph") && <div hidden={activeTab !== "graph"} className="rounded-3xl border border-line bg-surface p-4 sm:p-6 shadow-card space-y-4">
        <ArchitectureGraph model={repository_model} selectedFile={selectedFile} onSelectFile={handleSelectFile}
          onNavigateBack={handleNavigateBack} onNavigateForward={handleNavigateForward} canGoBack={historyIndex > 0}
          canGoForward={historyIndex < history.length - 1} onAskAboutFile={handleAskAboutFile}
          onAskAboutEdge={handleAskAboutEdge} onTraceFile={handleTraceFile} onTraceRoute={handleTraceRoute}
          onTraceEdge={handleTraceEdge} onAnalyzeImpact={handleAnalyzeImpact} onOpenSource={openSource} />
      </div>}
      {visitedTabs.has("ask") && <div hidden={activeTab !== "ask"}>
        <AskRepo repoUrl={repoUrl} model={repository_model} initialScope={askScope}
          onInspectFile={handleInspectFileFromAsk} onShowInGraph={handleShowInGraphFromAsk}
          onTraceFlow={handleTraceFromAsk} onAnalyzeImpact={handleAnalyzeImpact} onOpenSource={openSource} onHumanize={openHumanize} />
      </div>}
      {repository_model && visitedTabs.has("flow") && <div hidden={activeTab !== "flow"}>
        <ExecutionFlowView repoUrl={repoUrl} model={repository_model} initialTrigger={traceTrigger}
          onInspectFile={handleInspectFileFromAsk} onShowInGraph={handleShowInGraphFromAsk}
          onExplainFlowWithAsk={handleExplainFlowWithAsk} onAnalyzeImpact={handleAnalyzeImpact}
          onOpenSource={(step) => openSource(sourceForStep(step, repository_model))} onHumanize={openHumanize} onCreatePlan={openPlan} />
      </div>}
      {repository_model && visitedTabs.has("impact") && <div hidden={activeTab !== "impact"} className="rounded-3xl border border-line bg-surface p-4 sm:p-6 shadow-card space-y-4">
        <ChangeImpactView repoUrl={repoUrl} repositoryModel={repository_model} trigger={impactTrigger}
          onSelectFile={handleSelectFile} onNavigateTab={(tab) => navigateTab(tab as "explorer" | "graph")}
          onTraceFlow={handleTraceFile} onAskRepo={() => { setAskScope(undefined); navigateTab("ask") }}
          onOpenSource={(node) => openSource(sourceForImpact(node, repository_model))} onHumanize={openHumanize} onCreatePlan={openPlan} />
      </div>}
      {repository_model && visitedTabs.has("source") && <div hidden={activeTab !== "source"}>
        <React.Suspense fallback={<p className="p-8 text-sm text-ink-secondary">Loading source viewer…</p>}>
          <SourceViewer repoUrl={repoUrl} model={repository_model} location={sourceLocation} onNavigate={setSourceLocation} visible={activeTab === "source"} onHumanize={openHumanize} onCreatePlan={openPlan} />
        </React.Suspense>
      </div>}
      {repository_model && visitedTabs.has("humanize") && <div hidden={activeTab !== "humanize"}>
        <React.Suspense fallback={<p className="p-8 text-sm text-ink-secondary">Loading Humanize…</p>}>
          <HumanizeView repoUrl={repoUrl} model={repository_model} target={humanizeTarget}
            onOpenSource={openSource} onAnalyzeImpact={handleAnalyzeImpact} onAskRepo={handleAskAboutFile} onCreatePlan={openPlan} />
        </React.Suspense>
      </div>}
      {repository_model && visitedTabs.has("refactor") && <div hidden={activeTab !== "refactor"}>
        <React.Suspense fallback={<p className="p-8 text-sm text-ink-secondary">Loading planner…</p>}>
          <RefactorPlannerView repoUrl={repoUrl} model={repository_model} trigger={planTrigger}
            onOpenSource={openSource} onOpenImpact={(path) => handleAnalyzeImpact({ file: path })}
            onOpenGraph={handleShowInGraphFromAsk} />
        </React.Suspense>
      </div>}
      {activeTab === "report" && <div className="rounded-3xl border border-line bg-surface p-6 sm:p-12 shadow-card"><ReportView reportMarkdown={report} /></div>}
    </div>
  )
}

export default Dashboard
