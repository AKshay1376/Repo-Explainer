import React, { useEffect, useState } from "react"
import type { RepositoryModel } from "../../types/repository"
import type { SourceLocation } from "../../types/source"
import type { HumanizeMode } from "../../types/humanize"
import type { PlanTrigger } from "../../types/refactor"
import type { PatchTrigger } from "../../types/patch"
import { useHumanize } from "../../hooks/useHumanize"
import { FindingCard } from "./FindingCard"
import { PatchPreview } from "./PatchPreview"

interface HumanizeViewProps {
  repoUrl: string
  model: RepositoryModel
  target?: { path: string; requestId: number } | null
  onOpenSource: (location: SourceLocation) => void
  onAnalyzeImpact: (trigger: { file: string }) => void
  onAskRepo: (path: string) => void
  onCreatePlan?: (trigger: PlanTrigger) => void
  onCreatePatch?: (trigger: PatchTrigger) => void
}

export const HumanizeView: React.FC<HumanizeViewProps> = ({ repoUrl, model, target, onOpenSource, onAnalyzeImpact, onAskRepo, onCreatePlan, onCreatePatch }) => {
  const [path, setPath] = useState(target?.path || "")
  const [mode, setMode] = useState<HumanizeMode>("Balanced")
  const [aiConsent, setAiConsent] = useState(false)
  const [instructions, setInstructions] = useState("")
  const { fileResult, auditResult, aiResult, loading, error, analyzeFile, auditRepository, requestAiPreview } = useHumanize({ repoUrl, model })
  useEffect(() => {
    if (target?.path) {
      setPath(target.path)
      void analyzeFile(target.path, mode)
    }
    // A new requestId represents an explicit navigation from another view.
  }, [target?.requestId])
  const openFile = (selected: string) => { setPath(selected); void analyzeFile(selected, mode) }

  return <section className="space-y-5" aria-label="Humanize Codebase">
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">Humanize Codebase</h2>
        <p className="mt-1 text-xs text-ink-secondary">Deterministic code quality findings and reviewable patch previews. Analysis does not change repository files.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-ink-secondary">File path
          <input value={path} onChange={(event) => setPath(event.target.value)} list="humanize-paths" placeholder="src/main.py" className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink" />
          <datalist id="humanize-paths">{Object.keys(model.files || {}).map((item) => <option key={item} value={item} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">Mode
          <select value={mode} onChange={(event) => setMode(event.target.value as HumanizeMode)} className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink">
            <option>Conservative</option><option>Balanced</option><option>Aggressive</option>
          </select>
        </label>
        <button disabled={loading || !path.trim()} onClick={() => openFile(path.trim())} className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Analyze file</button>
        <button disabled={loading} onClick={() => void auditRepository(mode)} className="rounded-lg border border-brand-border bg-brand-surface px-4 py-2 text-xs font-semibold text-brand disabled:opacity-40">Audit repository</button>
      </div>
      <p className="text-xs text-ink-tertiary">Repository audit is analysis only. It surveys every modeled file and uses available cached source for content findings; it never refactors the repository.</p>
      {loading && <p className="text-sm text-ink-secondary" role="status">Analyzing…</p>}
      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
    </div>

    {fileResult && <div className="space-y-5">
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="font-mono text-sm font-bold text-ink break-all">{fileResult.path}</h3><p className="text-xs text-ink-tertiary">{fileResult.language} · {fileResult.mode} · revision {fileResult.revision.slice(0, 12)}</p></div>
          <div className="flex gap-2">
            <button onClick={() => onOpenSource({ path: fileResult.path })} className="rounded-lg border border-line px-3 py-1.5 text-xs text-brand">View Source</button>
            <button onClick={() => onAskRepo(fileResult.path)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-brand">Ask Repo</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Score", fileResult.metrics.maintainability_score], ["Findings", fileResult.finding_count],
            ["Code lines", fileResult.metrics.code_lines], ["Functions", fileResult.metrics.function_count],
            ["Max complexity", fileResult.metrics.max_complexity], ["Max nesting", fileResult.metrics.max_nesting],
            ["Long lines", fileResult.metrics.long_line_count], ["Duplicate blocks", fileResult.metrics.duplicate_block_count],
          ].map(([label, value]) => <div key={label} className="rounded-lg bg-surface-inset p-2"><div className="text-[10px] text-ink-tertiary">{label}</div><div className="text-lg font-bold text-ink">{value}</div></div>)}
        </div>
        <div className="rounded-xl border border-line bg-surface-inset p-3 text-xs text-ink-secondary">
          <span className="font-semibold text-ink">Change risk: {fileResult.risk.level}</span>
          {fileResult.risk.factors.length > 0 && <span> · {fileResult.risk.factors.join("; ")}</span>}
          {fileResult.risk.impact?.available && <p className="mt-1">Change Impact: {fileResult.risk.impact.summary} {fileResult.risk.impact.blast_radius?.total_affected != null && `(${fileResult.risk.impact.blast_radius.total_affected} affected)`}</p>}
          {fileResult.risk.level !== "LOW" && <button onClick={() => onAnalyzeImpact({ file: fileResult.path })} className="mt-2 font-semibold text-brand hover:underline">Open full Change Impact analysis</button>}
        </div>
        {fileResult.warnings?.map((warning) => <p key={warning} className="text-xs text-amber-600">{warning}</p>)}
      </div>
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3">
        <h3 className="text-sm font-semibold text-ink">Findings ({fileResult.finding_count})</h3>
        {fileResult.findings.length ? fileResult.findings.map((finding) => <FindingCard key={finding.id} path={fileResult.path} finding={finding} onOpenSource={onOpenSource} onCreatePlan={onCreatePlan} />)
          : <p className="text-xs text-ink-tertiary">No findings at this mode's thresholds.</p>}
      </div>
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3">
        <h3 className="text-sm font-semibold text-ink">Safe deterministic patch previews ({fileResult.previews.length})</h3>
        {fileResult.previews.length ? fileResult.previews.map((preview) => <PatchPreview key={preview.id} preview={preview} path={fileResult.path} onReview={onCreatePatch ? (suggestionId) => onCreatePatch({ source: "humanize", path: fileResult.path, suggestionId }) : undefined} />)
          : <p className="text-xs text-ink-tertiary">No safe deterministic changes are available for this file.</p>}
      </div>
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3">
        <h3 className="text-sm font-semibold text-ink">Optional AI rewrite preview</h3>
        <p className="text-xs text-ink-secondary">Only an explicit request sends this file's sanitized source to the configured AI provider. The result is a patch preview and is never applied here.</p>
        <input value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={500} placeholder="Optional rewrite guidance" aria-label="AI rewrite guidance" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink" />
        <label className="flex items-start gap-2 text-xs text-ink-secondary"><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} /> I explicitly request an AI rewrite preview for this file.</label>
        <button disabled={!aiConsent || loading || fileResult.redacted} onClick={() => { setAiConsent(false); void requestAiPreview(fileResult.path, mode, instructions) }} className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40">Request AI preview</button>
        {aiResult && <PatchPreview preview={aiResult.preview} path={aiResult.path} />}
      </div>
    </div>}

    {auditResult && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
      <h3 className="text-sm font-semibold text-ink">Repository audit · {auditResult.mode}</h3>
      <p className="text-xs text-ink-secondary">{auditResult.coverage.total_files} modeled files · {auditResult.coverage.content_analyzed} with cached content · {auditResult.coverage.metadata_only} metadata only · {auditResult.coverage.skipped_sensitive} sensitive skipped</p>
      {auditResult.warnings.map((warning) => <p key={warning} className="text-xs text-amber-600">{warning}</p>)}
      <div className="flex flex-wrap gap-2">{Object.entries(auditResult.category_counts).map(([category, count]) => <span key={category} className="rounded bg-surface-inset px-2 py-1 text-xs text-ink-secondary">{category}: {count}</span>)}</div>
      <div className="max-h-96 space-y-1 overflow-auto">
        {auditResult.top_files.map((item) => <button key={item.path} onClick={() => openFile(item.path)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-line p-2 text-left text-xs hover:border-brand-border">
          <span className="min-w-0 truncate font-mono text-ink">{item.path}</span><span className="shrink-0 text-ink-tertiary">{item.coverage === "content" ? `score ${item.score} · ${item.finding_count} findings` : "metadata only"}</span>
        </button>)}
      </div>
    </div>}
  </section>
}
