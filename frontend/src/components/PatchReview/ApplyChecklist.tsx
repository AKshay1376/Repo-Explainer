import React from "react"
import type { PatchSet } from "../../types/patch"

export const ApplyChecklist: React.FC<{ patch: PatchSet; validation: PatchSet["validation"] | null; selected: string[]; highRisk: boolean; publicApi: boolean; onHighRisk: (value: boolean) => void; onPublicApi: (value: boolean) => void }> = ({ patch, validation, selected, highRisk, publicApi, onHighRisk, onPublicApi }) => {
  const checks = validation?.checklist
  return <div className="rounded-xl border border-line bg-surface-inset p-4 space-y-2 text-xs text-ink-secondary" aria-label="Pre-apply checklist">
    <h3 className="font-semibold text-ink">Pre-apply checklist</h3>
    <p>{selected.length} hunk{selected.length === 1 ? "" : "s"} selected · validation {validation?.state || "NOT_RUN"}</p>
    {checks ? <>{Object.entries(checks).filter(([name]) => !name.endsWith("_required")).map(([name, passed]) => <p key={name}>{passed ? "✓" : "□"} {name.replace(/_/g, " ")}</p>)}</> : <p>Run validation on this exact selection before applying.</p>}
    {patch.risk_level === "HIGH" && <label className="flex gap-2"><input type="checkbox" checked={highRisk} onChange={(event) => onHighRisk(event.target.checked)} /> I acknowledge this high-risk change.</label>}
    {patch.files.some((file) => file.public_api_change) && <label className="flex gap-2"><input type="checkbox" checked={publicApi} onChange={(event) => onPublicApi(event.target.checked)} /> I explicitly approve the public API change.</label>}
  </div>
}
