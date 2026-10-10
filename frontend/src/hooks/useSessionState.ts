import { useEffect, useRef, useState } from "react"
import { localApi } from "./useProjects"
import type { WorkspaceSession } from "../types/persistence"

const SAFE_VIEWS = new Set(["health", "history", "docs", "explorer", "graph", "ask", "flow", "impact", "report", "source", "humanize", "validation", "project"])

export function restoreWorkspace(session: WorkspaceSession | null, projectId: string, sha: string | null) {
  if (!session || session.project_id !== projectId) return { view: null, file: null, stale: false }
  const stale = !!(session.repo_sha && sha && session.repo_sha !== sha)
  if (stale) return { view: null, file: null, stale: true }
  // Patch and refactor contexts are intentionally never restored from navigation metadata.
  return { view: SAFE_VIEWS.has(session.active_view) ? session.active_view : null, file: session.selected_file, stale: false }
}

export function useSessionState(projectId: string | null, sha: string | null, view: string, file: string | null,
  onRestore: (view: string | null, file: string | null) => void) {
  const [stale, setStale] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const ready = useRef(false)
  useEffect(() => {
    if (!projectId) return
    let live = true
    void Promise.all([
      localApi<{ settings: { remember_workspace: boolean } }>("/settings"),
      localApi<{ session: WorkspaceSession | null }>(`/session?current_sha=${encodeURIComponent(sha || "")}`),
    ]).then(([settings, result]) => {
      if (!live) return
      setEnabled(settings.settings.remember_workspace)
      if (settings.settings.remember_workspace) {
        const restored = restoreWorkspace(result.session, projectId, sha)
        setStale(restored.stale)
        onRestore(restored.view, restored.file)
      }
      ready.current = true
    }).catch(() => { ready.current = true })
    return () => { live = false }
  }, [projectId, sha])
  useEffect(() => {
    if (!projectId || !enabled || !ready.current) return
    const timer = window.setTimeout(() => {
      void localApi("/session", "PUT", { project_id: projectId, repo_sha: sha, active_view: view,
        selected_file: file }).catch(() => undefined)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [projectId, sha, view, file, enabled])
  return { stale }
}
