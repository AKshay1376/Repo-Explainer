import React, { useEffect, useState } from "react"
import { localApi, useProjects } from "../../hooks/useProjects"
import type { SavedProject, Settings } from "../../types/persistence"

interface Props { onAnalyze: (repoUrl: string) => void; onOpenProject: (project: SavedProject) => void }

const ProjectCard: React.FC<{ project: SavedProject; onAnalyze: Props["onAnalyze"]; onOpenProject: Props["onOpenProject"]; onUpdate: (id: string, changes: Record<string, unknown>) => Promise<void> }> = ({ project, onAnalyze, onOpenProject, onUpdate }) =>
  <article className="rounded-2xl border border-line bg-surface p-4 shadow-card space-y-2">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{project.name}</h3><p className="text-xs text-ink-secondary">{project.repo_url}</p></div>
      <button aria-label={project.favorite ? `Unfavorite ${project.name}` : `Favorite ${project.name}`} onClick={() => void onUpdate(project.id, { favorite: !project.favorite })} className="text-lg text-brand">{project.favorite ? "★" : "☆"}</button></div>
    <p className="text-xs text-ink-secondary">{project.current_branch || "Branch unknown"} · {project.current_sha?.slice(0, 10) || "SHA unknown"} · Last opened {project.last_opened_at ? new Date(project.last_opened_at).toLocaleDateString() : "never"}</p>
    <p className="text-xs text-ink-secondary">{project.health_score == null ? "Health not analyzed" : `Health ${project.health_score}`} · {project.last_analyzed_at ? `Analyzed ${new Date(project.last_analyzed_at).toLocaleDateString()}` : "No analysis"}</p>
    <div className="flex flex-wrap gap-2 text-xs"><button onClick={() => onOpenProject(project)} className="rounded bg-brand px-3 py-1.5 font-semibold text-white">Open / Resume</button>
      <button onClick={() => onAnalyze(project.repo_url)} className="rounded border border-line px-3 py-1.5 text-brand">Reanalyze</button>
      <button onClick={() => void onUpdate(project.id, { archived: !project.archived })} className="rounded border border-line px-3 py-1.5 text-ink-secondary">{project.archived ? "Reopen" : "Archive"}</button></div>
  </article>

export const HomeView: React.FC<Props> = ({ onAnalyze, onOpenProject }) => {
  const { projects, loading, error, refresh, update } = useProjects()
  const [repoUrl, setRepoUrl] = useState("")
  const [search, setSearch] = useState("")
  const [archived, setArchived] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [profile, setProfile] = useState("Local workspace")
  const [storageBytes, setStorageBytes] = useState<number | null>(null)
  const [notice, setNotice] = useState("")
  useEffect(() => {
    void localApi<{ settings: Settings }>("/settings").then(result => setSettings(result.settings)).catch(() => undefined)
    void localApi<{ profile: { display_name: string } }>("/profile").then(result => setProfile(result.profile.display_name)).catch(() => undefined)
    void localApi<{ storage: { size_bytes: number } }>("/storage").then(result => setStorageBytes(result.storage.size_bytes)).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (settings?.auto_open_last_project && settings.default_landing_page === "last_project" &&
        projects[0] && sessionStorage.getItem("repo-explainer:auto-opened") !== "1") {
      sessionStorage.setItem("repo-explainer:auto-opened", "1")
      onOpenProject(projects[0])
    }
  }, [settings, projects, onOpenProject])
  const changeSetting = async (key: keyof Settings, value: Settings[keyof Settings]) => {
    try { const result = await localApi<{ settings: Settings }>("/settings", "PATCH", { [key]: value }); setSettings(result.settings) }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Setting could not be saved.") }
  }
  const download = async () => {
    try {
      const result = await localApi<{ data: unknown }>("/local-data/export")
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }))
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "repo-explainer-local-data.json"; anchor.click(); URL.revokeObjectURL(url)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Export failed.") }
  }
  const importFile = async (file: File) => {
    try {
      if (file.size > 10_000_000) throw new Error("Local data file is too large.")
      const value = JSON.parse(await file.text())
      const result = await localApi<{ imported_projects: number }>("/local-data/import", "POST", value)
      setNotice(`Imported ${result.imported_projects} project records.`); await refresh(archived, search)
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Import failed.") }
  }
  const favorites = projects.filter(item => item.favorite)
  const docs = projects.filter(item => (item.document_count || 0) > 0)
  return <section aria-label="Saved projects home" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 space-y-8">
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-card"><p className="text-xs font-semibold uppercase tracking-wider text-brand">Local workspace · {profile}</p><h1 className="mt-2 text-3xl font-bold text-ink">Your projects</h1>
      <p className="mt-2 text-sm text-ink-secondary">Saved project metadata stays on this computer. Open a repository to analyze its latest available revision.</p>
      <form onSubmit={event => { event.preventDefault(); if (repoUrl.trim()) onAnalyze(repoUrl.trim()) }} className="mt-5 flex flex-wrap gap-2"><input aria-label="Repository URL" value={repoUrl} onChange={event => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repo" className="min-w-60 flex-1 rounded-xl border border-line bg-ctrl-input p-3 text-sm" /><button className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white">Open Repository</button></form>
    </div>
    <div className="flex flex-wrap gap-2"><input aria-label="Search projects" value={search} onChange={event => { setSearch(event.target.value); void refresh(archived, event.target.value) }} placeholder="Search projects, docs, bookmarks" className="flex-1 rounded-xl border border-line bg-surface p-2 text-sm" /><button onClick={() => { setArchived(!archived); void refresh(!archived, search) }} className="rounded-xl border border-line px-3 text-sm text-brand">{archived ? "Show active" : "Show archived"}</button></div>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {notice && <p role="status" className="text-sm text-ink-secondary">{notice}</p>}
    <div><h2 className="mb-3 text-lg font-bold">{archived ? "Archived Projects" : "Recent Projects"}</h2>{loading ? <p className="text-sm">Loading projects…</p> : projects.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{projects.map(item => <ProjectCard key={item.id} project={item} onAnalyze={onAnalyze} onOpenProject={onOpenProject} onUpdate={update} />)}</div> : <p className="text-sm text-ink-secondary">No saved projects yet.</p>}</div>
    {!archived && favorites.length > 0 && <div><h2 className="mb-3 text-lg font-bold">Favorites</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{favorites.map(item => <ProjectCard key={item.id} project={item} onAnalyze={onAnalyze} onOpenProject={onOpenProject} onUpdate={update} />)}</div></div>}
    {!archived && docs.length > 0 && <div><h2 className="mb-3 text-lg font-bold">Saved Documentation</h2><div className="grid gap-3 md:grid-cols-2">{docs.map(item => <button key={item.id} onClick={() => onOpenProject(item)} className="rounded-xl border border-line bg-surface p-4 text-left text-sm"><strong>{item.latest_document_title}</strong><span className="block text-xs text-ink-secondary">{item.document_count} saved documents · {item.name}</span></button>)}</div></div>}
    <details className="rounded-2xl border border-line bg-surface p-5"><summary className="cursor-pointer font-semibold">Local settings and data</summary><div className="mt-4 space-y-3 text-sm">
      {settings && <><label className="flex gap-2"><input type="checkbox" checked={settings.remember_workspace} onChange={event => void changeSetting("remember_workspace", event.target.checked)} /> Remember workspace</label>
        <label className="flex gap-2"><input type="checkbox" checked={settings.auto_open_last_project} onChange={event => void changeSetting("auto_open_last_project", event.target.checked)} /> Auto-open last project on startup</label>
        <label className="flex gap-2"><input type="checkbox" checked={settings.persist_ask_history} onChange={event => void changeSetting("persist_ask_history", event.target.checked)} /> Allow Ask Repo history storage (messages are not stored in this phase)</label>
        <label>Default landing page <select value={settings.default_landing_page} onChange={event => void changeSetting("default_landing_page", event.target.value as Settings["default_landing_page"])} className="ml-2 rounded border border-line bg-surface p-1"><option value="home">Home</option><option value="last_project">Last project prompt</option></select></label>
        {(["activity_limit", "analysis_limit", "validation_limit"] as const).map(key => <label key={key} className="block">{key.replace(/_/g, " ")} <input type="number" min="10" max="1000" value={settings[key]} onChange={event => void changeSetting(key, Number(event.target.value))} className="ml-2 w-24 rounded border border-line p-1" /></label>)}</>}
      <p>Local database size: {storageBytes == null ? "unavailable" : `${Math.ceil(storageBytes / 1024)} KB`}</p><button onClick={() => void download()} className="rounded border border-line px-3 py-1 text-brand">Export Local Data</button><label className="ml-3 cursor-pointer text-brand">Import Local Data <input type="file" accept="application/json,.json" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void importFile(file) }} /></label>
      <p className="text-xs text-ink-secondary">Exports include durable project data; source caches and rollback bytes stay local and are excluded.</p>
    </div></details>
  </section>
}
