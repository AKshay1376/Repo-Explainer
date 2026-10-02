/**
 * frontend/src/components/ChangeImpact/ChangeImpactView.tsx
 * Top-level container for the Change Impact Analysis view.
 * Orchestrates toolbar, blast radius card, graph canvas, and details panel.
 */

import React, { useEffect, useState } from "react"
import type { RepositoryModel } from "../../types/repository"
import type { ImpactNode } from "../../types/impact"
import type { ImpactTrigger, ImpactAnalysis } from "../../types/impact"
import { useChangeImpact } from "../../hooks/useChangeImpact"
import { BlastRadiusCard } from "./BlastRadiusCard"
import { ImpactToolbar } from "./ImpactToolbar"
import { ImpactCanvas } from "./ImpactCanvas"
import { ImpactDetailsPanel } from "./ImpactDetailsPanel"

interface ChangeImpactViewProps {
  repoUrl: string
  repositoryModel?: RepositoryModel
  trigger?: ImpactTrigger | null
  onOpenSource?: (node: Pick<ImpactNode, "file" | "symbol" | "line">) => void
  onSelectFile?: (file: string) => void
  onNavigateTab?: (tab: string) => void
  onTraceFlow?: (file: string) => void
  onAskRepo?: (question: string) => void
}

export const ChangeImpactView: React.FC<ChangeImpactViewProps> = ({
  repoUrl,
  repositoryModel,
  trigger,
  onSelectFile,
  onOpenSource,
  onNavigateTab,
  onTraceFlow,
  onAskRepo,
}) => {
  const [layoutDirection, setLayoutDirection] = useState<"LR" | "TB">("LR")

  const {
    analysis,
    selectedNode,
    selectedEdge,
    isLoading,
    error,
    targetFile,
    targetSymbol,
    changeType,
    depth,
    impactFilter,
    confidenceFilter,
    layerFilter,
    searchFilter,
    sortBy,
    setTargetFile,
    setTargetSymbol,
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
  } = useChangeImpact({ repoUrl, repositoryModel })

  // Trigger from outside (FileInspector, Graph, AskRepo, ExecutionFlow)
  useEffect(() => {
    if (trigger && (trigger.file || trigger.symbol || trigger.route || trigger.model || trigger.env_var)) {
      analyzeImpact(trigger)
    }
  }, [trigger, analyzeImpact])

  // Cross-view actions
  const handleInspectFile = (file: string) => {
    if (onSelectFile) onSelectFile(file)
    if (onNavigateTab) onNavigateTab("explorer")
  }

  const handleShowInGraph = (file: string) => {
    if (onSelectFile) onSelectFile(file)
    if (onNavigateTab) onNavigateTab("graph")
  }

  const handleTraceFlow = (file: string) => {
    if (onTraceFlow) {
      onTraceFlow(file)
    } else if (onNavigateTab) {
      onNavigateTab("flow")
    }
  }

  const handleAnalyzeFromHere = (file: string) => {
    analyzeImpact({ file, changeType, depth })
  }

  const handleExplainImpact = (computedAnalysis: ImpactAnalysis) => {
    if (onAskRepo) {
      const prompt = `Please explain the change impact for \`${computedAnalysis.target.file}\` (Risk: ${computedAnalysis.risk_level}, Score: ${computedAnalysis.risk_score}). ${computedAnalysis.summary}`
      onAskRepo(prompt)
    }
  }

  return (
    <div className="space-y-4">
      {/* Target configuration and filter bar */}
      <ImpactToolbar
        repositoryModel={repositoryModel}
        targetFile={targetFile}
        targetSymbol={targetSymbol}
        changeType={changeType}
        depth={depth}
        isLoading={isLoading}
        impactFilter={impactFilter}
        confidenceFilter={confidenceFilter}
        layerFilter={layerFilter}
        searchFilter={searchFilter}
        sortBy={sortBy}
        layoutDirection={layoutDirection}
        onTargetFileChange={setTargetFile}
        onTargetSymbolChange={setTargetSymbol}
        onChangeTypeChange={setChangeType}
        onDepthChange={setDepth}
        onImpactFilterChange={setImpactFilter}
        onConfidenceFilterChange={setConfidenceFilter}
        onLayerFilterChange={setLayerFilter}
        onSearchFilterChange={setSearchFilter}
        onSortByChange={setSortBy}
        onToggleLayout={() => setLayoutDirection((prev) => (prev === "LR" ? "TB" : "LR"))}
        onAnalyze={() => analyzeImpact({ file: targetFile, symbol: targetSymbol, changeType, depth })}
      />

      {/* Error banner if analysis failed */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive text-xs p-3 rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => analyzeImpact({ file: targetFile, symbol: targetSymbol, changeType, depth })}
            className="underline font-semibold hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Blast Radius & Risk Assessment Section */}
      {analysis && (
        <BlastRadiusCard
          analysis={analysis}
          onExplainImpact={onAskRepo ? handleExplainImpact : undefined}
        />
      )}

      {/* Graph and Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* React Flow Graph (spans 2 columns on large screens) */}
        <div className={analysis ? "lg:col-span-2" : "lg:col-span-3"}>
          <ImpactCanvas
            analysis={analysis}
            isLoading={isLoading}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            impactFilter={impactFilter}
            confidenceFilter={confidenceFilter}
            layerFilter={layerFilter}
            searchFilter={searchFilter}
            sortBy={sortBy}
            layoutDirection={layoutDirection}
            onSelectNode={setSelectedNode}
            onSelectEdge={setSelectedEdge}
            onClearSelection={clearSelection}
          />
        </div>

        {/* Details and Entity Inspector Panel (spans 1 column on large screens) */}
        {analysis && (
          <div className="lg:col-span-1">
            <ImpactDetailsPanel
              analysis={analysis}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onCloseSelection={clearSelection}
              onSelectNode={setSelectedNode}
              onInspectFile={handleInspectFile}
              onOpenSource={onOpenSource}
              onShowInGraph={handleShowInGraph}
              onTraceFlow={handleTraceFlow}
              onAnalyzeFromHere={handleAnalyzeFromHere}
              onAskRepo={onAskRepo}
            />
          </div>
        )}
      </div>
    </div>
  )
}
