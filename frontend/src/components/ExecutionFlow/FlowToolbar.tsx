/**
 * components/ExecutionFlow/FlowToolbar.tsx
 * Top toolbar for Execution Flow view: feature search input, alternative path switcher,
 * layout direction, flow metrics, and AI explanation trigger.
 */

import React, { useState } from "react"
import type { ExecutionFlow } from "../../types/trace"
import {
  SearchIcon,
  PlayIcon,
  MessageSquareIcon,
  SparklesIcon,
  CheckCircleIcon,
  ZapIcon,
  ArrowRightIcon,
  ChevronDownIcon,
} from "../ui/icons"

interface FlowToolbarProps {
  flows: ExecutionFlow[]
  activeFlow: ExecutionFlow | null
  activeFlowId: string | null
  onSelectFlow: (flowId: string) => void
  onSearch: (query: string) => void
  direction: "TB" | "LR"
  onToggleDirection: () => void
  onFitView: () => void
  onExplainFlow: (flow: ExecutionFlow) => void
  isLoading: boolean
}

export const FlowToolbar: React.FC<FlowToolbarProps> = ({
  flows,
  activeFlow,
  activeFlowId,
  onSelectFlow,
  onSearch,
  direction,
  onToggleDirection,
  onFitView,
  onExplainFlow,
  isLoading,
}) => {
  const [queryInput, setQueryInput] = useState("")

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!queryInput.trim() || isLoading) return
    onSearch(queryInput.trim())
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:p-5 border-b border-line bg-surface-subtle/50 text-ink">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-tertiary" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Trace feature (e.g. login, checkout, registration)..."
              disabled={isLoading}
              className="w-full rounded-xl border border-line bg-surface pl-9 pr-3 py-2 text-xs text-ink placeholder:text-ink-tertiary focus:border-brand focus:outline-none shadow-subtle"
            />
          </div>
          <button
            type="submit"
            disabled={!queryInput.trim() || isLoading}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-subtle transition-all cursor-pointer ${
              queryInput.trim() && !isLoading
                ? "bg-brand text-white hover:bg-brand-hover active:scale-[0.98]"
                : "bg-surface-inset text-ink-tertiary border border-line-subtle cursor-not-allowed"
            }`}
          >
            {isLoading ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <PlayIcon className="h-3.5 w-3.5" />
            )}
            <span>Trace</span>
          </button>
        </form>

        {/* Right Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Layout Direction Toggle */}
          <button
            onClick={onToggleDirection}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:border-brand-border transition-colors cursor-pointer shadow-subtle"
            title="Toggle Flow Direction (Top-to-Bottom / Left-to-Right)"
          >
            <span className="text-[10px] uppercase font-bold text-ink-tertiary font-mono">
              {direction}
            </span>
            <span>{direction === "TB" ? "Vertical" : "Horizontal"}</span>
          </button>

          {/* Fit View */}
          <button
            onClick={onFitView}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:border-brand-border transition-colors cursor-pointer shadow-subtle"
            title="Reset zoom & center flow"
          >
            <span>Center View</span>
          </button>

          {/* Explain Flow with AI / Ask Repo */}
          {activeFlow && (
            <button
              onClick={() => onExplainFlow(activeFlow)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-border/40 bg-brand-surface px-3.5 py-2 text-xs font-semibold text-brand hover:bg-brand hover:text-white transition-all cursor-pointer shadow-subtle active:scale-[0.98]"
              title="Explain this execution path with Ask Repo"
            >
              <MessageSquareIcon className="h-3.5 w-3.5" />
              <span>Explain Flow</span>
            </button>
          )}
        </div>
      </div>

      {/* Path Selector Tabs (Primary vs Alternatives) */}
      {flows.length > 0 && activeFlow && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary mr-1">
              Path:
            </span>
            {flows.map((flow, index) => {
              const isActive = flow.id === activeFlowId
              const label = flow.is_primary ? "Primary Path" : `Alternative ${index}`

              return (
                <button
                  key={flow.id}
                  onClick={() => onSelectFlow(flow.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-brand text-white shadow-subtle"
                      : "bg-surface border border-line text-ink-secondary hover:text-ink hover:border-brand-border"
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? "bg-white/20 text-white" : "bg-surface-inset text-ink-tertiary"
                    }`}
                  >
                    {flow.steps.length} steps
                  </span>
                </button>
              )
            })}
          </div>

          {/* Flow Badges */}
          <div className="flex items-center gap-2 text-xs">
            {activeFlow.cycle_detected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                <ZapIcon className="h-3 w-3" />
                <span>Cycle Detected</span>
              </span>
            )}

            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border uppercase tracking-wider ${
                activeFlow.confidence === "HIGH"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              }`}
            >
              <CheckCircleIcon className="h-3 w-3" />
              <span>{activeFlow.confidence} Confidence</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
