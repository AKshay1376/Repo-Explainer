import { apiFetch } from "../apiClient"
import { useCallback, useEffect, useState } from "react"
import type { HistoryStatus } from "../types/gitHistory"

export function useGitHistory(repoUrl: string) {
  const [status, setStatus] = useState<HistoryStatus | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    apiFetch(`/api/history/status?repo_url=${encodeURIComponent(repoUrl)}`, { signal: controller.signal })
      .then(response => response.json()).then(result => { if (!controller.signal.aborted) setStatus(result as HistoryStatus) })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "History unavailable.") })
    return () => controller.abort()
  }, [repoUrl])

  const request = useCallback(async <T,>(endpoint: string, payload: Record<string, unknown> = {}): Promise<T> => {
    const response = await apiFetch(`/api/history/${endpoint}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, ...payload }),
    })
    const data = await response.json()
    if (!response.ok || !data.success) throw new Error(data.error || "Git history request failed.")
    return data as T
  }, [repoUrl])

  return { status, error, request }
}
