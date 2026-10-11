import React, { useEffect, useState } from "react"
import { localApi, useProjects } from "../../hooks/useProjects"
import type { SavedProject, Settings } from "../../types/persistence"
import { ConfirmDialog } from "../ui/AccessibleDialog"
import { useToast } from "../ui/Toasts"

interface Props { onAnalyze: (repoUrl: string) => void; onQueue?: (repoUrl: string) => void; onOpenProject: (project: SavedProject) => void; onSettings?: () => void }

const ProjectCard: React.FC<{ project: SavedProject; onAnalyze: Props["onAnalyze"]; onOpenProject: Props["onOpenProject"]; onUpdate: (id: string, changes: Record<string, unknown>) => Promise<void> }> = ({ project, onAnalyze, onOpenProject, onUpdate }) => {
  const [confirmArchive, setConfirmArchive] = useState(false)
  return <article className="rounded-2xl border border-line bg-surface p-4 shadow-card space-y-2">
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{project.name}</h3><p className="text-xs text-ink-secondary">{project.repo_url}</p></div>
      <button aria-label={project.favorite ? `Unfavorite ${project.name}` : `Favorite ${project.name}`} onClick={() => void onUpdate(project.id, { favorite: !project.favorite })} className="text-lg text-brand">{project.favorite ? "★" : "☆"}</button></div>
    <p className="text-xs text-ink-secondary">{project.current_branch || "Branch unknown"} · {project.current_sha?.slice(0, 10) || "SHA unknown"} · Last opened {project.last_opened_at ? new Date(project.last_opened_at).toLocaleDateString() : "never"}</p>
    <p className="text-xs text-ink-secondary">{project.health_score == null ? "Health not analyzed" : `Health ${project.health_score}`} · {project.last_analyzed_at ? `Analyzed ${new Date(project.last_analyzed_at).toLocaleDateString()}` : "No analysis"}</p>
    <div className="flex flex-wrap gap-2 text-xs"><button onClick={() => onOpenProject(project)} className="rounded bg-brand px-3 py-1.5 font-semibold text-white">Open / Resume</button>
      <button onClick={() => onAnalyze(project.repo_url)} className="rounded border border-line px-3 py-1.5 text-brand">Reanalyze</button>
      <button onClick={() => project.archived ? void onUpdate(project.id, { archived: false }) : setConfirmArchive(true)} className="rounded border border-line px-3 py-1.5 text-ink-secondary">{project.archived ? "Reopen" : "Archive"}</button></div>
    {confirmArchive && <ConfirmDialog title={`Archive ${project.name}?`} consequence="The project will leave your active list. Its saved data remains available under archived projects." confirmLabel="Archive project" onClose={() => setConfirmArchive(false)} onConfirm={() => { setConfirmArchive(false); void onUpdate(project.id, { archived: true }) }} />}
  </article>
}

export const HomeView: React.FC<Props> = ({ onAnalyze, onQueue, onOpenProject, onSettings = () => undefined }) => {
  const { projects, loading, error, refresh, update } = useProjects()
  const toast = useToast()
  const updateProject = async (id: string, changes: Record<string, unknown>) => {
    await update(id, changes)
    toast(changes.archived === true ? "Project archived." : changes.favorite === true ? "Project added to favorites." : "Project updated.")
  }
  const [repoUrl, setRepoUrl] = useState("")
  const [search, setSearch] = useState("")
  const [archived, setArchived] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [profile, setProfile] = useState("Local workspace")
  useEffect(() => {
    void localApi<{ settings: Settings }>("/settings").then(result => setSettings(result.settings)).catch(() => undefined)
    void localApi<{ profile: { display_name: string } }>("/profile").then(result => setProfile(result.profile.display_name)).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (settings?.auto_open_last_project && settings.default_landing_page === "last_project" &&
        projects[0] && sessionStorage.getItem("repo-explainer:auto-opened") !== "1") {
      sessionStorage.setItem("repo-explainer:auto-opened", "1")
      onOpenProject(projects[0])
    }
  }, [settings, projects, onOpenProject])
  const favorites = projects.filter(item => item.favorite)
  const docs = projects.filter(item => (item.document_count || 0) > 0)
  return <section aria-label="Saved projects home" className="mx-auto max-w-7xl px-4 py-10 sm:px-6 space-y-8">
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-card"><p className="text-xs font-semibold uppercase tracking-wider text-brand">Local workspace · {profile}</p><h1 className="mt-2 text-3xl font-bold text-ink">Your projects</h1>
      <p className="mt-2 text-sm text-ink-secondary">Saved project metadata stays on this computer. Open a repository to analyze its latest available revision.</p>
      <form onSubmit={event => { event.preventDefault(); if (repoUrl.trim()) onAnalyze(repoUrl.trim()) }} className="mt-5 flex flex-wrap gap-2"><input aria-label="Repository URL" value={repoUrl} onChange={event => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repo" className="min-w-60 flex-1 rounded-xl border border-line bg-ctrl-input p-3 text-sm" /><button className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white">Open Repository</button></form>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><span className="text-ink-tertiary">Try a public sample:</span>{["psf/requests", "pallets/flask", "expressjs/express"].map(repo => <button key={repo} onClick={() => onAnalyze(repo)} className="rounded-full border border-line px-3 py-1 text-brand hover:border-brand">{repo}</button>)}{onQueue && <button onClick={() => repoUrl.trim() && onQueue(repoUrl.trim())} disabled={!repoUrl.trim()} className="ml-auto font-medium text-brand disabled:opacity-40">Analyze in background</button>}</div>
    </div>
    <div className="flex flex-wrap gap-2"><input aria-label="Search projects" value={search} onChange={event => { setSearch(event.target.value); void refresh(archived, event.target.value) }} placeholder="Search projects, docs, bookmarks" className="flex-1 rounded-xl border border-line bg-surface p-2 text-sm" /><button onClick={() => { setArchived(!archived); void refresh(!archived, search) }} className="rounded-xl border border-line px-3 text-sm text-brand">{archived ? "Show active" : "Show archived"}</button></div>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <div><h2 className="mb-3 text-lg font-bold">{archived ? "Archived Projects" : "Recent Projects"}</h2>{loading ? <div role="status" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[1,2,3].map(item => <div key={item} className="h-32 rounded-2xl border border-line bg-surface p-4"><div className="h-4 w-1/2 rounded bg-surface-inset" /><div className="mt-4 h-3 w-3/4 rounded bg-surface-inset" /></div>)}</div> : projects.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{projects.map(item => <ProjectCard key={item.id} project={item} onAnalyze={onAnalyze} onOpenProject={onOpenProject} onUpdate={updateProject} />)}</div> : <p className="text-sm text-ink-secondary">No saved projects yet. Paste a GitHub repository URL above to get started.</p>}</div>
    {!archived && favorites.length > 0 && <div><h2 className="mb-3 text-lg font-bold">Favorites</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{favorites.map(item => <ProjectCard key={item.id} project={item} onAnalyze={onAnalyze} onOpenProject={onOpenProject} onUpdate={updateProject} />)}</div></div>}
    {!archived && docs.length > 0 && <div><h2 className="mb-3 text-lg font-bold">Saved Documentation</h2><div className="grid gap-3 md:grid-cols-2">{docs.map(item => <button key={item.id} onClick={() => onOpenProject(item)} className="rounded-xl border border-line bg-surface p-4 text-left text-sm"><strong>{item.latest_document_title}</strong><span className="block text-xs text-ink-secondary">{item.document_count} saved documents · {item.name}</span></button>)}</div></div>}
    <button onClick={onSettings} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-brand">Local settings and data</button>
  </section>
}
