import React, { useState } from "react"
import type { SourceLocation } from "../types/source"
import type {
  FileModel,
  RepositoryModel,
  SymbolModel,
  DependencyEdge,
} from "../types/repository"
import {
  FileCodeIcon,
  LayersIcon,
  TagIcon,
  ZapIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  XIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DatabaseIcon,
  RouteIcon,
  LinkIcon,
  ComponentIcon,
  CodeIcon,
  MessageSquareIcon,
  WorkflowIcon,
} from "./ui/icons"

interface FileInspectorProps {
  filePath: string | null
  model: RepositoryModel
  onSelectFile: (path: string) => void
  onNavigateBack?: () => void
  onNavigateForward?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  onClose?: () => void
  onAskAboutFile?: (filePath: string) => void
  onTraceFile?: (filePath: string, symbol?: string) => void
  onTraceRoute?: (routeStr: string) => void
  onAnalyzeImpact?: (trigger: { file?: string; symbol?: string; route?: string }) => void
  onOpenSource?: (location: SourceLocation) => void
  onHumanize?: (path: string) => void
}

export const FileInspector: React.FC<FileInspectorProps> = ({
  filePath,
  model,
  onSelectFile,
  onNavigateBack,
  onNavigateForward,
  canGoBack = false,
  canGoForward = false,
  onClose,
  onAskAboutFile,
  onTraceFile,
  onTraceRoute,
  onAnalyzeImpact,
  onOpenSource,
  onHumanize,
}) => {
  const [showEvidence, setShowEvidence] = useState(false)
  const [expandedEdges, setExpandedEdges] = useState<Record<string, boolean>>({})

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-ink-tertiary h-full min-h-[350px]">
        <FileCodeIcon className="h-12 w-12 text-ink-tertiary/40 mb-3" strokeWidth={1.25} />
        <p className="text-sm font-medium text-ink-secondary">No File Selected</p>
        <p className="text-xs max-w-xs mt-1 text-ink-tertiary">
          Select any file from the repository explorer or a dependency link to inspect its structure and symbols.
        </p>
      </div>
    )
  }

  const fileData: FileModel | undefined = model.files[filePath]
  const fileName = filePath.split("/").pop() || filePath

  // Find symbols belonging to this file
  const fileSymbols: SymbolModel[] = (model.symbols || []).filter(
    (s) => s.file === filePath || s.file.replace(/\\/g, "/") === filePath
  )

  // Group symbols by type
  const components = fileSymbols.filter((s) => s.type === "component")
  const hooks = fileSymbols.filter((s) => s.type === "hook")
  const classes = fileSymbols.filter((s) => s.type === "class")
  const methods = fileSymbols.filter((s) => s.type === "method")
  const functions = fileSymbols.filter(
    (s) => s.type === "function" && !components.includes(s) && !hooks.includes(s)
  )
  const variables = fileSymbols.filter((s) => s.type === "variable" || s.type === "constant")

  // Find dependency edges originating from or pointing to this file
  const outgoingEdges: DependencyEdge[] = (model.dependencies || []).filter(
    (e) => e.source === filePath
  )

  // Find API routes in this file
  const fileRoutes = (model.api_routes || []).filter((r) => r.file === filePath)

  // Find database models in this file
  const fileDbModels = (model.database_models || []).filter((m) => m.file === filePath)

  // Find entry points matching this file
  const fileEntryPoint = (model.entry_points || []).find((ep) => ep.path === filePath)

  // Find which architecture layers contain this file
  const matchingLayers = Object.entries(model.architecture_layers || {})
    .filter(([_, files]) => files.includes(filePath))
    .map(([layerName]) => layerName)

  // Toggle evidence for a specific dependency edge
  const toggleEdgeEvidence = (key: string) => {
    setExpandedEdges((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const getMethodBadgeClass = (method: string) => {
    switch (method.toUpperCase()) {
      case "GET":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
      case "POST":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
      case "PUT":
      case "PATCH":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
      case "DELETE":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20"
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface divide-y divide-line-subtle text-ink">
      {/* 1. Header Toolbar */}
      <div className="p-4 sm:p-5 flex items-center justify-between gap-3 bg-surface-subtle/50">
        <div className="flex items-center gap-1">
          {onNavigateBack && (
            <button
              onClick={onNavigateBack}
              disabled={!canGoBack}
              className={`p-1.5 rounded-lg border border-line-subtle transition-all ${
                canGoBack
                  ? "text-ink hover:bg-surface-inset cursor-pointer"
                  : "text-ink-tertiary/40 border-transparent cursor-not-allowed"
              }`}
              title="Back"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
          )}

          {onNavigateForward && (
            <button
              onClick={onNavigateForward}
              disabled={!canGoForward}
              className={`p-1.5 rounded-lg border border-line-subtle transition-all ${
                canGoForward
                  ? "text-ink hover:bg-surface-inset cursor-pointer"
                  : "text-ink-tertiary/40 border-transparent cursor-not-allowed"
              }`}
              title="Forward"
            >
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onHumanize && <button onClick={() => onHumanize(filePath)} className="rounded-xl border border-brand-border bg-brand-surface px-3 py-1 text-xs font-semibold text-brand">Humanize</button>}
          {onOpenSource && <button onClick={() => onOpenSource({ path: filePath })} className="rounded-xl border border-brand-border bg-brand-surface px-3 py-1 text-xs font-semibold text-brand">View Source</button>}
          {onTraceFile && (
            <button
              onClick={() => onTraceFile(filePath)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all cursor-pointer shadow-subtle active:scale-[0.98]"
              title={`Trace execution starting from ${fileName}`}
            >
              <WorkflowIcon className="h-3.5 w-3.5" />
              <span>Trace Flow</span>
            </button>
          )}

          {onAnalyzeImpact && (
            <button
              onClick={() => onAnalyzeImpact({ file: filePath })}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white transition-all cursor-pointer shadow-subtle active:scale-[0.98]"
              title={`Analyze change blast radius for ${fileName}`}
            >
              <ZapIcon className="h-3.5 w-3.5" />
              <span>Analyze Impact</span>
            </button>
          )}

          {onAskAboutFile && (
            <button
              onClick={() => onAskAboutFile(filePath)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-border/40 bg-brand-surface/60 px-3 py-1 text-xs font-semibold text-brand hover:bg-brand hover:text-white transition-all cursor-pointer shadow-subtle active:scale-[0.98]"
              title={`Ask questions scoped to ${fileName}`}
            >
              <MessageSquareIcon className="h-3.5 w-3.5" />
              <span>Ask about file</span>
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink-tertiary hover:text-ink hover:bg-surface-inset transition-colors cursor-pointer"
              title="Close inspector"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. File Title & Summary Header */}
      <div className="p-5 sm:p-6 space-y-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink flex items-center gap-2 break-all">
              <FileCodeIcon className="h-5 w-5 text-brand shrink-0" strokeWidth={1.75} />
              <span>{fileName}</span>
            </h2>
          </div>
          <p className="text-xs font-mono text-ink-tertiary break-all select-all">
            {filePath}
          </p>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {fileData?.language && (
            <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-inset px-2.5 py-1 font-medium text-ink">
              <CodeIcon className="h-3 w-3 text-brand" />
              <span>{fileData.language}</span>
            </span>
          )}

          {fileData?.category && fileData.category !== "unknown" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-brand-border/40 bg-brand-surface px-2.5 py-1 font-medium text-brand-text">
              <TagIcon className="h-3 w-3 text-brand" />
              <span className="capitalize">{fileData.category.replace("-", " ")}</span>
            </span>
          )}

          {matchingLayers.map((layer) => (
            <span
              key={layer}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-inset px-2.5 py-1 text-ink-secondary"
            >
              <LayersIcon className="h-3 w-3 text-ink-tertiary" />
              <span>{layer}</span>
            </span>
          ))}

          {fileData?.confidence && (
            <span className="inline-flex items-center rounded-md border border-line-subtle px-2 py-0.5 text-[11px] text-ink-tertiary">
              {Math.round(fileData.confidence * 100)}% confidence
            </span>
          )}
        </div>

        {/* Entry Point Banner */}
        {fileEntryPoint && (
          <div className="rounded-xl border border-brand/30 bg-brand-surface/70 p-3.5 flex items-start gap-3 text-xs">
            <div className="p-1 rounded-md bg-brand text-white mt-0.5 shrink-0">
              <ZapIcon className="h-3.5 w-3.5" />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-brand-text flex items-center gap-2">
                <span>Application Entry Point</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full border border-brand-border bg-white dark:bg-canvas">
                  {fileEntryPoint.type}
                </span>
              </div>
              <p className="text-ink-secondary text-[11px] leading-relaxed">
                {fileEntryPoint.evidence}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Scrollable Content Body */}
      <div className="p-5 sm:p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-320px)] sm:max-h-[700px]">
        {/* API Routes Section */}
        {fileRoutes.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary flex items-center gap-2">
              <RouteIcon className="h-3.5 w-3.5 text-brand" />
              <span>API Routes ({fileRoutes.length})</span>
            </h3>
            <div className="space-y-2">
              {fileRoutes.map((route, i) => (
                <div
                  key={`${route.method}-${route.path}-${i}`}
                  className="rounded-xl border border-line bg-surface-inset p-3 space-y-1.5"
                >
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getMethodBadgeClass(
                        route.method
                      )}`}
                    >
                      {route.method}
                    </span>
                    <span className="font-semibold text-ink break-all">{route.path}</span>
                    {onTraceRoute && (
                      <button
                        onClick={() => onTraceRoute(`${route.method} ${route.path}`)}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-colors cursor-pointer shrink-0"
                        title={`Trace execution flow for ${route.method} ${route.path}`}
                      >
                        <WorkflowIcon className="h-3 w-3" />
                        <span>Trace</span>
                      </button>
                    )}
                    {onAnalyzeImpact && (
                      <button
                        onClick={() => onAnalyzeImpact({ file: filePath, route: route.path })}
                        className={`${onTraceRoute ? "" : "ml-auto"} inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white transition-colors cursor-pointer shrink-0`}
                        title={`Analyze impact of modifying ${route.path}`}
                      >
                        <ZapIcon className="h-3 w-3" />
                        <span>Impact</span>
                      </button>
                    )}
                  </div>
                  {onOpenSource && route.handler && <button onClick={() => {
                    const symbol = fileSymbols.find((item) => item.name === route.handler && item.line)
                    onOpenSource({ path: filePath, ...(symbol?.line ? { startLine: symbol.line, endLine: symbol.line } : {}) })
                  }} className="text-[10px] text-brand hover:underline">View handler source</button>}
                  {(route.handler || route.framework) && (
                    <div className="flex items-center gap-3 text-[11px] text-ink-tertiary">
                      {route.handler && (
                        <span>
                          Handler: <span className="font-mono text-ink">{route.handler}</span>
                        </span>
                      )}
                      {route.framework && (
                        <span className="capitalize">
                          Framework: <span className="text-brand font-medium">{route.framework}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Database Models Section */}
        {fileDbModels.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary flex items-center gap-2">
              <DatabaseIcon className="h-3.5 w-3.5 text-brand" />
              <span>Database Models ({fileDbModels.length})</span>
            </h3>
            <div className="space-y-2.5">
              {fileDbModels.map((modelItem) => (
                <div
                  key={modelItem.name}
                  className="rounded-xl border border-line bg-surface-inset p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-ink">{modelItem.name}</span>
                    {onOpenSource && <button onClick={() => {
                      const symbol = fileSymbols.find((item) => item.name === modelItem.name && item.line)
                      onOpenSource({ path: filePath, ...(symbol?.line ? { startLine: symbol.line, endLine: symbol.line } : {}) })
                    }} className="text-[10px] text-brand hover:underline">View model source</button>}
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-surface border border-line text-brand capitalize">
                      {modelItem.framework}
                    </span>
                  </div>

                  {modelItem.fields && modelItem.fields.length > 0 && (
                    <div className="border-t border-line-subtle pt-2 space-y-1">
                      <div className="text-[11px] font-medium text-ink-tertiary">Fields:</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[11px]">
                        {modelItem.fields.map((f, idx) => (
                          <div
                            key={idx}
                            className="truncate px-2 py-0.5 rounded bg-surface border border-line-subtle/50 text-ink-secondary"
                            title={f.definition || f.type}
                          >
                            <span className="font-semibold text-ink">{f.name}</span>
                            {(f.type || f.definition) && (
                              <span className="text-ink-tertiary ml-1.5 text-[10px]">
                                {f.type || f.definition}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Code Symbols Section */}
        {fileSymbols.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary flex items-center gap-2">
              <ComponentIcon className="h-3.5 w-3.5 text-brand" />
              <span>Extracted Code Symbols ({fileSymbols.length})</span>
            </h3>

            {/* React Components */}
            {components.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-brand uppercase tracking-wider">
                  React Components ({components.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {components.map((s) => (
                    <span
                      key={s.name}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border/40 bg-brand-surface px-2.5 py-1 font-mono text-xs font-medium text-brand-text"
                    >
                      <ComponentIcon className="h-3 w-3 text-brand" />
                      <span>{s.name}</span>
                      {onOpenSource && s.line && <button onClick={() => onOpenSource({ path: filePath, startLine: s.line!, endLine: s.line! })} className="text-[10px] text-brand hover:underline">View</button>}
                      {s.line && <span className="text-[10px] text-ink-tertiary">L{s.line}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hooks */}
            {hooks.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                  Hooks ({hooks.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {hooks.map((s) => (
                    <span
                      key={s.name}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-inset px-2.5 py-1 font-mono text-xs text-ink"
                    >
                      <span>{s.name}</span>
                      {s.line && <span className="text-[10px] text-ink-tertiary">L{s.line}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Classes */}
            {classes.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                  Classes ({classes.length})
                </span>
                <div className="space-y-1">
                  {classes.map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between rounded-lg border border-line bg-surface-inset px-2.5 py-1 font-mono text-xs text-ink"
                    >
                      <span className="font-semibold">{s.name}</span>
                      <div className="flex items-center gap-1.5 ml-auto">
                        {s.signature && (
                          <span className="text-[10px] text-ink-tertiary truncate max-w-xs">
                            {s.signature}
                          </span>
                        )}
                        {onAnalyzeImpact && (
                          <button
                            onClick={() => onAnalyzeImpact({ file: filePath, symbol: s.name })}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white transition-colors cursor-pointer shrink-0"
                            title={`Analyze impact of modifying ${s.name}`}
                          >
                            <ZapIcon className="h-2.5 w-2.5" />
                            <span>Impact</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Functions */}
            {functions.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                  Functions ({functions.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-xs">
                  {functions.slice(0, 16).map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between rounded-lg border border-line bg-surface-inset px-2 py-1 truncate text-ink"
                      title={s.signature || s.name}
                    >
                      <span className="truncate">{s.name}()</span>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        {s.line && <span className="text-[10px] text-ink-tertiary">L{s.line}</span>}
                        {onAnalyzeImpact && (
                          <button
                            onClick={() => onAnalyzeImpact({ file: filePath, symbol: s.name })}
                            className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-medium border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white transition-colors cursor-pointer"
                            title={`Analyze impact of modifying ${s.name}`}
                          >
                            <ZapIcon className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {functions.length > 16 && (
                  <p className="text-[10px] text-ink-tertiary italic">
                    + {functions.length - 16} more functions
                  </p>
                )}
              </div>
            )}

            {/* Methods */}
            {methods.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                  Methods ({methods.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-xs">
                  {methods.slice(0, 12).map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center justify-between rounded-lg border border-line bg-surface-inset px-2 py-1 truncate text-ink-secondary"
                    >
                      <span className="truncate">{s.name}</span>
                      {s.line && <span className="text-[10px] text-ink-tertiary ml-1">L{s.line}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dependencies Section ("Files this file depends on") */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary flex items-center justify-between">
            <span className="flex items-center gap-2">
              <LinkIcon className="h-3.5 w-3.5 text-brand" />
              <span>Dependencies ({fileData?.dependencies?.length || 0})</span>
            </span>
            <span className="text-[10px] text-ink-tertiary lowercase">Click to navigate</span>
          </h3>

          {fileData?.dependencies && fileData.dependencies.length > 0 ? (
            <div className="space-y-1.5">
              {fileData.dependencies.map((dep) => {
                const edge = outgoingEdges.find((e) => e.target === dep)
                const isEdgeExpanded = !!expandedEdges[dep]

                return (
                  <div
                    key={dep}
                    className="rounded-xl border border-line bg-surface-inset hover:border-brand-border transition-colors text-xs overflow-hidden"
                  >
                    <div className="p-2.5 flex items-center justify-between gap-2">
                      <button
                        onClick={() => onSelectFile(dep)}
                        className="font-mono text-brand hover:underline truncate text-left cursor-pointer flex items-center gap-1.5 flex-1"
                        title={`Navigate to ${dep}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                        <span className="truncate">{dep}</span>
                      </button>

                      {edge && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-surface border border-line text-ink-secondary">
                            {edge.type}
                          </span>
                          <button
                            onClick={() => toggleEdgeEvidence(dep)}
                            className="p-1 rounded text-ink-tertiary hover:text-ink cursor-pointer"
                            title="Details"
                          >
                            {isEdgeExpanded ? (
                              <ChevronDownIcon className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRightIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {edge && isEdgeExpanded && (
                      <div className="bg-surface border-t border-line-subtle px-3 py-2 text-[11px] text-ink-secondary space-y-1">
                        <div>
                          Evidence: <span className="font-mono text-ink">{edge.evidence}</span>
                        </div>
                        <div className="text-[10px] text-ink-tertiary">
                          Confidence: {Math.round(edge.confidence * 100)}%
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-3 rounded-xl border border-dashed border-line text-center text-xs text-ink-tertiary">
              No internal repository file dependencies.
            </div>
          )}
        </div>

        {/* Used By Section ("Files that depend on this file") */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary flex items-center justify-between">
            <span className="flex items-center gap-2">
              <LinkIcon className="h-3.5 w-3.5 text-brand rotate-180" />
              <span>Used By ({fileData?.dependents?.length || 0})</span>
            </span>
            <span className="text-[10px] text-ink-tertiary lowercase">Click to navigate</span>
          </h3>

          {fileData?.dependents && fileData.dependents.length > 0 ? (
            <div className="space-y-1.5">
              {fileData.dependents.map((dep) => (
                <button
                  key={dep}
                  onClick={() => onSelectFile(dep)}
                  className="w-full text-left rounded-xl border border-line bg-surface-inset p-2.5 font-mono text-xs text-ink hover:border-brand-border hover:text-brand transition-colors cursor-pointer flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate">{dep}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-xl border border-dashed border-line text-center text-xs text-ink-tertiary">
              No other repository files directly import this file.
            </div>
          )}
        </div>

        {/* Environment Variables */}
        {fileData?.env_vars && fileData.env_vars.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary flex items-center gap-2">
              <ZapIcon className="h-3.5 w-3.5 text-amber-500" />
              <span>Environment Variables ({fileData.env_vars.length})</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {fileData.env_vars.map((v) => (
                <span
                  key={v}
                  className="font-mono text-xs px-2.5 py-1 rounded-md border border-line bg-surface-inset text-amber-600 dark:text-amber-400 font-medium"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* External Imports List (Collapsible) */}
        {fileData?.imports && fileData.imports.length > 0 && (
          <div className="space-y-2 border-t border-line-subtle pt-4">
            <details className="text-xs group">
              <summary className="font-semibold text-ink-secondary cursor-pointer hover:text-ink flex items-center justify-between list-none">
                <span>Declared Imports ({fileData.imports.length})</span>
                <ChevronDownIcon className="h-3.5 w-3.5 text-ink-tertiary transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2.5 flex flex-wrap gap-1 max-h-40 overflow-y-auto p-1 font-mono text-[11px]">
                {fileData.imports.map((imp, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded bg-surface-inset border border-line-subtle text-ink-secondary truncate max-w-full"
                  >
                    {imp}
                  </span>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

export default FileInspector
