/**
 * components/ExecutionFlow/TraceHistory.tsx
 * Recent trace history chips allowing developers to quickly switch between recent queries.
 */

import React from "react"
import type { TraceHistoryItem, TraceTrigger } from "../../types/trace"
import { RotateCcwIcon, ZapIcon } from "../ui/icons"

interface TraceHistoryProps {
  history: TraceHistoryItem[]
  onSelectTrigger: (trigger: TraceTrigger) => void
}

export const TraceHistory: React.FC<TraceHistoryProps> = ({
  history,
  onSelectTrigger,
}) => {
  if (history.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary">
        <RotateCcwIcon className="h-3 w-3 text-ink-tertiary" />
        <span>Recent Traces:</span>
      </div>
      {history.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelectTrigger(item.trigger)}
          className="inline-flex items-center gap-1 rounded-lg border border-line-subtle bg-surface-inset px-2.5 py-1 text-xs text-ink-secondary hover:text-ink hover:border-brand-border transition-colors cursor-pointer"
          title={`Trace: ${item.title}`}
        >
          <ZapIcon className="h-3 w-3 text-brand shrink-0" />
          <span className="font-mono text-[11px] truncate max-w-[140px]">{item.title}</span>
        </button>
      ))}
    </div>
  )
}
