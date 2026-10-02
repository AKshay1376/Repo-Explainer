/**
 * components/ExecutionFlow/ExecutionFlowView.tsx
 * Primary view component for Phase 7 Execution Path Tracing.
 */

import React, { useState, useEffect } from "react"
import { ReactFlowProvider } from "@xyflow/react"
import type { RepositoryModel } from "../../types/repository"
import type { PlanTrigger } from "../../types/refactor"
import type { ExecutionFlow, ExecutionStep, ExecutionEdge, TraceTrigger } from "../../types/trace"
import { useExecutionTrace } from "../../hooks/useExecutionTrace"
import { FlowCanvas } from "./FlowCanvas"
import { FlowToolbar } from "./FlowToolbar"
import { StepDetailsPanel } from "./StepDetailsPanel"
import { EdgeDetailsCard } from "./EdgeDetailsCard"
import { StarterFlows } from "./StarterFlows"
import { TraceHistory } from "./TraceHistory"
import {
  WorkflowIcon,
  PlayIcon,
  SparklesIcon,
  CheckCircleIcon,
  RotateCcwIcon,
} from "../ui/icons"

interface ExecutionFlowViewProps {
  repoUrl: string
  model?: RepositoryModel
  initialTrigger?: TraceTrigger
  onOpenSource?: (step: ExecutionStep) => void
  onHumanize?: (path: string) => void
  onCreatePlan?: (trigger: PlanTrigger) => void
  onInspectFile: (filePath: string) => void
  onShowInGraph: (filePath: string) => void
  onExplainFlowWithAsk: (flow: ExecutionFlow) => void
  onAnalyzeImpact?: (trigger: { file?: string; symbol?: string; route?: string }) => void
}

const FlowViewInner: React.FC<ExecutionFlowViewProps> = ({
  repoUrl,
  model,
  initialTrigger,
  onInspectFile,
  onOpenSource,
  onHumanize,
  onCreatePlan,
  onShowInGraph,
  onExplainFlowWithAsk,
  onAnalyzeImpact,
}) => {
  const [direction, setDirection] = useState<"TB" | "LR">("TB")

  const {
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
  } = useExecutionTrace({ repoUrl, repositoryModel: model })

  // Trigger trace on initialTrigger update or initial load
  useEffect(() => {
    if (initialTrigger) {
      executeTrace(initialTrigger)
    } else if (flows.length === 0 && !isLoading) {
      // Auto-trigger default flow based on available model
      if (model?.entry_points && model.entry_points.length > 0) {
        executeTrace({ query: "startup", startFile: model.entry_points[0].path })
      } else if (model?.api_routes && model.api_routes.length > 0) {
        executeTrace({ route: `${model.api_routes[0].method} ${model.api_routes[0].path}` })
      }
    }
  }, [initialTrigger])

  const handleSearch = (query: string) => {
    executeTrace({ query })
  }

  const handleSelectStarter = (trigger: TraceTrigger) => {
    executeTrace(trigger)
  }

  const handleTraceFromStep = (step: ExecutionStep) => {
    executeTrace({
      startFile: step.file,
      startSymbol: step.symbol || undefined,
    })
  }

  const handleAskAboutStep = (step: ExecutionStep) => {
    if (activeFlow) {
      onExplainFlowWithAsk(activeFlow)
    }
  }

  // Find source & target step objects for selected edge
  const edgeSourceStep = activeFlow?.steps.find((s) => s.id === selectedEdge?.source_step)
  const edgeTargetStep = activeFlow?.steps.find((s) => s.id === selectedEdge?.target_step)

  return (
    <div className="flex flex-col h-[780px] max-h-[85vh] rounded-3xl border border-line bg-surface shadow-card overflow-hidden text-ink">
      {/* 1. Toolbar */}
      <FlowToolbar
        flows={flows}
        activeFlow={activeFlow}
        activeFlowId={activeFlowId}
        onSelectFlow={selectFlow}
        onSearch={handleSearch}
        direction={direction}
        onToggleDirection={() => setDirection((d) => (d === "TB" ? "LR" : "TB"))}
        onFitView={() => {}}
        onExplainFlow={onExplainFlowWithAsk}
        isLoading={isLoading}
      />

      {/* 2. Suggestions & Recent History Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-surface-subtle/30 border-b border-line text-xs shrink-0">
        <StarterFlows model={model} onSelectTrigger={handleSelectStarter} />
        <TraceHistory history={history} onSelectTrigger={handleSelectStarter} />
      </div>

      {/* 3. Main Body */}
      <div className="relative flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* Left/Main Canvas Area */}
        <div className={`relative h-full ${selectedStep ? "lg:col-span-8" : "lg:col-span-12"}`}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center space-y-4">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-brand/20 border-t-brand" />
              <div className="space-y-1">
                <p className="font-semibold text-sm text-ink">Traversing Execution Paths...</p>
                <p className="text-xs text-ink-tertiary">
                  Analyzing static imports, route handlers, client requests, and call hierarchies.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-3">
              <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <WorkflowIcon className="h-6 w-6" />
              </div>
              <p className="font-semibold text-sm text-ink">{error}</p>
              <button
                onClick={() => handleSearch("login")}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-hover transition-colors cursor-pointer"
              >
                <span>Try "login" Trace</span>
              </button>
            </div>
          ) : activeFlow && activeFlow.steps.length > 0 ? (
            <FlowCanvas
              flow={activeFlow}
              direction={direction}
              selectedStep={selectedStep}
              onSelectStep={(step) => {
                setSelectedStep(step)
                setSelectedEdge(null)
              }}
              onSelectEdge={(edge) => {
                setSelectedEdge(edge)
                setSelectedStep(null)
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-12 text-center space-y-4">
              <div className="p-4 rounded-3xl bg-brand-surface text-brand border border-brand-border/40">
                <WorkflowIcon className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-ink">Execution Path Tracing</h3>
                <p className="text-xs text-ink-secondary max-w-sm">
                  Select a starter flow above or type a feature query (e.g. "login", "checkout") to trace code execution.
                </p>
              </div>
            </div>
          )}

          {/* Floating Edge Details Modal */}
          {selectedEdge && (
            <EdgeDetailsCard
              edge={selectedEdge}
              sourceStep={edgeSourceStep}
              targetStep={edgeTargetStep}
              onClose={() => setSelectedEdge(null)}
            />
          )}
        </div>

        {/* Right Step Details Panel (if step selected) */}
        {selectedStep && (
          <div className="lg:col-span-4 h-full z-20 shadow-xl lg:shadow-none">
            <StepDetailsPanel
              step={selectedStep}
              onClose={() => setSelectedStep(null)}
              onInspectFile={onInspectFile}
              onOpenSource={onOpenSource}
              onHumanize={onHumanize}
              onCreatePlan={onCreatePlan}
              onShowInGraph={onShowInGraph}
              onAskAboutStep={handleAskAboutStep}
              onTraceFromStep={handleTraceFromStep}
              onAnalyzeImpact={onAnalyzeImpact}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export const ExecutionFlowView: React.FC<ExecutionFlowViewProps> = (props) => {
  return (
    <ReactFlowProvider>
      <FlowViewInner {...props} />
    </ReactFlowProvider>
  )
}

export default ExecutionFlowView
