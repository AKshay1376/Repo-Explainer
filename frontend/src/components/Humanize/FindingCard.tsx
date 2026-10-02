import React from "react"
import type { HumanizeFinding } from "../../types/humanize"
import type { SourceLocation } from "../../types/source"
import type { PlanTrigger, PlanType } from "../../types/refactor"

interface FindingCardProps {
  path: string
  finding: HumanizeFinding
  onOpenSource: (location: SourceLocation) => void
  onCreatePlan?: (trigger: PlanTrigger) => void
}

export const FindingCard: React.FC<FindingCardProps> = ({ path, finding, onOpenSource, onCreatePlan }) => <article className="rounded-xl border border-line bg-surface-inset p-3 space-y-2">
  <div className="flex flex-wrap items-center gap-2">
    <span className="rounded bg-brand-surface px-2 py-0.5 text-[10px] font-semibold uppercase text-brand">{finding.category}</span>
    <span className="text-[10px] text-ink-tertiary">{finding.severity} severity · {finding.confidence} confidence · L{finding.line}{finding.end_line > finding.line ? `–${finding.end_line}` : ""}</span>
    <button type="button" className="ml-auto text-xs font-semibold text-brand hover:underline" onClick={() => onOpenSource({ path, startLine: finding.line, endLine: finding.end_line })}>View Source</button>
    {onCreatePlan && ["long_function", "branch_complexity", "deep_nesting", "repeated_block", "crowded_module", "large_class"].includes(finding.rule) && <button type="button" className="text-xs font-semibold text-brand hover:underline" onClick={() => {
      const planType: PlanType = finding.rule === "repeated_block" ? "merge_duplicate_helpers" : ["crowded_module", "large_class"].includes(finding.rule) ? "split_large_file" : "extract_function"
      const symbol = finding.message.match(/Function ([A-Za-z_][\w]*)/)?.[1]
      onCreatePlan({ planType, target: path, options: symbol ? { symbol, source_line: finding.line } : { source_line: finding.line } })
    }}>Create Refactor Plan</button>}
  </div>
  <p className="text-sm text-ink">{finding.message}</p>
  {finding.evidence && <code className="block overflow-auto rounded bg-surface px-2 py-1 text-[11px] text-ink-secondary">{finding.evidence}</code>}
  {finding.suggestion && <p className="text-xs text-ink-secondary">Suggestion: {finding.suggestion}</p>}
</article>
