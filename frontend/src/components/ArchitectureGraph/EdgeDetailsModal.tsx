import React from "react"
import type { GraphEdgeData } from "../../types/graph"
import { LinkIcon, ArrowRightIcon, XIcon, CheckCircleIcon, MessageSquareIcon, WorkflowIcon, ZapIcon } from "../ui/icons"

interface EdgeDetailsModalProps {
  edgeData: GraphEdgeData | null
  onClose: () => void
  onSelectFile?: (path: string) => void
  onOpenSource?: (path: string) => void
  onAskAboutEdge?: (edgeData: GraphEdgeData) => void
  onTraceEdge?: (edgeData: GraphEdgeData) => void
  onAnalyzeImpact?: (trigger: { file?: string }) => void
}

export const EdgeDetailsModal: React.FC<EdgeDetailsModalProps> = ({
  edgeData,
  onClose,
  onSelectFile,
  onOpenSource,
  onAskAboutEdge,
  onTraceEdge,
  onAnalyzeImpact,
}) => {
  if (!edgeData) return null

  const getConfidenceLabel = (conf: number) => {
    if (conf >= 0.85) return { label: "High Confidence", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20" }
    if (conf >= 0.6) return { label: "Medium Confidence", color: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20" }
    return { label: "Low Confidence", color: "text-slate-500 bg-slate-500/10 border-slate-500/20" }
  }

  const confInfo = getConfidenceLabel(edgeData.confidence)
  const isLayerEdge = edgeData.source.startsWith("layer-")

  return (
    <div className="absolute bottom-6 right-6 z-30 w-full max-w-sm rounded-3xl border border-line bg-surface/95 backdrop-blur-md p-5 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between border-b border-line-subtle pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-brand-surface text-brand">
            <LinkIcon className="h-4 w-4" />
          </div>
          <span className="font-bold text-xs uppercase tracking-wider text-ink-secondary">
            Relationship Details
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-ink-tertiary hover:text-ink hover:bg-surface-inset transition-colors cursor-pointer"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Nodes Connection */}
      <div className="space-y-2">
        <div className="rounded-xl border border-line bg-surface-inset p-3 space-y-2 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-ink-tertiary text-[10px] uppercase font-sans font-semibold">Source</span>
            {!isLayerEdge && onSelectFile && (
              <button
                onClick={() => onSelectFile(edgeData.source)}
                className="text-[10px] font-sans text-brand hover:underline cursor-pointer"
              >
                Inspect
              </button>
            )}
          </div>
          <div className="font-semibold text-ink truncate select-all">{edgeData.source.replace("layer-", "")}</div>
          {!isLayerEdge && onOpenSource && <button onClick={() => onOpenSource(edgeData.source)} className="text-[10px] text-brand hover:underline">Source code</button>}

          <div className="flex items-center justify-center my-1 text-brand">
            <div className="px-2 py-0.5 rounded-full bg-brand-surface text-[10px] font-sans font-bold border border-brand-border/40 flex items-center gap-1">
              <span>{edgeData.type}</span>
              <ArrowRightIcon className="h-3 w-3" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-ink-tertiary text-[10px] uppercase font-sans font-semibold">Target</span>
            {!isLayerEdge && onSelectFile && (
              <button
                onClick={() => onSelectFile(edgeData.target)}
                className="text-[10px] font-sans text-brand hover:underline cursor-pointer"
              >
                Inspect
              </button>
            )}
          </div>
          <div className="font-semibold text-ink truncate select-all">{edgeData.target.replace("layer-", "")}</div>
          {!isLayerEdge && onOpenSource && <button onClick={() => onOpenSource(edgeData.target)} className="text-[10px] text-brand hover:underline">Source code</button>}
        </div>
      </div>

      {/* Evidence & Confidence */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-ink-secondary text-[11px]">Analysis Confidence:</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${confInfo.color}`}>
            {confInfo.label}
          </span>
        </div>

        {edgeData.evidence && (
          <div className="rounded-xl bg-surface-inset border border-line-subtle p-2.5 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold flex items-center gap-1">
              <CheckCircleIcon className="h-3 w-3 text-brand" />
              <span>Evidence</span>
            </div>
            <p className="text-[11px] font-mono text-ink-secondary leading-relaxed break-words">
              {edgeData.evidence}
            </p>
          </div>
        )}

        {onTraceEdge && !isLayerEdge && (
          <button
            onClick={() => onTraceEdge(edgeData)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-subtle hover:bg-indigo-700 active:scale-[0.98] transition-all cursor-pointer"
          >
            <WorkflowIcon className="h-3.5 w-3.5" />
            <span>Trace this execution path</span>
          </button>
        )}

        {onAnalyzeImpact && !isLayerEdge && (
          <button
            onClick={() => onAnalyzeImpact({ file: edgeData.target })}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white shadow-subtle hover:bg-sky-700 active:scale-[0.98] transition-all cursor-pointer"
          >
            <ZapIcon className="h-3.5 w-3.5" />
            <span>Analyze Impact on Target</span>
          </button>
        )}

        {onAskAboutEdge && (
          <button
            onClick={() => onAskAboutEdge(edgeData)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white shadow-subtle hover:bg-brand-hover active:scale-[0.98] transition-all cursor-pointer"
          >
            <MessageSquareIcon className="h-3.5 w-3.5" />
            <span>Ask about this relationship</span>
          </button>
        )}
      </div>
    </div>
  )
}
