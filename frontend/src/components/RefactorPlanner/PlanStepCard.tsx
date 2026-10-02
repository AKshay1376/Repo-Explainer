import React from "react"
import type { PlanStep } from "../../types/refactor"
import type { SourceLocation } from "../../types/source"

interface Props {
  step: PlanStep
  onOpenSource: (location: SourceLocation) => void
  onOpenImpact: (path: string) => void
  onOpenGraph: (path: string) => void
  onGeneratePatch?: (stepId: string) => void
}

export const PlanStepCard: React.FC<Props> = ({ step, onOpenSource, onOpenImpact, onOpenGraph, onGeneratePatch }) => {
  const first = step.source_locations[0]
  const path = first?.path || step.affected_files[0]
  const patchSupport = step.can_auto_preview && step.confidence === "HIGH" ? "Verified" :
    step.can_auto_preview || (["move_file", "move_module"].includes(step.change_type) && ["move", "compatibility"].includes(step.id))
      ? "Preview Only" : "Manual"
  return <article className="rounded-xl border border-line bg-surface-inset p-4 space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded bg-brand-surface px-2 py-1 text-xs font-bold text-brand">{step.order}</span>
      <h4 className="text-sm font-semibold text-ink">{step.title}</h4>
      <span className="ml-auto text-[11px] text-ink-tertiary">{step.risk_level} risk · {step.confidence} confidence</span>
    </div>
    <p className="text-xs text-ink-secondary">{step.description}</p>
    <p className="text-[11px] text-ink-tertiary">Patch Support: {patchSupport} · Prerequisites: {step.prerequisites.join(", ") || "none"} · {step.requires_manual_review ? "Manual review" : "Validation gate"}</p>
    <div className="flex flex-wrap gap-2">
      {path && <button onClick={() => onOpenSource({ path, ...(first?.line ? { startLine: first.line, endLine: first.line } : {}) })} className="text-xs font-semibold text-brand">View Source</button>}
      {path && <button onClick={() => onOpenImpact(path)} className="text-xs font-semibold text-brand">View Impact</button>}
      {path && <button onClick={() => onOpenGraph(path)} className="text-xs font-semibold text-brand">View Graph</button>}
      {onGeneratePatch && <button onClick={() => onGeneratePatch(step.id)} className="text-xs font-semibold text-brand">Generate Patch</button>}
    </div>
    {step.source_locations.length > 1 && <div className="flex flex-wrap gap-2">
      {step.source_locations.slice(1, 12).map((location, index) => <button key={`${location.path}:${location.line}:${index}`}
        onClick={() => onOpenSource({ path: location.path, ...(location.line ? { startLine: location.line, endLine: location.line } : {}) })}
        className="text-[11px] text-brand hover:underline">{location.kind}: {location.path}{location.line ? `:${location.line}` : ""}</button>)}
    </div>}
    {step.affected_files.length > 0 && <p className="text-[11px] text-ink-tertiary break-all">Files: {step.affected_files.join(", ")}</p>}
    {step.validation.length > 0 && <p className="text-[11px] text-ink-tertiary">Validation: {step.validation.join("; ")}</p>}
  </article>
}
