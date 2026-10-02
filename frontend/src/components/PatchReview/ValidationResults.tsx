import React from "react"
import type { PatchSet } from "../../types/patch"

export const ValidationResults: React.FC<{ validation: PatchSet["validation"] }> = ({ validation }) => <section aria-label="Validation results" className="rounded-xl border border-line bg-surface-inset p-4 space-y-2 text-xs text-ink-secondary">
  <h3 className="font-semibold text-ink">Validation: {validation.state}</h3>
  {validation.graph && <div className="flex flex-wrap gap-2" aria-label="Validation dependency graph">{validation.graph.map((stage) => <span key={stage.name} className="rounded-full border border-line px-2 py-1">{stage.name}: {stage.state}</span>)}</div>}
  {validation.checks.map((check, index) => <p key={index}>{check.state} · {check.command} · exit {check.exit_code ?? "not run"} · {check.output_summary}</p>)}
  {validation.note && <p>{validation.note}</p>}
</section>
