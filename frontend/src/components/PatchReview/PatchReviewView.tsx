import React, { useEffect, useState } from "react"
import type { RepositoryModel } from "../../types/repository"
import type { PatchTrigger } from "../../types/patch"
import { usePatchEngine } from "../../hooks/usePatchEngine"
import { PatchDiff } from "./PatchDiff"
import { PatchFileList } from "./PatchFileList"
import { ApplyChecklist } from "./ApplyChecklist"
import { ValidationResults } from "./ValidationResults"
import { PatchHistory } from "./PatchHistory"
import { RollbackPanel } from "./RollbackPanel"
import { canApplyPatch, hunkIds } from "../../lib/patchSelection"

const ValidationView = React.lazy(() => import("../Validation/ValidationView").then((module) => ({ default: module.ValidationView })))

interface Props {
  repoUrl: string
  model: RepositoryModel
  trigger?: PatchTrigger | null
  onOpenImpact: (path: string) => void
  onOpenSource: (path: string) => void
}

export const PatchReviewView: React.FC<Props> = ({ repoUrl, model, trigger, onOpenImpact, onOpenSource }) => {
  const { patch, historical, history, loading, error, validation, selectedDiff, postImpact, setValidation, setSelectedDiff, generate, generateGroup, generateVerified, generateAi, validate, apply, accept, reject, reanalyzeImpact, rollbackId, load, refreshHistory } = usePatchEngine(repoUrl, model)
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode] = useState<"unified" | "side-by-side">("unified")
  const [highRisk, setHighRisk] = useState(false)
  const [publicApi, setPublicApi] = useState(false)
  const [confirmApply, setConfirmApply] = useState(false)
  const [runProjectValidation, setRunProjectValidation] = useState(false)
  const [confirmConflict, setConfirmConflict] = useState(false)
  const [rollbackPaths, setRollbackPaths] = useState<string[]>([])
  const [manualPath, setManualPath] = useState("")
  const [start, setStart] = useState(1)
  const [end, setEnd] = useState(1)
  const [replacement, setReplacement] = useState("")
  const [aiInstructions, setAiInstructions] = useState("")
  const [aiConsent, setAiConsent] = useState(false)
  const [groupPaths, setGroupPaths] = useState("")
  const [groupSuggestion, setGroupSuggestion] = useState("trailing_whitespace")
  const [transformation, setTransformation] = useState<"trim_trailing_whitespace" | "replace_range">("trim_trailing_whitespace")
  const [oldName, setOldName] = useState("")
  const [newName, setNewName] = useState("")
  const [helperFunction, setHelperFunction] = useState("")
  const [helperLine, setHelperLine] = useState(1)

  useEffect(() => { void refreshHistory() }, [refreshHistory])
  useEffect(() => { if (trigger) { setManualPath(trigger.path); void generate(trigger) } }, [trigger?.requestId])
  useEffect(() => {
    if (patch) { setSelected(hunkIds(patch.files)); setRollbackPaths(patch.files.flatMap((file) => file.operation === "move" && file.destination_path ? [file.path, file.destination_path] : [file.path])); setConfirmApply(false); setHighRisk(false); setPublicApi(false) }
  }, [patch?.id])
  useEffect(() => { if (patch) setRollbackPaths(patch.files.flatMap((file) => file.operation === "move" && file.destination_path ? [file.path, file.destination_path] : [file.path]).filter((path) => !patch.rolled_back_files?.includes(path))) }, [patch?.rolled_back_files?.join("|")])
  useEffect(() => { if (historical) setRollbackPaths(historical.files.filter((path) => !historical.rolled_back_files?.includes(path))) }, [historical?.id, historical?.rolled_back_files?.join("|")])
  const changeSelection = (ids: string[]) => { setSelected(ids); setValidation(null); setSelectedDiff(null); setConfirmApply(false) }
  const canApply = canApplyPatch(patch, selected, validation, confirmApply, highRisk, publicApi)

  return <section className="space-y-5" aria-label="Patch Review">
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3">
      <h2 className="text-lg font-bold text-ink">Patch Review</h2>
      <p className="text-xs text-ink-secondary">Preview and validate changes for one configured local checkout. Set PATCH_LOCAL_ROOT on the backend. Generation never writes source files.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-ink-secondary">Local relative file path<input value={manualPath} onChange={(event) => setManualPath(event.target.value)} list="patch-paths" className="rounded-lg border border-line bg-surface p-2 text-xs text-ink" /><datalist id="patch-paths">{Object.keys(model.files || {}).map((path) => <option key={path} value={path} />)}</datalist></label>
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">Start line<input type="number" min={1} value={start} onChange={(event) => setStart(Number(event.target.value))} className="w-20 rounded-lg border border-line bg-surface p-2 text-xs text-ink" /></label>
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">End line<input type="number" min={1} value={end} onChange={(event) => setEnd(Number(event.target.value))} className="w-20 rounded-lg border border-line bg-surface p-2 text-xs text-ink" /></label>
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">Transformation<select value={transformation} onChange={(event) => setTransformation(event.target.value as typeof transformation)} className="rounded-lg border border-line bg-surface p-2 text-xs text-ink"><option value="trim_trailing_whitespace">Trim whitespace</option><option value="replace_range">Replace selected lines</option></select></label>
      </div>
      {transformation === "replace_range" && <textarea value={replacement} onChange={(event) => setReplacement(event.target.value)} aria-label="Replacement source" placeholder="Replacement source for selected lines" className="h-28 w-full rounded-lg border border-line bg-surface p-2 font-mono text-xs text-ink" />}
      <button disabled={loading || !manualPath.trim()} onClick={() => void generate({ source: "selection", path: manualPath.trim(), startLine: start, endLine: end, transformation, replacement })} className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40">Generate selected-range preview</button>
      <div className="rounded-xl border border-line bg-surface-inset p-3 space-y-2 text-xs text-ink-secondary"><strong className="text-ink">Verified Python transformations</strong>
        <div className="flex flex-wrap gap-2"><button disabled={loading || !manualPath.trim()} onClick={() => void generateVerified(manualPath.trim(), "import_consolidation")} className="rounded-lg border border-brand-border px-3 py-1.5 text-brand disabled:opacity-40">Preview import consolidation</button>
          <input value={oldName} onChange={(event) => setOldName(event.target.value)} placeholder="Old wrapper name" aria-label="Old wrapper name" className="rounded-lg border border-line bg-surface px-2 py-1" />
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Existing function" aria-label="Existing function" className="rounded-lg border border-line bg-surface px-2 py-1" />
          <button disabled={loading || !manualPath.trim() || !oldName || !newName} onClick={() => void generateVerified(manualPath.trim(), "compatibility_wrapper", { old: oldName, new: newName })} className="rounded-lg border border-brand-border px-3 py-1.5 text-brand disabled:opacity-40">Preview wrapper</button></div>
        <div className="flex flex-wrap gap-2"><input value={helperFunction} onChange={(event) => setHelperFunction(event.target.value)} placeholder="Function containing assignment" aria-label="Function containing assignment" className="rounded-lg border border-line bg-surface px-2 py-1" />
          <input type="number" min={1} value={helperLine} onChange={(event) => setHelperLine(Number(event.target.value))} aria-label="Assignment line" className="w-20 rounded-lg border border-line bg-surface px-2 py-1" />
          <button disabled={loading || !manualPath.trim() || !helperFunction || !newName} onClick={() => void generateVerified(manualPath.trim(), "helper_extraction", { function: helperFunction, line: helperLine, helper: newName })} className="rounded-lg border border-brand-border px-3 py-1.5 text-brand disabled:opacity-40">Preview pure helper extraction</button></div></div>
      <div className="rounded-xl border border-line bg-surface-inset p-3 space-y-2 text-xs text-ink-secondary"><strong className="text-ink">Group safe Humanize changes</strong><p>Enter up to 20 local relative paths, one per line. Every file and hunk remains individually selectable.</p><textarea value={groupPaths} onChange={(event) => setGroupPaths(event.target.value)} aria-label="Grouped patch paths" placeholder={"src/one.py\nsrc/two.py"} className="h-20 w-full rounded-lg border border-line bg-surface p-2 font-mono text-xs text-ink" /><select value={groupSuggestion} onChange={(event) => setGroupSuggestion(event.target.value)} aria-label="Grouped transformation" className="rounded-lg border border-line bg-surface p-2 text-xs text-ink"><option value="trailing_whitespace">Trim trailing whitespace</option><option value="final_newline">Add final newline</option><option value="blank_lines">Limit blank lines</option></select><button disabled={loading || !groupPaths.trim()} onClick={() => void generateGroup(groupPaths.split(/\r?\n/).map((path) => path.trim()).filter(Boolean), groupSuggestion)} className="ml-2 rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 font-semibold text-brand disabled:opacity-40">Generate grouped preview</button></div>
      <div className="rounded-xl border border-line bg-surface-inset p-3 space-y-2 text-xs text-ink-secondary"><strong className="text-ink">Optional AI patch preview</strong><p>Only the bounded, secret-checked local target is sent to the configured provider after this explicit request. Output remains preview-only.</p><input value={aiInstructions} onChange={(event) => setAiInstructions(event.target.value)} maxLength={500} placeholder="Rewrite guidance" aria-label="AI rewrite guidance" className="w-full rounded-lg border border-line bg-surface p-2 text-xs text-ink" /><label className="flex gap-2"><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} /> I explicitly request an AI patch preview.</label><button disabled={!aiConsent || loading || !manualPath.trim()} onClick={() => { setAiConsent(false); void generateAi(manualPath.trim(), aiInstructions) }} className="rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 font-semibold text-brand disabled:opacity-40">Generate AI preview</button></div>
      {loading && <p role="status" className="text-xs text-ink-secondary">Working…</p>}
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    </div>
    {patch && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
      <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto font-semibold text-ink">{patch.summary}</h3><span className="text-xs text-ink-secondary">{patch.status} · {patch.risk_level} risk · {patch.id.slice(0, 12)}</span></div>
      <p className="text-xs text-ink-secondary">Patch confidence: <strong>{patch.confidence || "HIGH"}</strong> · {patch.confidence !== "HIGH" && (patch.source === "planner" || patch.source === "verified") ? "Preview Only" : "review and validate before apply"}</p>
      <p className="text-xs text-ink-secondary">Revision {patch.repo_revision.slice(0, 12)} · {patch.git.available ? `${patch.git.branch} · ${patch.git.dirty ? "dirty" : "clean"} · ${patch.git.commit_status}` : "Git unavailable"} · source {patch.source_id}</p>
      {patch.git.diff_stat && <details className="text-xs text-ink-secondary"><summary className="cursor-pointer font-semibold text-brand">Working tree diff against HEAD</summary><pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-inset p-2">{patch.git.diff_stat}</pre></details>}
      {patch.warnings.map((warning) => <p key={warning} className="text-xs text-amber-700">{warning}</p>)}
      {Boolean(patch.impact?.summary) && <div className="rounded-lg bg-surface-inset p-3 text-xs text-ink-secondary"><strong>Change Impact:</strong> {String(patch.impact.summary)} · risk {String(patch.impact.risk_level || "unknown")}{patch.files[0] && <button onClick={() => onOpenImpact(patch.files[0].path)} className="ml-2 font-semibold text-brand">Open full impact</button>}</div>}
      {["applied", "accepted", "validation_failed"].includes(patch.status) && patch.files.map((file) => <button key={file.path} disabled={loading} onClick={() => void reanalyzeImpact(file.path)} className="mr-2 rounded-lg border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-semibold text-brand">Re-run Change Impact: {file.path}</button>)}
      {postImpact && <p className="rounded-lg bg-surface-inset p-3 text-xs text-ink-secondary">Updated impact for {String(postImpact.path)}: {String(postImpact.summary || "No modeled impact available.")} · risk {String(postImpact.risk_level || "unknown")}</p>}
      <PatchFileList files={patch.files} selected={selected} onChange={changeSelection} />
      <div className="flex gap-2"><button onClick={() => setMode("unified")} aria-pressed={mode === "unified"} className="rounded-lg border border-line px-3 py-1.5 text-xs text-brand">Unified</button><button onClick={() => setMode("side-by-side")} aria-pressed={mode === "side-by-side"} className="rounded-lg border border-line px-3 py-1.5 text-xs text-brand">Side-by-side</button></div>
      <p className="text-xs text-ink-tertiary">Unified shows the full proposal; side-by-side shows selected hunks. Validate to see the exact selected diff.</p>
      {patch.files.map((file) => <div key={file.path} className="space-y-2"><div className="flex items-center gap-3 text-xs"><strong className="font-mono text-ink">{file.path}</strong><button onClick={() => onOpenSource(file.path)} className="text-brand">View source</button></div><PatchDiff file={file} mode={mode} selected={selected} /></div>)}
      {selectedDiff && <div className="space-y-2"><h3 className="text-xs font-semibold text-ink">Exact selected diff</h3>{Object.entries(selectedDiff).map(([path, diff]) => <pre key={path} className="max-h-64 overflow-auto rounded-lg bg-surface-inset p-3 text-[11px] text-ink">{diff}</pre>)}</div>}
      <ApplyChecklist patch={patch} validation={validation} selected={selected} highRisk={highRisk} publicApi={publicApi} onHighRisk={setHighRisk} onPublicApi={setPublicApi} />
      <div className="flex flex-wrap items-center gap-3"><button disabled={loading || !selected.length || patch.status !== "ready"} onClick={() => void validate(selected)} className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40">Validate selection</button>
        <label className="flex items-center gap-2 text-xs text-ink-secondary"><input type="checkbox" checked={confirmApply} onChange={(event) => setConfirmApply(event.target.checked)} /> I reviewed this diff and approve applying the selected changes.</label>
        <label className="flex items-center gap-2 text-xs text-ink-secondary"><input type="checkbox" checked={runProjectValidation} onChange={(event) => setRunProjectValidation(event.target.checked)} /> Run trusted validators automatically after apply (off by default).</label>
        <button disabled={!canApply || loading} onClick={() => void apply(selected, highRisk, publicApi, runProjectValidation)} className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Apply selected patch</button></div>
      {validation && <ValidationResults validation={validation} />}
      {(patch.status === "ready" || patch.status === "stale") && <button disabled={loading} onClick={() => void reject(patch.id)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-secondary">Reject preview</button>}
      {patch.status === "applied" && <button disabled={loading} onClick={() => void accept(patch.id)} className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-xs font-semibold text-brand">Accept applied patch</button>}
      {patch.rollback_available && <RollbackPanel patchId={patch.id} files={patch.files.flatMap((file) => file.operation === "move" && file.destination_path ? [file.path, file.destination_path] : [file.path])} rolledBackFiles={patch.rolled_back_files} selected={rollbackPaths} onSelected={setRollbackPaths} confirmConflict={confirmConflict} onConflict={setConfirmConflict} onRollback={() => void rollbackId(patch.id, rollbackPaths, confirmConflict)} loading={loading} />}
    </div>}
    {patch && <React.Suspense fallback={<p className="text-xs text-ink-secondary">Loading validation profile…</p>}><ValidationView repoUrl={repoUrl} patchId={patch.id} paths={patch.files.map((file) => file.path)} compact /></React.Suspense>}
    {historical && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3 text-xs text-ink-secondary"><h3 className="font-semibold text-ink">Saved patch {historical.id.slice(0, 12)} · {historical.status}</h3><p>The preview expired after the server restarted. Regenerate it before applying. Byte snapshots remain available for rollback.</p>
      {historical.status === "applied" && <button disabled={loading} onClick={() => void accept(historical.id)} className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 font-semibold text-brand">Accept saved patch</button>}
      {historical.rollback_available && <RollbackPanel saved patchId={historical.id} files={historical.files} rolledBackFiles={historical.rolled_back_files} selected={rollbackPaths} onSelected={setRollbackPaths} confirmConflict={confirmConflict} onConflict={setConfirmConflict} onRollback={() => void rollbackId(historical.id, rollbackPaths, confirmConflict)} loading={loading} />}
    </div>}
    <PatchHistory history={history} onOpen={(id) => void load(id)} />
  </section>
}
