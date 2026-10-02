/**
 * components/ExecutionFlow/EdgeDetailsCard.tsx
 * Floating details card displaying edge relationship, evidence, and confidence.
 */

import React from "react"
import type { ExecutionEdge, ExecutionStep } from "../../types/trace"
import { LinkIcon, ArrowRightIcon, XIcon, CheckCircleIcon, ZapIcon } from "../ui/icons"

interface EdgeDetailsCardProps {
  edge: ExecutionEdge | null
  sourceStep?: ExecutionStep | null
  targetStep?: ExecutionStep | null
  onClose: () => void
}

export const EdgeDetailsCard: React.FC<EdgeDetailsCardProps> = ({
  edge,
  sourceStep,
  targetStep,
  onClose,
}) => {
  if (!edge) return null

  const getConfBadge = (conf: string) => {
    if (conf === "HIGH") {
      return {
        label: "Confirmed by Evidence",
        color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      }
    }
    if (conf === "MEDIUM") {
      return {
        label: "Architectural Progression",
        color: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20",
      }
    }
    return {
      label: "Structural Inference",
      color: "text-slate-500 bg-slate-500/10 border-slate-500/20",
    }
  }

  const badge = getConfBadge(edge.confidence)

  return (
    <div className="absolute bottom-6 right-6 z-30 w-full max-w-sm rounded-3xl border border-line bg-surface/95 backdrop-blur-md p-5 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200 text-ink">
      <div className="flex items-center justify-between border-b border-line-subtle pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-brand-surface text-brand">
            <ZapIcon className="h-4 w-4" />
          </div>
          <span className="font-bold text-xs uppercase tracking-wider text-ink-secondary">
            Transition Relationship
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
      <div className="rounded-xl border border-line bg-surface-inset p-3 space-y-2 text-xs font-mono">
        <div className="flex items-center justify-between">
          <span className="text-ink-tertiary text-[10px] uppercase font-sans font-semibold">From Step</span>
          <span className="text-[10px] font-sans text-brand font-semibold">{sourceStep?.type.replace("_", " ")}</span>
        </div>
        <div className="font-semibold text-ink truncate">{sourceStep?.label || edge.source_step}</div>

        <div className="flex items-center justify-center my-1 text-brand">
          <div className="px-2.5 py-0.5 rounded-full bg-brand-surface text-[10px] font-sans font-bold border border-brand-border/40 flex items-center gap-1.5 shadow-subtle">
            <span>{edge.relationship}</span>
            <ArrowRightIcon className="h-3 w-3" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-ink-tertiary text-[10px] uppercase font-sans font-semibold">To Step</span>
          <span className="text-[10px] font-sans text-brand font-semibold">{targetStep?.type.replace("_", " ")}</span>
        </div>
        <div className="font-semibold text-ink truncate">{targetStep?.label || edge.target_step}</div>
      </div>

      {/* Confidence & Evidence */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-ink-secondary text-[11px]">Edge Confidence:</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.color}`}>
            {badge.label}
          </span>
        </div>

        {edge.evidence && (
          <div className="rounded-xl bg-surface-inset border border-line-subtle p-2.5 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold flex items-center gap-1">
              <CheckCircleIcon className="h-3 w-3 text-brand" />
              <span>Evidence Basis</span>
            </div>
            <p className="text-[11px] font-mono text-ink-secondary leading-relaxed break-words">
              {edge.evidence}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
