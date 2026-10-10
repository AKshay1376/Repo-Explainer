import { apiFetch } from "../../apiClient"
import React, { useEffect, useMemo, useState } from "react"
import type { RepositoryModel } from "../../types/repository"
import type { HealthCategory, HealthFinding, HealthLevel, ProjectHealthResult } from "../../types/projectHealth"
import type { SourceLocation } from "../../types/source"
import type { PlanTrigger } from "../../types/refactor"
import type { PatchTrigger } from "../../types/patch"
import { filterHealthFindings } from "../../lib/projectHealth"

const categories: HealthCategory[] = ["Architecture", "Security", "Performance", "Code Quality"]
const levels: HealthLevel[] = ["HIGH", "MEDIUM", "LOW"]

interface Props {
  repoUrl: string
  model: RepositoryModel
  onOpenSource: (location: SourceLocation) => void
  onAnalyzeImpact: (trigger: { file: string }) => void
  onHumanize: (path: string) => void
  onCreatePlan: (trigger: PlanTrigger) => void
  onAskRepo: (path: string) => void
  onInspectFile: (path: string) => void
  onCreatePatch: (trigger: PatchTrigger) => void
  onTraceFlow: (path: string) => void
}

export const ProjectHealthView: React.FC<Props> = ({ repoUrl, model, onOpenSource, onAnalyzeImpact, onHumanize, onCreatePlan, onAskRepo, onInspectFile, onCreatePatch, onTraceFlow }) => {
  const [result, setResult] = useState<ProjectHealthResult | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<HealthCategory | "All">("All")
  const [severity, setSeverity] = useState<HealthLevel | "All">("All")
  const [confidence, setConfidence] = useState<HealthLevel | "All">("All")
  const [pathFilter, setPathFilter] = useState("")
  const [actionableOnly, setActionableOnly] = useState(false)
  const [referencePath, setReferencePath] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    apiFetch("/api/health/project", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, repository_model: model }), signal: controller.signal,
    }).then(async response => {
      const payload = await response.json()
      if (!response.ok || !payload.success) throw new Error(payload.error || "Project Health analysis failed.")
      setResult(payload as ProjectHealthResult)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Project Health analysis failed.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [repoUrl, model])

  const visible = useMemo(() => filterHealthFindings(result?.findings || [], { category, severity, confidence, path: pathFilter, actionableOnly }), [result, category, severity, confidence, pathFilter, actionableOnly])

  const action = (finding: HealthFinding, name: string) => {
    const path = finding.file
    if (!path) return
    if (name === "View Source") onOpenSource({ path, startLine: finding.start_line || undefined, endLine: finding.end_line || undefined })
    if (name === "Analyze Impact") onAnalyzeImpact({ file: path })
    if (name === "Humanize") onHumanize(path)
    if (name === "Plan Refactor") onCreatePlan({ planType: finding.rule === "dependency_cycle" ? "extract_module" : "split_large_file", target: path })
    if (name === "Ask Repo") onAskRepo(path)
    if (name === "Inspect File") onInspectFile(path)
    if (name === "Generate Patch" && finding.patch_suggestion_id) onCreatePatch({ source: "humanize", path, suggestionId: finding.patch_suggestion_id })
    if (name === "View References") setReferencePath(referencePath === path ? null : path)
    if (name === "Trace Flow") onTraceFlow(path)
  }

  return <section className="space-y-5" aria-label="Project Health">
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
      <h2 className="text-lg font-bold text-ink">Project Health</h2>
      <p className="mt-1 text-xs text-ink-secondary">Deterministic indicators from the repository model and cached source. Scores describe observed evidence, not a security audit or runtime benchmark.</p>
      {loading && <p className="mt-3 text-xs text-ink-secondary">Analyzing cached evidence…</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      {result && <div className="mt-4 flex flex-wrap items-end gap-4"><strong className="text-4xl text-ink">{result.overall.score}<span className="text-base text-ink-tertiary">/100</span></strong><span className="text-sm font-semibold text-ink">{result.overall.label}</span><span className="text-xs text-ink-secondary">Revision {result.revision.slice(0, 12)} · {result.cached ? "cached" : "computed"} · {result.llm_calls} AI calls</span></div>}
    </div>

    {result && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{categories.map(name => {
        const item = result.dimensions[name]
        return <button key={name} onClick={() => setCategory(category === name ? "All" : name)} className={`rounded-2xl border p-4 text-left shadow-subtle ${category === name ? "border-brand bg-brand-surface" : "border-line bg-surface"}`}>
          <span className="text-xs font-semibold text-ink-secondary">{name}</span>
          <div className="mt-2 text-2xl font-bold text-ink">{item.score}<span className="ml-2 text-xs font-normal text-ink-secondary">{item.label}</span></div>
          <p className="mt-2 text-xs text-ink-secondary">{item.finding_count} findings · {item.high} high · {item.medium} medium · {item.low} low</p>
          <p className="mt-1 text-xs text-ink-tertiary">Evidence confidence: {item.confidence}</p>
        </button>
      })}</div>

      <div className="rounded-2xl border border-line bg-surface p-4 text-xs text-ink-secondary space-y-2">
        <p><strong className="text-ink">Coverage:</strong> {result.coverage.total_files || 0} modeled files · {result.coverage.content_analyzed || 0} Humanize content files · {result.coverage.metadata_only || 0} metadata only · {result.coverage.cached_code_files || 0} cached code files · {result.coverage.resolved_edges || 0} resolved edges · {result.coverage.skipped_sensitive || 0} sensitive files skipped</p>
        <details><summary className="cursor-pointer font-semibold text-ink">How scores are calculated</summary><p className="mt-2">Each dimension starts at {result.scoring.start}. Findings subtract {levels.map(level => `${level.toLowerCase()} ${result.scoring.severity_penalties[level]} × ${result.scoring.confidence_weights[level]}`).join(", ")}. Each dimension is capped at {result.scoring.category_penalty_cap} points of deductions. {result.scoring.overall}</p></details>
        {result.warnings.map(warning => <p key={warning} className="text-amber-700">{warning}</p>)}
      </div>

      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">{result.summary.finding_count} issues detected</h3><p className="text-xs text-ink-secondary">{result.summary.high_count} high priority · {result.summary.medium_count} medium · {result.summary.low_count} low · {visible.length} shown</p></div>
          <div className="flex flex-wrap gap-2">
            <label className="text-xs text-ink-secondary">Category <select aria-label="Filter category" value={category} onChange={event => setCategory(event.target.value as HealthCategory | "All")} className="ml-1 rounded border border-line bg-surface p-1"><option>All</option>{categories.map(name => <option key={name}>{name}</option>)}</select></label>
            <label className="text-xs text-ink-secondary">Severity <select aria-label="Filter severity" value={severity} onChange={event => setSeverity(event.target.value as HealthLevel | "All")} className="ml-1 rounded border border-line bg-surface p-1"><option>All</option>{levels.map(level => <option key={level}>{level}</option>)}</select></label>
            <label className="text-xs text-ink-secondary">Confidence <select aria-label="Filter confidence" value={confidence} onChange={event => setConfidence(event.target.value as HealthLevel | "All")} className="ml-1 rounded border border-line bg-surface p-1"><option>All</option>{levels.map(level => <option key={level}>{level}</option>)}</select></label>
            <input aria-label="Filter file or folder" value={pathFilter} onChange={event => setPathFilter(event.target.value)} placeholder="File or folder" className="rounded border border-line bg-surface p-1 text-xs" />
            <label className="flex items-center gap-1 text-xs text-ink-secondary"><input type="checkbox" checked={actionableOnly} onChange={event => setActionableOnly(event.target.checked)} /> Actionable only</label>
          </div></div>
        {!visible.length && <p className="text-xs text-ink-secondary">{result.summary.finding_count ? "No findings match these filters." : "No high-confidence issues detected in the current static analysis. Runtime or environment-specific problems may not be visible."}</p>}
        <div className="space-y-5">{levels.map(level => {
          const group = visible.filter(finding => finding.severity === level)
          return group.length ? <div key={level} className="space-y-3"><h4 className="text-xs font-bold text-ink">{level} · {group.length}</h4>{group.map(finding => <article key={finding.id} className="rounded-xl border border-line p-4 text-xs">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-surface-inset px-2 py-1 font-semibold text-ink">{finding.severity}</span><span className="text-ink-secondary">{finding.category} · {finding.confidence} confidence</span><h4 className="font-semibold text-ink">{finding.title}</h4></div>
          <p className="mt-2 text-ink-secondary">{finding.summary} {finding.why_it_matters}</p>
          {finding.file && <p className="mt-2 font-mono text-ink">{finding.file}{finding.start_line ? `:${finding.start_line}` : ""}</p>}
          <p className="mt-1 text-ink-tertiary">Evidence: {JSON.stringify(finding.evidence)} · Source: {finding.source}</p>
          {finding.impact_summary && <p className="mt-1 text-ink-secondary">{finding.impact_summary}</p>}
          {!!finding.suggested_actions.length && <div className="mt-3 flex flex-wrap gap-2">{finding.suggested_actions.map(name => <button key={name} onClick={() => action(finding, name)} className="rounded border border-brand-border bg-brand-surface px-2 py-1 font-semibold text-brand">{name}</button>)}</div>}
          {referencePath === finding.file && finding.file && <div className="mt-3 rounded bg-surface-inset p-2"><strong>Modeled references</strong>{(model.files[finding.file]?.dependents || []).length ? (model.files[finding.file]?.dependents || []).map(path => <button key={path} onClick={() => onOpenSource({ path })} className="ml-2 text-brand underline">{path}</button>) : <p>No resolved dependents in the repository model.</p>}</div>}
        </article>)}</div> : null
        })}</div>
      </div>
    </>}
  </section>
}
