/**
 * hooks/useChangeImpact.ts
 * Manages Change Impact Analysis state, API interactions with /api/impact,
 * node/edge selection, filtering, and history.
 */

import { useState, useCallback, useEffect } from "react"
import type {
  ImpactAnalysis,
  ImpactNode,
  ImpactEdge,
  ImpactTrigger,
  ChangeType,
} from "../types/impact"
import type { RepositoryModel } from "../types/repository"

interface UseChangeImpactOptions {
  repoUrl: string
  repositoryModel?: RepositoryModel
}

const STORAGE_KEY = "repo_explainer_impact_history"

export function useChangeImpact({ repoUrl, repositoryModel }: UseChangeImpactOptions) {
  const [analysis, setAnalysis] = useState<ImpactAnalysis | null>(null)
  const [selectedNode, setSelectedNode] = useState<ImpactNode | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<ImpactEdge | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Configuration state
  const [targetFile, setTargetFile] = useState<string>("")
  const [targetSymbol, setTargetSymbol] = useState<string>("")
  const [targetRoute, setTargetRoute] = useState<string>("")
  const [targetModel, setTargetModel] = useState<string>("")
  const [targetEnvVar, setTargetEnvVar] = useState<string>("")
  const [changeType, setChangeType] = useState<ChangeType>("GENERAL")
  const [depth, setDepth] = useState<number>(2)

  // Filters
  const [impactFilter, setImpactFilter] = useState<string>("ALL") // "ALL" | "DIRECT" | "TRANSITIVE" | "TEST"
  const [confidenceFilter, setConfidenceFilter] = useState<string>("ALL")
  const [layerFilter, setLayerFilter] = useState<string>("ALL")
  const [searchFilter, setSearchFilter] = useState<string>("")
  const [sortBy, setSortBy] = useState<"depth" | "confidence" | "name">("depth")

  const [history, setHistory] = useState<ImpactTrigger[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setHistory(JSON.parse(stored))
      }
    } catch {
      // Ignore storage errors
    }
  }, [])

  const saveHistory = useCallback((trigger: ImpactTrigger) => {
    try {
      setHistory((prev) => {
        const itemKey = `${trigger.file || ""}:${trigger.symbol || ""}:${trigger.route || ""}:${trigger.model || ""}`
        const filtered = prev.filter(
          (h) => `${h.file || ""}:${h.symbol || ""}:${h.route || ""}:${h.model || ""}` !== itemKey
        )
        const next = [trigger, ...filtered].slice(0, 8)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          // Ignore
        }
        return next
      })
    } catch {
      // Ignore
    }
  }, [])

  const analyzeImpact = useCallback(
    async (trigger: ImpactTrigger) => {
      if (!repoUrl) return

      setIsLoading(true)
      setError(null)
      setSelectedNode(null)
      setSelectedEdge(null)

      const file = trigger.file !== undefined ? trigger.file : targetFile
      const sym = trigger.symbol !== undefined ? trigger.symbol : targetSymbol
      const r = trigger.route !== undefined ? trigger.route : targetRoute
      const m = trigger.model !== undefined ? trigger.model : targetModel
      const env = trigger.env_var !== undefined ? trigger.env_var : targetEnvVar
      const ct = trigger.changeType || changeType
      const d = trigger.depth || depth

      if (trigger.file !== undefined) setTargetFile(trigger.file)
      if (trigger.symbol !== undefined) setTargetSymbol(trigger.symbol)
      if (trigger.route !== undefined) setTargetRoute(trigger.route)
      if (trigger.model !== undefined) setTargetModel(trigger.model)
      if (trigger.env_var !== undefined) setTargetEnvVar(trigger.env_var)
      if (trigger.changeType) setChangeType(trigger.changeType)
      if (trigger.depth) setDepth(trigger.depth)

      try {
        const response = await fetch("/api/impact", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repo_url: repoUrl,
            target_file: file || undefined,
            target_symbol: sym || undefined,
            target_route: r || undefined,
            target_model: m || undefined,
            target_env_var: env || undefined,
            change_type: ct,
            depth: d,
            repository_model: repositoryModel || undefined,
          }),
        })

        const data = await response.json()

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to compute change impact.")
        }

        setAnalysis(data.analysis)
        saveHistory({
          file,
          symbol: sym,
          route: r,
          model: m,
          env_var: env,
          changeType: ct,
          depth: d,
        })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to compute change impact."
        setError(message)
        setAnalysis(null)
      } finally {
        setIsLoading(false)
      }
    },
    [
      repoUrl,
      targetFile,
      targetSymbol,
      targetRoute,
      targetModel,
      targetEnvVar,
      changeType,
      depth,
      repositoryModel,
      saveHistory,
    ]
  )

  const clearSelection = useCallback(() => {
    setSelectedNode(null)
    setSelectedEdge(null)
  }, [])

  return {
    analysis,
    selectedNode,
    selectedEdge,
    isLoading,
    error,
    targetFile,
    targetSymbol,
    targetRoute,
    targetModel,
    targetEnvVar,
    changeType,
    depth,
    impactFilter,
    confidenceFilter,
    layerFilter,
    searchFilter,
    sortBy,
    history,
    setTargetFile,
    setTargetSymbol,
    setTargetRoute,
    setTargetModel,
    setTargetEnvVar,
    setChangeType,
    setDepth,
    setImpactFilter,
    setConfidenceFilter,
    setLayerFilter,
    setSearchFilter,
    setSortBy,
    setSelectedNode,
    setSelectedEdge,
    clearSelection,
    analyzeImpact,
  }
}
