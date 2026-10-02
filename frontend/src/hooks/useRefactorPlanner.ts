import { useCallback, useRef, useState } from "react"
import type { RepositoryModel } from "../types/repository"
import type { ExplainResponse, PlanResponse, PlanTrigger, ValidateResponse } from "../types/refactor"

export function useRefactorPlanner(repoUrl: string, model: RepositoryModel) {
  const [planResult, setPlanResult] = useState<PlanResponse | null>(null)
  const [validationResult, setValidationResult] = useState<ValidateResponse | null>(null)
  const [explanation, setExplanation] = useState<ExplainResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const ref = model.metadata.latest_commit_sha || model.metadata.default_branch
  const post = useCallback(async <T,>(endpoint: string, trigger: PlanTrigger, extra: Record<string, unknown> = {}): Promise<T> => {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, repository_model: model, ref,
        plan_type: trigger.planType, target: trigger.target, destination: trigger.destination,
        options: trigger.options || {}, ...extra }),
    })
    const payload = await response.json()
    if (!response.ok || !payload.success) throw new Error(payload.error || "Refactor planning failed.")
    return payload as T
  }, [repoUrl, model, ref])

  const generate = useCallback(async (trigger: PlanTrigger) => {
    const id = ++requestId.current
    setLoading(true); setError(null); setValidationResult(null); setExplanation(null)
    try {
      const result = await post<PlanResponse>("/api/refactor/plan", trigger)
      if (id === requestId.current) setPlanResult(result)
    } catch (cause) {
      if (id === requestId.current) { setPlanResult(null); setError(cause instanceof Error ? cause.message : "Planning failed.") }
    } finally { if (id === requestId.current) setLoading(false) }
  }, [post])

  const validate = useCallback(async (trigger: PlanTrigger) => {
    setError(null)
    try { setValidationResult(await post<ValidateResponse>("/api/refactor/validate", trigger)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Validation checklist failed.") }
  }, [post])

  const explain = useCallback(async (trigger: PlanTrigger) => {
    setError(null); setExplanation(null)
    try { setExplanation(await post<ExplainResponse>("/api/refactor/explain", trigger, { confirm_ai: true })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "AI explanation failed.") }
  }, [post])

  return { planResult, validationResult, explanation, loading, error, generate, validate, explain }
}
