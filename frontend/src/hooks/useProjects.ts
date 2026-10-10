import { useCallback, useEffect, useState } from "react"
import type { SavedProject } from "../types/persistence"

export async function localApi<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) })
  const value = await response.json()
  if (!response.ok || !value.success) throw new Error(value.error || "Local project request failed.")
  return value as T
}

export function useProjects() {
  const [projects, setProjects] = useState<SavedProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const refresh = useCallback(async (archived = false, search = "") => {
    setLoading(true); setError("")
    try {
      const result = await localApi<{ projects: SavedProject[] }>(`/projects?archived=${archived}&q=${encodeURIComponent(search)}`)
      setProjects(result.projects)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load saved projects.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const update = useCallback(async (id: string, changes: Record<string, unknown>) => {
    await localApi(`/projects/${id}`, "PATCH", changes); await refresh()
  }, [refresh])
  return { projects, loading, error, refresh, update }
}
