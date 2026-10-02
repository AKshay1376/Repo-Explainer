/**
 * hooks/useExecutionTrace.ts
 * Manages execution path tracing state, API calls to /api/trace,
 * step/edge selection, active flow switching, and client-side history.
 */

import { useState, useCallback, useEffect } from "react"
import type {
  ExecutionFlow,
  ExecutionStep,
  ExecutionEdge,
  TraceResponsePayload,
  TraceTrigger,
  TraceHistoryItem,
} from "../types/trace"
import type { RepositoryModel } from "../types/repository"

interface UseExecutionTraceOptions {
  repoUrl: string
  repositoryModel?: RepositoryModel
}

const STORAGE_KEY = "repo_explainer_trace_history"

export function useExecutionTrace({ repoUrl, repositoryModel }: UseExecutionTraceOptions) {
  const [flows, setFlows] = useState<ExecutionFlow[]>([])
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null)
  const [selectedStep, setSelectedStep] = useState<ExecutionStep | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<ExecutionEdge | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<TraceHistoryItem[]>([])

  // Load client-side trace history on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setHistory(JSON.parse(stored))
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  const saveHistoryItem = useCallback((title: string, trigger: TraceTrigger) => {
    try {
      const item: TraceHistoryItem = {
        id: `hist-${Date.now()}`,
        title,
        trigger,
        timestamp: Date.now(),
      }
      setHistory((prev) => {
        const next = [item, ...prev.filter((h) => h.title !== title)].slice(0, 8)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          // Ignore storage quota
        }
        return next
      })
    } catch {
      // Ignore
    }
  }, [])

  const executeTrace = useCallback(
    async (trigger: TraceTrigger) => {
      if (!repoUrl) return

      setIsLoading(true)
      setError(null)
      setSelectedStep(null)
      setSelectedEdge(null)

      try {
        const response = await fetch("/api/trace", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repo_url: repoUrl,
            query: trigger.query,
            start_file: trigger.startFile,
            start_symbol: trigger.startSymbol,
            route: trigger.route,
            ask_repo_context: trigger.askRepoContext,
            repository_model: repositoryModel || undefined,
          }),
        })

        const data: TraceResponsePayload = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to compute execution trace.")
        }

        if (data.flows.length === 0) {
          setError("No execution paths found matching the specified starting point.")
          setFlows([])
          setActiveFlowId(null)
          return
        }

        setFlows(data.flows)
        const primaryId = data.primary_flow_id || data.flows[0].id
        setActiveFlowId(primaryId)

        // Save history title
        const primaryFlow = data.flows.find((f) => f.id === primaryId) || data.flows[0]
        const historyTitle =
          trigger.route ||
          (trigger.startSymbol ? `${trigger.startFile?.split("/").pop()}:${trigger.startSymbol}` : null) ||
          trigger.startFile?.split("/").pop() ||
          trigger.query ||
          primaryFlow.title

        saveHistoryItem(historyTitle, trigger)
      } catch (err: any) {
        setError(err.message || "An error occurred during execution path tracing.")
        setFlows([])
        setActiveFlowId(null)
      } finally {
        setIsLoading(false)
      }
    },
    [repoUrl, repositoryModel, saveHistoryItem]
  )

  const activeFlow = flows.find((f) => f.id === activeFlowId) || flows[0] || null

  const selectFlow = useCallback((flowId: string) => {
    setActiveFlowId(flowId)
    setSelectedStep(null)
    setSelectedEdge(null)
  }, [])

  const clearTrace = useCallback(() => {
    setFlows([])
    setActiveFlowId(null)
    setSelectedStep(null)
    setSelectedEdge(null)
    setError(null)
  }, [])

  return {
    flows,
    activeFlow,
    activeFlowId,
    selectedStep,
    selectedEdge,
    isLoading,
    error,
    history,
    executeTrace,
    selectFlow,
    setSelectedStep,
    setSelectedEdge,
    clearTrace,
  }
}
