import { useCallback, useState } from "react"
import type { RepositoryModel } from "../types/repository"
import type { PatchHistoryItem, PatchSet, PatchTrigger } from "../types/patch"

const post = async <T>(url: string, body: object): Promise<T> => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok || !result.success) throw new Error(result.error || `Patch request failed (${response.status})`)
  return result as T
}

export const usePatchEngine = (repoUrl: string, model: RepositoryModel) => {
  const [patch, setPatch] = useState<PatchSet | null>(null)
  const [history, setHistory] = useState<PatchHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validation, setValidation] = useState<PatchSet["validation"] | null>(null)
  const [selectedDiff, setSelectedDiff] = useState<Record<string, string> | null>(null)
  const [historical, setHistorical] = useState<PatchHistoryItem | null>(null)
  const [postImpact, setPostImpact] = useState<Record<string, unknown> | null>(null)

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/patch/history")
      const result = await response.json()
      if (response.ok && result.success) { setHistory(result.patches); return result.patches as PatchHistoryItem[] }
    } catch { /* unavailable until a local checkout is configured */ }
  }, [])
  const generate = useCallback(async (trigger: PatchTrigger) => {
    setLoading(true); setError(null); setValidation(null); setSelectedDiff(null); setPostImpact(null)
    try {
      const result = await post<PatchSet>("/api/patch/generate", {
        repo_url: repoUrl, repository_model: model, source: trigger.source, path: trigger.path,
        suggestion_id: trigger.suggestionId, start_line: trigger.startLine, end_line: trigger.endLine,
        transformation: trigger.transformation, replacement: trigger.replacement,
        plan_trigger: trigger.planTrigger ? { plan_type: trigger.planTrigger.planType,
          target: trigger.planTrigger.target, destination: trigger.planTrigger.destination,
          options: trigger.planTrigger.options } : undefined,
        step_id: trigger.stepId, ref: model.metadata.latest_commit_sha || model.metadata.default_branch,
      })
      setPatch(result); setHistorical(null); await refreshHistory()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Patch generation failed.") }
    finally { setLoading(false) }
  }, [repoUrl, model, refreshHistory])
  const generateAi = useCallback(async (path: string, instructions: string) => {
    setLoading(true); setError(null); setValidation(null); setSelectedDiff(null); setPostImpact(null)
    try {
      const result = await post<PatchSet>("/api/patch/ai-generate", {
        repo_url: repoUrl, path, instructions: instructions.slice(0, 500), confirm_ai: true,
        ref: model.metadata.latest_commit_sha || model.metadata.default_branch,
      })
      setPatch(result); setHistorical(null); await refreshHistory()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI patch generation failed.") }
    finally { setLoading(false) }
  }, [repoUrl, model, refreshHistory])
  const generateGroup = useCallback(async (paths: string[], suggestionId: string) => {
    setLoading(true); setError(null); setValidation(null); setSelectedDiff(null); setPostImpact(null)
    try {
      const result = await post<PatchSet>("/api/patch/generate", {
        repo_url: repoUrl, source: "group", ref: model.metadata.latest_commit_sha || model.metadata.default_branch,
        changes: paths.map((path) => ({ source: "humanize", path, suggestion_id: suggestionId })),
      })
      setPatch(result); setHistorical(null); await refreshHistory()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Grouped patch generation failed.") }
    finally { setLoading(false) }
  }, [repoUrl, model, refreshHistory])
  const validate = useCallback(async (selectedHunks: string[]) => {
    if (!patch) return
    setLoading(true); setError(null)
    try {
      const result = await post<{ validation: PatchSet["validation"]; selected_diff: Record<string, string> }>("/api/patch/validate", {
        repo_url: repoUrl, patch_id: patch.id, selected_hunks: selectedHunks,
      })
      setValidation(result.validation)
      setSelectedDiff(result.selected_diff)
    } catch (cause) { setValidation(null); setSelectedDiff(null); setError(cause instanceof Error ? cause.message : "Validation failed.") }
    finally { setLoading(false) }
  }, [patch, repoUrl])
  const apply = useCallback(async (selectedHunks: string[], highRisk: boolean, publicApi: boolean, runProjectValidation: boolean) => {
    if (!patch) return
    setLoading(true); setError(null)
    try {
      const result = await post<{ patch: PatchSet }>("/api/patch/apply", {
        repo_url: repoUrl, patch_id: patch.id, selected_hunks: selectedHunks,
        confirm_apply: true, confirm_high_risk: highRisk, confirm_public_api: publicApi,
        run_project_validation: runProjectValidation,
      })
      setPatch(result.patch); setValidation(result.patch.validation); await refreshHistory()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Patch apply failed.") }
    finally { setLoading(false) }
  }, [patch, repoUrl, refreshHistory])
  const rollbackId = useCallback(async (patchId: string, paths: string[], confirmConflicts = false) => {
    setLoading(true); setError(null)
    try {
      const result = await post<{ restored: string[] }>("/api/patch/rollback", {
        repo_url: repoUrl, patch_id: patchId, paths, confirm_rollback: true, confirm_conflicts: confirmConflicts,
      })
      const saved = (await refreshHistory())?.find((item) => item.id === patchId)
      if (patch?.id === patchId && saved) setPatch({ ...patch, status: saved.status, rollback_available: saved.rollback_available, rolled_back_files: saved.rolled_back_files })
      if (historical?.id === patchId && saved) setHistorical(saved)
      return result
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Rollback failed.") }
    finally { setLoading(false) }
  }, [patch, historical, repoUrl, refreshHistory])
  const accept = useCallback(async (patchId: string) => {
    setLoading(true); setError(null)
    try {
      await post("/api/patch/accept", { repo_url: repoUrl, patch_id: patchId, confirm_accept: true })
      if (patch?.id === patchId) setPatch({ ...patch, status: "accepted" })
      if (historical?.id === patchId) setHistorical({ ...historical, status: "accepted" })
      await refreshHistory()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Acceptance failed.") }
    finally { setLoading(false) }
  }, [patch, historical, repoUrl, refreshHistory])
  const reanalyzeImpact = useCallback(async (path: string) => {
    setLoading(true); setError(null)
    try {
      const result = await post<{ impact: Record<string, unknown> }>("/api/patch/impact", {
        repo_url: repoUrl, path, ref: model.metadata.latest_commit_sha || model.metadata.default_branch,
      })
      setPostImpact({ ...result.impact, path })
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impact reanalysis failed.") }
    finally { setLoading(false) }
  }, [repoUrl, model])
  const reject = useCallback(async (patchId: string) => {
    setLoading(true); setError(null)
    try {
      await post("/api/patch/reject", { repo_url: repoUrl, patch_id: patchId })
      if (patch?.id === patchId) setPatch({ ...patch, status: "rejected" })
      await refreshHistory()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reject preview.") }
    finally { setLoading(false) }
  }, [patch, repoUrl, refreshHistory])
  const load = useCallback(async (id: string) => {
    setLoading(true); setError(null); setSelectedDiff(null)
    try {
      const response = await fetch(`/api/patch/${encodeURIComponent(id)}`)
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error || "Patch unavailable.")
      if (result.preview_available === false) { setPatch(null); setHistorical(result as PatchHistoryItem); setValidation(null) }
      else { setHistorical(null); setPatch(result as PatchSet); setValidation((result as PatchSet).validation) }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load patch.") }
    finally { setLoading(false) }
  }, [])
  return { patch, historical, history, loading, error, validation, selectedDiff, postImpact, setValidation, setSelectedDiff, generate, generateGroup, generateAi, validate, apply, accept, reject, reanalyzeImpact, rollbackId, load, refreshHistory }
}
