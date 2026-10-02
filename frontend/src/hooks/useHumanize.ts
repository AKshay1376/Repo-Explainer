import { useCallback, useRef, useState } from "react"
import type { RepositoryModel } from "../types/repository"
import type { HumanizeAiResult, HumanizeAuditResult, HumanizeFileResult, HumanizeMode } from "../types/humanize"

interface Options { repoUrl: string; model: RepositoryModel }

export function useHumanize({ repoUrl, model }: Options) {
  const [fileResult, setFileResult] = useState<HumanizeFileResult | null>(null)
  const [auditResult, setAuditResult] = useState<HumanizeAuditResult | null>(null)
  const [aiResult, setAiResult] = useState<HumanizeAiResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const ref = model.metadata.latest_commit_sha || model.metadata.default_branch

  const post = useCallback(async <T,>(endpoint: string, body: Record<string, unknown>): Promise<T> => {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, ref, repository_model: model, ...body }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || "Humanize request failed.")
    return payload as T
  }, [repoUrl, ref, model])

  const analyzeFile = useCallback(async (path: string, mode: HumanizeMode) => {
    const id = ++requestId.current
    setLoading(true); setError(null); setAiResult(null)
    try {
      const result = await post<HumanizeFileResult>("/api/humanize", { path, mode })
      if (id === requestId.current) setFileResult(result)
    } catch (cause) {
      if (id === requestId.current) { setFileResult(null); setError(cause instanceof Error ? cause.message : "Analysis failed.") }
    } finally { if (id === requestId.current) setLoading(false) }
  }, [post])

  const auditRepository = useCallback(async (mode: HumanizeMode) => {
    const id = ++requestId.current
    setLoading(true); setError(null)
    try {
      const result = await post<HumanizeAuditResult>("/api/humanize", { audit_only: true, mode })
      if (id === requestId.current) setAuditResult(result)
    } catch (cause) {
      if (id === requestId.current) { setAuditResult(null); setError(cause instanceof Error ? cause.message : "Audit failed.") }
    } finally { if (id === requestId.current) setLoading(false) }
  }, [post])

  const requestAiPreview = useCallback(async (path: string, mode: HumanizeMode, instructions: string) => {
    const id = ++requestId.current
    setLoading(true); setError(null); setAiResult(null)
    try {
      const result = await post<HumanizeAiResult>("/api/humanize/ai-preview", {
        path, mode, instructions, confirm_ai: true,
      })
      if (id === requestId.current) setAiResult(result)
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "AI preview failed.")
    } finally { if (id === requestId.current) setLoading(false) }
  }, [post])

  return { fileResult, auditResult, aiResult, loading, error, analyzeFile, auditRepository, requestAiPreview }
}
