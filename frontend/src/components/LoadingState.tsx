import React from "react"
import { ServerIcon, GitBranchIcon, ShieldCheckIcon, CpuIcon } from "./ui/icons"

interface LoadingStateProps {
  repoUrl: string
}

export const LoadingState: React.FC<LoadingStateProps> = ({ repoUrl }) => {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 bg-canvas">
      <div className="mx-auto max-w-lg w-full rounded-3xl border border-line bg-surface p-8 sm:p-10 shadow-card text-center">
        {/* Apple-style minimalist spinner */}
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-line-subtle border-t-brand" />
        </div>

        <h3 className="mt-6 text-xl font-bold tracking-tight text-ink">
          Analyzing Repository
        </h3>

        <p className="mt-2 text-xs font-mono text-ink break-all bg-surface-inset border border-line-subtle rounded-lg py-1.5 px-3">
          {repoUrl}
        </p>

        {/* Pipeline milestones */}
        <div className="mt-8 text-left border-t border-line-subtle pt-6">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary mb-4">
            Pipeline Execution
          </div>

          <div className="space-y-3.5">
            <div className="flex items-center gap-3 text-xs text-ink-secondary">
              <ServerIcon className="h-4 w-4 text-brand shrink-0" strokeWidth={1.75} />
              <span>Querying GitHub API metadata and file tree</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-ink-secondary">
              <GitBranchIcon className="h-4 w-4 text-brand shrink-0" strokeWidth={1.75} />
              <span>Detecting technology stack and scoring entry points</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-ink-secondary">
              <ShieldCheckIcon className="h-4 w-4 text-brand shrink-0" strokeWidth={1.75} />
              <span>Sanitizing secrets and enforcing safety limits</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-ink-secondary">
              <CpuIcon className="h-4 w-4 text-brand shrink-0" strokeWidth={1.75} />
              <span>Synthesizing evidence-grounded report</span>
            </div>
          </div>
        </div>

        <p className="mt-7 text-[11px] text-ink-tertiary">
          Typically completes in 5–15 seconds depending on repository volume.
        </p>
      </div>
    </div>
  )
}

export default LoadingState

