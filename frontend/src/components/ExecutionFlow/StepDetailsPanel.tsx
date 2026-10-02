/**
 * components/ExecutionFlow/StepDetailsPanel.tsx
 * Details panel for a selected execution step with inspection, graph, and Q&A actions.
 */

import React from "react"
import type { ExecutionStep } from "../../types/trace"
import {
  FileCodeIcon,
  LayersIcon,
  MessageSquareIcon,
  PlayIcon,
  XIcon,
  CheckCircleIcon,
  TagIcon,
  ZapIcon,
} from "../ui/icons"

interface StepDetailsPanelProps {
  step: ExecutionStep | null
  onClose: () => void
  onInspectFile: (filePath: string) => void
  onShowInGraph: (filePath: string) => void
  onAskAboutStep: (step: ExecutionStep) => void
  onTraceFromStep: (step: ExecutionStep) => void
  onAnalyzeImpact?: (trigger: { file?: string; symbol?: string; route?: string }) => void
}

export const StepDetailsPanel: React.FC<StepDetailsPanelProps> = ({
  step,
  onClose,
  onInspectFile,
  onShowInGraph,
  onAskAboutStep,
  onTraceFromStep,
  onAnalyzeImpact,
}) => {
  if (!step) return null

  const fileName = step.file.split("/").pop() || step.file

  return (
    <div className="flex flex-col h-full bg-surface border-l border-line text-ink divide-y divide-line-subtle overflow-y-auto animate-in fade-in slide-in-from-right-2 duration-200">
      {/* 1. Header */}
      <div className="p-4 sm:p-5 flex items-center justify-between gap-3 bg-surface-subtle/50">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-brand-surface text-brand">
            <ZapIcon className="h-4 w-4" />
          </div>
          <span className="font-bold text-xs uppercase tracking-wider text-ink-secondary">
            Step Details
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-ink-tertiary hover:text-ink hover:bg-surface-inset transition-colors cursor-pointer"
          title="Close details"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {/* 2. Step Title & Category */}
      <div className="p-5 sm:p-6 space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-brand-surface text-brand border border-brand-border/40">
              {step.type.replace("_", " ")}
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border uppercase tracking-wider ${
                step.confidence === "HIGH"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              }`}
            >
              {step.confidence} Confidence
            </span>
          </div>

          <h3 className="text-lg font-bold text-ink truncate leading-tight" title={step.label}>
            {step.label}
          </h3>

          <p className="text-xs font-mono text-ink-tertiary break-all select-all">
            {step.file}
            {step.line && <span className="text-brand font-semibold">:L{step.line}</span>}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => onInspectFile(step.file)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-inset px-3 py-2 text-xs font-semibold text-ink hover:border-brand-border hover:bg-brand-surface/20 transition-all cursor-pointer shadow-subtle active:scale-[0.98]"
          >
            <FileCodeIcon className="h-3.5 w-3.5 text-brand" />
            <span>Inspect File</span>
          </button>

          <button
            onClick={() => onShowInGraph(step.file)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-inset px-3 py-2 text-xs font-semibold text-ink hover:border-brand-border hover:bg-brand-surface/20 transition-all cursor-pointer shadow-subtle active:scale-[0.98]"
          >
            <LayersIcon className="h-3.5 w-3.5 text-brand" />
            <span>Show in Graph</span>
          </button>

          <button
            onClick={() => onAskAboutStep(step)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-inset px-3 py-2 text-xs font-semibold text-ink hover:border-brand-border hover:bg-brand-surface/20 transition-all cursor-pointer shadow-subtle active:scale-[0.98]"
          >
            <MessageSquareIcon className="h-3.5 w-3.5 text-brand" />
            <span>Ask Repo</span>
          </button>

          <button
            onClick={() => onTraceFromStep(step)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-hover transition-all cursor-pointer shadow-subtle active:scale-[0.98]"
          >
            <PlayIcon className="h-3.5 w-3.5" />
            <span>Trace From Here</span>
          </button>

          {onAnalyzeImpact && (
            <button
              onClick={() => onAnalyzeImpact({ file: step.file, symbol: step.symbol || undefined })}
              className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white transition-all cursor-pointer shadow-subtle active:scale-[0.98]"
            >
              <ZapIcon className="h-3.5 w-3.5" />
              <span>Analyze Change Impact</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Structural Properties */}
      <div className="p-5 sm:p-6 space-y-4 text-xs">
        <div className="space-y-2">
          <span className="font-semibold text-ink-secondary text-[11px] uppercase tracking-wider block">
            Architecture Attributes
          </span>

          <div className="rounded-xl border border-line bg-surface-inset p-3 space-y-2 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-ink-tertiary text-[11px]">Layer:</span>
              <span className="text-ink font-semibold capitalize">{step.architecture_layer}</span>
            </div>
            {step.symbol && (
              <div className="flex items-center justify-between">
                <span className="text-ink-tertiary text-[11px]">Symbol:</span>
                <span className="text-brand font-semibold">{step.symbol}()</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-ink-tertiary text-[11px]">Verification:</span>
              <span className="text-ink font-semibold">
                {step.confidence === "HIGH" ? "AST Verified" : "Structural Inferred"}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Analysis Evidence */}
        {step.evidence && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-ink-secondary text-[11px] uppercase tracking-wider">
              <CheckCircleIcon className="h-3.5 w-3.5 text-brand" />
              <span>Static Analysis Evidence</span>
            </div>
            <div className="rounded-xl bg-surface-inset border border-line-subtle p-3 text-ink-secondary font-mono text-[11px] leading-relaxed break-words">
              {step.evidence}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
