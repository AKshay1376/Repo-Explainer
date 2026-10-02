import { useEffect, useMemo, useState } from "react"
import type { SourceResponse } from "../types/source"

const responseCache = new Map<string, SourceResponse>()

type LoadState = { key: string; data: SourceResponse | null; error: string | null; loading: boolean }

export function useSourceFile(repoUrl: string, path: string | null, ref: string) {
  const key = useMemo(() => path ? `${repoUrl}|${ref}|${path}` : "", [repoUrl, ref, path])
  const [state, setState] = useState<LoadState>({ key: "", data: null, error: null, loading: false })

  useEffect(() => {
    if (!path) {
      setState({ key: "", data: null, error: null, loading: false })
      return
    }
    const cached = responseCache.get(key)
    if (cached) {
      setState({ key, data: cached, error: null, loading: false })
      return
    }

    const controller = new AbortController()
    setState({ key, data: null, error: null, loading: true })
    fetch("/api/source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, path, ref }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as SourceResponse
        if (!response.ok || !payload.success || !payload.file) {
          throw new Error(payload.error || `Source request failed (${response.status})`)
        }
        return payload
      })
      .then((payload) => {
        responseCache.set(key, payload)
        setState({ key, data: payload, error: null, loading: false })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ key, data: null, error: error instanceof Error ? error.message : "Could not load source.", loading: false })
      })
    return () => controller.abort()
  }, [repoUrl, path, ref, key])

  const current = state.key === key ? state : { key, data: null, error: null, loading: !!path }
  return { file: current.data?.file ?? null, error: current.error, loading: current.loading }
}
