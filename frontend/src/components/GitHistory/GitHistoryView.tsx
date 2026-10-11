import React, { useEffect, useRef, useState } from "react"
import type { RepositoryModel } from "../../types/repository"
import type { SourceLocation } from "../../types/source"
import type { CommitDetail, CoChangePair, EvolutionResponse, FileHistory, GitCommit, HistoryComparison, HistoryTimeline, HotspotResponse } from "../../types/gitHistory"
import { useGitHistory } from "../../hooks/useGitHistory"
import { UnifiedDiff } from "../PatchReview/PatchDiff"

type Section = "Timeline" | "File" | "Hotspots" | "Co-change" | "Evolution" | "Compare"
const sections: Section[] = ["Timeline", "File", "Hotspots", "Co-change", "Evolution", "Compare"]

interface Props {
  repoUrl: string
  model: RepositoryModel
  target?: { path?: string; commit?: string | null; requestId: number } | null
  onSelectCommit?: (sha: string) => void
  onOpenSource: (location: SourceLocation) => void
  onAnalyzeImpact: (path: string) => void
  onHumanize: (path: string) => void
  onCreatePlan: (path: string) => void
}

const date = (value?: string) => value ? new Date(value).toLocaleString() : "Unknown date"
const short = (sha?: string | null) => sha?.slice(0, 8) || "—"

export const GitHistoryView: React.FC<Props> = ({ repoUrl, model, target, onSelectCommit, onOpenSource, onAnalyzeImpact, onHumanize, onCreatePlan }) => {
  const { status, error: statusError, request } = useGitHistory(repoUrl)
  const [section, setSection] = useState<Section>("Timeline")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [timeline, setTimeline] = useState<HistoryTimeline | null>(null)
  const [fileHistory, setFileHistory] = useState<FileHistory | null>(null)
  const [hotspots, setHotspots] = useState<HotspotResponse | null>(null)
  const [cochange, setCochange] = useState<CoChangePair[] | null>(null)
  const [evolution, setEvolution] = useState<EvolutionResponse | null>(null)
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [comparison, setComparison] = useState<HistoryComparison | null>(null)
  const [path, setPath] = useState(target?.path || "")
  const [offset, setOffset] = useState(0)
  const [author, setAuthor] = useState("")
  const [since, setSince] = useState("")
  const [until, setUntil] = useState("")
  const [merge, setMerge] = useState<"all" | "merge" | "regular">("all")
  const [branch, setBranch] = useState("")
  const [before, setBefore] = useState("")
  const [after, setAfter] = useState("")
  const lastCommit = useRef("")

  const run = async (action: () => Promise<void>) => {
    setLoading(true); setError("")
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : "History request failed.") }
    finally { setLoading(false) }
  }

  const loadTimeline = (page = 0) => void run(async () => {
    const result = await request<HistoryTimeline>("commits", { limit: 50, offset: page,
      path: path.trim() || undefined, author: author.trim() || undefined,
      since: since || undefined, until: until || undefined,
      merge: merge === "all" ? undefined : merge === "merge", branch: branch || undefined })
    setTimeline(result); setOffset(page)
  })
  const loadFile = (selected = path) => void run(async () => {
    const result = await request<FileHistory>("file", { path: selected.trim() })
    setFileHistory(result); setPath(selected.trim()); setSection("File")
  })
  const loadHotspots = () => void run(async () => setHotspots(await request<HotspotResponse>("hotspots", { scan: 200, limit: 50, repository_model: model })))
  const loadCochange = () => void run(async () => {
    const result = await request<{ pairs: CoChangePair[] }>("cochange", { scan: 200, limit: 50, repository_model: model })
    setCochange(result.pairs)
  })
  const loadEvolution = () => void run(async () => setEvolution(await request<EvolutionResponse>("evolution")))
  const openCommit = (sha: string, updateLink = true) => void run(async () => {
    lastCommit.current = sha
    if (updateLink) onSelectCommit?.(sha)
    const result = await request<CommitDetail>("commit", { sha, repository_model: model })
    setDetail(result); setAfter(sha); setBefore(result.commit.parents[0] || "")
  })
  const loadComparison = () => void run(async () => {
    setComparison(await request<HistoryComparison>("compare", { before: before.trim() || undefined, after: after.trim() }))
    setSection("Compare")
  })

  useEffect(() => { if (status?.available) loadTimeline(0) }, [status?.head, status?.available])
  useEffect(() => { if (target?.path && status?.available) loadFile(target.path) }, [target?.path, target?.requestId, status?.available])
  useEffect(() => { if (target?.commit && status?.available && target.commit !== lastCommit.current) openCommit(target.commit, false) }, [target?.commit, status?.available])

  const choose = (name: Section) => {
    setSection(name)
    if (name === "Hotspots" && !hotspots) loadHotspots()
    if (name === "Co-change" && !cochange) loadCochange()
    if (name === "Evolution" && !evolution) loadEvolution()
  }

  const commitButton = (commit: GitCommit) => <button key={commit.sha} onClick={() => openCommit(commit.sha)} className="w-full rounded-xl border border-line p-3 text-left hover:border-brand-border">
    <div className="flex flex-wrap gap-2 text-xs"><strong className="font-mono text-brand">{commit.short_sha}</strong><span className="text-ink">{commit.subject}</span></div>
    <p className="mt-1 text-xs text-ink-secondary">{date(commit.author_date)} · {commit.author_name} · {commit.files_changed} files · +{commit.insertions}/−{commit.deletions}{commit.is_merge ? " · merge" : ""}</p>
  </button>

  const diffView = (result: HistoryComparison) => <div className="space-y-3">
    <p className="text-xs text-ink-secondary">{short(result.before)} → {short(result.after)} · {result.files_changed} files · +{result.insertions}/−{result.deletions}{result.truncated ? " · diff truncated" : ""}</p>
    {result.files.map(file => <details key={`${file.old_path || ""}:${file.path}`} className="rounded-xl border border-line p-3" open={result.files.length === 1}>
      <summary className="cursor-pointer text-xs font-semibold text-ink">{file.status}{file.similarity !== null ? ` (${file.similarity}% similarity)` : ""} · {file.old_path ? `${file.old_path} → ` : ""}{file.path} · +{file.additions}/−{file.deletions}</summary>
      {file.redacted ? <p className="mt-2 text-xs text-ink-secondary">Sensitive file diff is redacted.</p> : file.binary ? <p className="mt-2 text-xs text-ink-secondary">Binary diff unavailable.</p> : file.diff ? <div className="mt-3"><UnifiedDiff diff={file.diff} label={`${file.path} historical diff`}
        onNewLineClick={result.after === model.metadata.latest_commit_sha && !!model.files[file.path] ? line => onOpenSource({ path: file.path, startLine: line, endLine: line }) : undefined} />
        {file.diff_truncated && <p className="text-xs text-amber-700">Diff preview truncated.</p>}</div> : <p className="mt-2 text-xs text-ink-secondary">Diff preview unavailable.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {model.files[file.path] && <button onClick={() => onOpenSource({ path: file.path })} className="text-xs font-semibold text-brand">Open current file</button>}
        {!file.redacted && file.status !== "D" && <button onClick={() => onOpenSource({ path: file.path, revision: result.after })} className="text-xs font-semibold text-brand">Source at {short(result.after)}</button>}
        {model.files[file.path] && <button onClick={() => onAnalyzeImpact(file.path)} className="text-xs font-semibold text-brand">Analyze current impact</button>}
      </div>
    </details>)}
  </div>

  return <section aria-label="Git History" className="space-y-5">
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-2">
      <h2 className="text-lg font-bold text-ink">Git History Intelligence</h2>
      <p className="text-xs text-ink-secondary">Read-only local Git evidence. History analysis runs no repository code and uses 0 AI calls.</p>
      {status?.available ? <p className="text-xs text-ink-secondary">{status.branch || "Detached HEAD"} · {short(status.head)} · {status.commit_depth} available commits · {status.shallow ? "shallow history" : "full local history"} · {status.dirty ? "working tree has changes" : "working tree clean"}</p>
        : <p className="text-xs text-amber-700">{status?.message || statusError || "Checking local Git history…"}</p>}
    </div>
    {!status?.available ? <p className="rounded-xl border border-line bg-surface p-5 text-sm text-ink-secondary">Git history unavailable for this repository. Other Repo Explainer features remain available.</p> : <>
      <div className="flex flex-wrap gap-2">{sections.map(name => <button key={name} onClick={() => choose(name)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${section === name ? "border-brand bg-brand-surface text-brand" : "border-line text-ink-secondary"}`}>{name}</button>)}</div>
      {loading && <p role="status" className="text-xs text-ink-secondary">Reading bounded Git history…</p>}
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}

      {section === "Timeline" && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
        <h3 className="font-semibold text-ink">Commit timeline</h3>
        <div className="flex flex-wrap gap-2">
          <input aria-label="History file or folder" value={path} onChange={event => setPath(event.target.value)} placeholder="File or folder" className="rounded border border-line p-2 text-xs" />
          <input aria-label="History author" value={author} onChange={event => setAuthor(event.target.value)} placeholder="Author display name" className="rounded border border-line p-2 text-xs" />
          <input aria-label="History from date" type="date" value={since} onChange={event => setSince(event.target.value)} className="rounded border border-line p-2 text-xs" />
          <input aria-label="History to date" type="date" value={until} onChange={event => setUntil(event.target.value)} className="rounded border border-line p-2 text-xs" />
          <select aria-label="Merge filter" value={merge} onChange={event => setMerge(event.target.value as typeof merge)} className="rounded border border-line p-2 text-xs"><option value="all">All commits</option><option value="merge">Merges</option><option value="regular">Non-merges</option></select>
          <select aria-label="History branch" value={branch} onChange={event => setBranch(event.target.value)} className="rounded border border-line p-2 text-xs"><option value="">Current HEAD</option>{status.branches?.map(item => <option key={item} value={item}>{item}</option>)}</select>
          <button onClick={() => loadTimeline(0)} className="rounded bg-brand px-3 py-2 text-xs font-semibold text-white">Filter</button>
        </div>
        {timeline?.partial && <p className="text-xs text-amber-700">Author filter scans at most 500 commits; results may be partial.</p>}
        {timeline?.commits.length ? <div className="space-y-2">{timeline.commits.map(commitButton)}</div> : !loading && <p className="text-xs text-ink-secondary">No commits match this local history query.</p>}
        <div className="flex gap-2"><button disabled={!offset || loading} onClick={() => loadTimeline(Math.max(0, offset - 50))} className="rounded border border-line px-3 py-1 text-xs disabled:opacity-40">Previous</button><span className="text-xs text-ink-secondary">Offset {offset}</span><button disabled={!timeline?.has_more || loading} onClick={() => loadTimeline(offset + 50)} className="rounded border border-line px-3 py-1 text-xs disabled:opacity-40">Next</button></div>
      </div>}

      {section === "File" && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
        <h3 className="font-semibold text-ink">File evolution</h3>
        <div className="flex gap-2"><input aria-label="File history path" value={path} onChange={event => setPath(event.target.value)} list="history-paths" placeholder="src/main.py" className="min-w-0 flex-1 rounded border border-line p-2 text-xs" /><datalist id="history-paths">{Object.keys(model.files || {}).map(item => <option key={item} value={item} />)}</datalist><button disabled={!path.trim() || loading} onClick={() => loadFile()} className="rounded bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">View history</button></div>
        {fileHistory && <><p className="text-xs text-ink-secondary">{fileHistory.total_commits} known commits{fileHistory.partial ? " (bounded sample)" : ""} · +{fileHistory.additions}/−{fileHistory.deletions} lines · latest {short(fileHistory.latest_commit)} · first known {short(fileHistory.first_known_commit)} · {fileHistory.days_since_last_change ?? "?"} days since last change</p>
          <div className="flex flex-wrap gap-2"><button onClick={() => onOpenSource({ path: fileHistory.path })} className="text-xs font-semibold text-brand">Current source</button><button onClick={() => onAnalyzeImpact(fileHistory.path)} className="text-xs font-semibold text-brand">Change Impact</button><button onClick={() => onHumanize(fileHistory.path)} className="text-xs font-semibold text-brand">Humanize</button><button onClick={() => onCreatePlan(fileHistory.path)} className="text-xs font-semibold text-brand">Refactor plan</button></div>
          {!!fileHistory.rename_history.length && <div><h4 className="text-xs font-semibold text-ink">Git-confirmed renames</h4>{fileHistory.rename_history.map(item => <p key={item.sha} className="text-xs text-ink-secondary">{item.from} → {item.to} at {short(item.sha)}</p>)}</div>}
          <div><h4 className="text-xs font-semibold text-ink">Contributor distribution</h4><p className="text-xs text-ink-tertiary">Commit activity, not organizational ownership. Email addresses are not shown.</p>{fileHistory.contributors.map(item => <p key={`${item.author_name}:${item.commit_count}`} className="text-xs text-ink-secondary">{item.author_name}: {item.commit_count} commits ({item.share_percent}%) · {item.label}</p>)}</div>
          <div className="space-y-2"><h4 className="text-xs font-semibold text-ink">Recent commits</h4>{fileHistory.recent_commits.map(commitButton)}</div>
        </>}
      </div>}

      {section === "Hotspots" && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3"><h3 className="font-semibold text-ink">Maintenance hotspots</h3><p className="text-xs text-ink-secondary">Sampled {hotspots?.sampled_commits || 0} commits. Churn 35 + frequency 25 + current centrality 20 + cached Humanize maintainability 20. Stable 0–24, Active 25–49, Hotspot 50–74, Critical Hotspot 75–100. Activity does not prove defects.</p>
        {hotspots?.warnings.map(item => <p key={item} className="text-xs text-amber-700">{item}</p>)}
        {hotspots?.hotspots.map(item => <div key={item.path} className="rounded-xl border border-line p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><button onClick={() => loadFile(item.path)} className="font-mono font-semibold text-brand">{item.path}</button><strong className="text-ink">{item.score}/100 · {item.label}</strong></div><p className="mt-1 text-ink-secondary">{item.commits} commits · {item.total_churn} lines churn · {item.confidence} confidence · factors: {Object.entries(item.factors).map(([name, value]) => `${name} ${value}`).join(", ")}</p></div>)}
        {!!hotspots?.high_change_impact_commits.length && <div><h4 className="text-xs font-semibold text-ink">High-change-impact commits</h4>{hotspots.high_change_impact_commits.map(item => <button key={item.sha} onClick={() => openCommit(item.sha)} className="block py-1 text-left text-xs text-brand">{item.short_sha} · {item.score}/100 · {item.subject}</button>)}</div>}
      </div>}

      {section === "Co-change" && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3"><h3 className="font-semibold text-ink">Files changed together</h3><p className="text-xs text-ink-secondary">At least two shared commits. Temporal coupling describes co-occurrence, not a proven code dependency.</p>{cochange?.length ? cochange.map(item => <div key={item.files.join("|")} className="rounded-xl border border-line p-3 text-xs"><p className="font-mono text-ink">{item.files.join(" ↔ ")}</p><p className="text-ink-secondary">{item.shared_commits} shared commits · ratio {item.cochange_ratio} · {item.confidence} confidence · {item.temporal_only ? "no modeled structural edge" : "modeled structural edge"}</p><button onClick={() => loadFile(item.files[0])} className="text-brand">Inspect pair</button></div>) : !loading && <p className="text-xs text-ink-secondary">No repeated co-change pairs in the sampled history.</p>}</div>}

      {section === "Evolution" && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3"><h3 className="font-semibold text-ink">Sampled architecture evolution</h3><p className="text-xs text-ink-secondary">{evolution?.method}</p>{evolution?.checkpoints.map(item => <div key={item.days_ago} className="rounded-xl border border-line p-3 text-xs"><strong className="text-ink">{item.days_ago} days ago → current</strong>{item.available ? <p className="text-ink-secondary">Files {item.files_before} → {item.files_now} · +{item.files_added} added / −{item.files_removed} removed · directories {item.directories_before} → {item.directories_now}</p> : <p className="text-ink-secondary">No local commit at this checkpoint.</p>}{item.sample_added?.length ? <p className="text-ink-tertiary">Added sample: {item.sample_added.join(", ")}</p> : null}{item.sample_removed?.length ? <p className="text-ink-tertiary">Removed sample: {item.sample_removed.join(", ")}</p> : null}</div>)}</div>}

      {section === "Compare" && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4"><h3 className="font-semibold text-ink">Compare commits</h3><p className="text-xs text-ink-secondary">Use full or unambiguous hexadecimal commit IDs. Leave the first field blank to compare with the selected commit’s first parent.</p><div className="flex flex-wrap gap-2"><input aria-label="Before commit" value={before} onChange={event => setBefore(event.target.value)} placeholder="Before SHA (optional)" className="min-w-48 flex-1 rounded border border-line p-2 font-mono text-xs" /><input aria-label="After commit" value={after} onChange={event => setAfter(event.target.value)} placeholder="After SHA" className="min-w-48 flex-1 rounded border border-line p-2 font-mono text-xs" /><button disabled={!after.trim() || loading} onClick={loadComparison} className="rounded bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Compare</button></div>{comparison && diffView(comparison)}</div>}

      {detail && <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3"><div className="flex justify-between gap-2"><h3 className="font-semibold text-ink">Commit {short(detail.commit.sha)} · {detail.commit.subject}</h3><button onClick={() => setDetail(null)} className="text-xs text-brand">Close</button></div><p className="text-xs text-ink-secondary">{detail.commit.author_name} · {date(detail.commit.author_date)} · current architecture areas: {detail.architecture_areas.join(", ") || "none resolved"}</p><p className="text-xs text-ink-secondary">{detail.impact.label}. {detail.impact.revert_preview}</p>{detail.impact.files.map(item => <button key={item.file} onClick={() => onAnalyzeImpact(item.file)} className="block text-left text-xs text-brand">{item.file} · {item.risk_level} · {item.summary}</button>)}<button onClick={() => { setComparison(detail.comparison); setSection("Compare") }} className="rounded border border-brand-border px-3 py-1 text-xs font-semibold text-brand">View diff / compare</button></div>}
    </>}
  </section>
}
