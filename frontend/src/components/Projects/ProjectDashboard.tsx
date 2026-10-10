import React, { useCallback, useEffect, useState } from "react"
import { localApi } from "../../hooks/useProjects"
import type { AnalysisSnapshot, SavedDocument, SavedProject } from "../../types/persistence"

interface Props { projectId: string; currentSha: string | null; onNavigate: (view: string) => void; onOpenFile: (path: string) => void; onHome: () => void }

export const ProjectDashboard: React.FC<Props> = ({ projectId, currentSha, onNavigate, onOpenFile, onHome }) => {
  const [project, setProject] = useState<SavedProject | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisSnapshot[]>([])
  const [savedDoc, setSavedDoc] = useState<SavedDocument | null>(null)
  const [comparison, setComparison] = useState("")
  const [localPath, setLocalPath] = useState("")
  const [bookmarkPath, setBookmarkPath] = useState("")
  const [bookmarkType, setBookmarkType] = useState("file")
  const [message, setMessage] = useState("")
  const refresh = useCallback(async () => {
    try {
      const [detail, history] = await Promise.all([
        localApi<{ project: SavedProject }>(`/projects/${projectId}`),
        localApi<{ analyses: AnalysisSnapshot[] }>(`/projects/${projectId}/analyses`),
      ])
      setProject(detail.project); setAnalyses(history.analyses); setLocalPath(detail.project.local_path || "")
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Project unavailable.") }
  }, [projectId])
  useEffect(() => { void refresh() }, [refresh])
  const update = async (changes: Record<string, unknown>) => {
    try { await localApi(`/projects/${projectId}`, "PATCH", changes); await refresh() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Project update failed.") }
  }
  const compare = async () => {
    const [latest, previous] = analyses.filter(item => item.analysis_type === "project_health").slice(0, 2)
    if (!latest || !previous) return
    const result = await localApi<{ comparison: { changes: Record<string, { before: number; after: number; delta: number }> } }>(
      `/projects/${projectId}/analyses/compare?before=${previous.id}&after=${latest.id}`)
    setComparison(Object.entries(result.comparison.changes).map(([key, value]) => `${key}: ${value.before} → ${value.after} (${value.delta >= 0 ? "+" : ""}${value.delta})`).join(", "))
  }
  const openDocument = async (id: string) => {
    try { const result = await localApi<{ document: SavedDocument }>(`/projects/${projectId}/documents/${id}`); setSavedDoc(result.document) }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Document unavailable.") }
  }
  const removeDocument = async (id: string) => {
    if (!window.confirm("Delete this saved documentation snapshot?")) return
    await localApi(`/projects/${projectId}/documents/${id}`, "DELETE"); setSavedDoc(null); await refresh()
  }
  const duplicateDocument = async (id: string) => { await localApi(`/projects/${projectId}/documents/${id}/duplicate`, "POST", {}); await refresh() }
  const bookmark = async () => {
    try { await localApi(`/projects/${projectId}/bookmarks`, "POST", { type: bookmarkType, target: bookmarkPath, label: bookmarkPath }); setBookmarkPath(""); await refresh() }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Bookmark could not be saved.") }
  }
  if (!project) return <p className="rounded-2xl border border-line bg-surface p-5 text-sm">{message || "Loading project…"}</p>
  const stale = !!(project.current_sha && currentSha && project.current_sha !== currentSha)
  return <section aria-label="Project dashboard" className="space-y-5">
    <div className="rounded-2xl border border-line bg-surface p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">{project.name}</h2><button onClick={onHome} className="text-xs text-brand">All projects</button></div>
      <p className="text-sm text-ink-secondary">{project.repo_url} · {project.current_branch || "Branch unknown"} · {currentSha?.slice(0, 12) || "SHA unknown"}</p>
      {(stale || project.sha_changed) && <p role="alert" className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">Repository changed since the saved session. Analyze latest before using older plans or patches.</p>}
      <p className="mt-2 text-xs text-ink-secondary">Last analyzed: {project.last_analyzed_at ? new Date(project.last_analyzed_at).toLocaleString() : "never"} · Health: {project.health_score ?? "unavailable"} · Validation: {project.validation?.status || "not recorded"}</p>
      <div className="mt-3 flex flex-wrap gap-2">{([ ["Open Repository", "explorer"], ["Analyze", "health"], ["View Health", "health"], ["View Docs", "docs"], ["View History", "history"] ] as const).map(([label, view]) => <button key={label} onClick={() => onNavigate(view)} className="rounded border border-line px-3 py-1.5 text-xs text-brand">{label}</button>)}</div>
    </div>
    <div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-line bg-surface p-4"><h3 className="font-semibold">Analysis history</h3>{analyses.length ? analyses.slice(0, 12).map(item => <p key={item.id} className="mt-2 text-xs">{item.analysis_type.replace(/_/g, " ")} · {new Date(item.created_at).toLocaleString()} · {item.summary}{Object.keys(item.metrics).length ? ` · ${JSON.stringify(item.metrics)}` : ""}</p>) : <p className="mt-2 text-xs text-ink-secondary">No saved analyses.</p>}
      {analyses.filter(item => item.analysis_type === "project_health").length >= 2 && <button onClick={() => void compare()} className="mt-3 text-xs text-brand">Compare latest health snapshots</button>}{comparison && <p className="mt-2 text-xs">{comparison}</p>}</div>
      <div className="rounded-2xl border border-line bg-surface p-4"><h3 className="font-semibold">Recent activity</h3>{project.recent_activity?.slice(0, 12).map(item => <p key={item.id} className="mt-2 text-xs">{item.label} · {new Date(item.created_at).toLocaleString()}</p>)}</div>
      <div className="rounded-2xl border border-line bg-surface p-4"><h3 className="font-semibold">Recent files</h3>{project.recent_files?.filter(item => item.type === "file").map(item => <button key={item.id} onClick={() => onOpenFile(item.target)} className="mt-2 block text-xs text-brand">{item.target}</button>)}</div>
      <div className="rounded-2xl border border-line bg-surface p-4"><h3 className="font-semibold">Bookmarks</h3>{project.bookmarks?.map(item => <div key={item.id} className="mt-2 flex gap-2 text-xs"><button onClick={() => item.type === "file" && onOpenFile(item.target)} className="text-brand">{item.label}</button><button aria-label={`Remove bookmark ${item.label}`} onClick={() => void localApi(`/bookmarks/${item.id}`, "DELETE").then(refresh)} className="text-ink-secondary">Remove</button></div>)}
        <div className="mt-3 flex gap-2"><select aria-label="Bookmark type" value={bookmarkType} onChange={event => setBookmarkType(event.target.value)} className="rounded border border-line p-1 text-xs">{["file", "symbol", "route", "model", "commit", "document_section"].map(kind => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}</select><input aria-label="Bookmark target" value={bookmarkPath} onChange={event => setBookmarkPath(event.target.value)} placeholder="Path or target" className="min-w-0 flex-1 rounded border border-line p-1 text-xs" /><button onClick={() => void bookmark()} className="text-xs text-brand">Bookmark</button></div></div>
      <div className="rounded-2xl border border-line bg-surface p-4"><h3 className="font-semibold">Saved Documentation</h3>{project.documents?.map(item => <div key={item.id} className="mt-2 flex flex-wrap gap-2 text-xs"><button onClick={() => void openDocument(item.id)} className="text-brand">{item.title}</button><button onClick={() => void duplicateDocument(item.id)} className="text-ink-secondary">Duplicate</button><a href={`/api/projects/${projectId}/documents/${item.id}/export`} className="text-ink-secondary">Export</a><button onClick={() => void removeDocument(item.id)} className="text-rose-600">Delete</button></div>)}
        {savedDoc && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-surface-inset p-3 text-xs">{savedDoc.content}</pre>}</div>
      <div className="rounded-2xl border border-line bg-surface p-4"><h3 className="font-semibold">Recent patches and validation</h3>{project.recent_patches?.map(item => <p key={item.id} className="mt-2 text-xs">{item.id.slice(0, 10)} · {item.status} · {item.risk}</p>)}<p className="mt-2 text-xs text-ink-secondary">Patch rollback stays in the existing Patch Engine.</p></div></div>
    {!!project.saved_plans?.length && <div className="rounded-2xl border border-line bg-surface p-4"><h3 className="font-semibold">Saved refactor plans</h3>{project.saved_plans.map(item => <p key={item.id} className="mt-2 text-xs">{item.scope} · {item.risk} risk · {item.steps.length} steps {currentSha && item.repo_sha !== currentSha ? "· May be stale; regenerate before applying" : ""}</p>)}</div>}
    <details className="rounded-2xl border border-line bg-surface p-4"><summary className="cursor-pointer font-semibold">Project management</summary><div className="mt-3 space-y-3 text-xs"><div className="flex gap-2"><input aria-label="Relink repository path" value={localPath} onChange={event => setLocalPath(event.target.value)} placeholder="Local repository path" className="min-w-0 flex-1 rounded border border-line p-2" /><button onClick={() => void update({ local_path: localPath })} className="text-brand">Relink Repository</button></div>
      <button onClick={() => void update({ favorite: !project.favorite })} className="mr-4 text-brand">{project.favorite ? "Remove favorite" : "Favorite project"}</button><button onClick={() => void update({ archived: true }).then(onHome)} className="mr-4 text-brand">Archive project</button>
      <button onClick={() => { if (window.confirm("Delete saved project data? The repository on disk will stay untouched.")) void localApi(`/projects/${projectId}`, "DELETE", { confirm_delete: true }).then(onHome) }} className="text-rose-600">Delete saved project data</button><p>Deleting this record never deletes the repository on disk.</p></div></details>
    {message && <p role="alert" className="text-xs text-rose-600">{message}</p>}
  </section>
}
