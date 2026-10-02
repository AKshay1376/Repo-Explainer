/**
 * frontend/src/components/ChangeImpact/ImpactDetailsPanel.tsx
 * Detail inspection panel for Change Impact Analysis.
 * Displays "Why is this affected?" path chain, node metadata,
 * edge evidence, entity lists (routes, tests, models), and cross-view actions.
 */

import React, { useState } from "react"
import type {
  ImpactNode,
  ImpactEdge,
  ImpactAnalysis,
  AffectedEntity,
} from "../../types/impact"
import {
  FileCodeIcon,
  LayersIcon,
  WorkflowIcon,
  CompassIcon,
  MessageSquareIcon,
  ZapIcon,
  RouteIcon,
  DatabaseIcon,
  ArrowRightIcon,
  XIcon,
} from "../ui/icons"

interface ImpactDetailsPanelProps {
  analysis: ImpactAnalysis
  selectedNode: ImpactNode | null
  selectedEdge: ImpactEdge | null
  onCloseSelection: () => void
  onSelectNode: (node: ImpactNode) => void
  onInspectFile?: (file: string) => void
  onShowInGraph?: (file: string) => void
  onTraceFlow?: (file: string) => void
  onAnalyzeFromHere?: (file: string) => void
  onAskRepo?: (question: string) => void
}

export const ImpactDetailsPanel: React.FC<ImpactDetailsPanelProps> = ({
  analysis,
  selectedNode,
  selectedEdge,
  onCloseSelection,
  onSelectNode,
  onInspectFile,
  onShowInGraph,
  onTraceFlow,
  onAnalyzeFromHere,
  onAskRepo,
}) => {
  const [activeTab, setActiveTab] = useState<"nodes" | "routes" | "tests" | "models">("nodes")

  // Node Selected View
  if (selectedNode) {
    const isTarget = selectedNode.impact_type === "TARGET"

    return (
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 pb-3 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-primary/10 border-primary/30 text-primary">
                {selectedNode.impact_type} {selectedNode.depth > 0 && `(Depth ${selectedNode.depth})`}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-muted text-muted-foreground">
                {selectedNode.confidence}
              </span>
            </div>
            <h4 className="text-sm font-semibold font-mono text-foreground break-all">
              {selectedNode.file}
            </h4>
            {selectedNode.symbol && (
              <div className="text-xs font-mono text-primary mt-0.5">
                Symbol: {selectedNode.symbol}()
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onCloseSelection}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Close selection"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Path Explanation ("Why is this affected?") */}
        {!isTarget && selectedNode.path_from_target && selectedNode.path_from_target.length > 1 && (
          <div className="space-y-1.5 bg-muted/30 border border-border/60 rounded-lg p-3">
            <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ZapIcon className="w-3.5 h-3.5 text-primary" />
              Why is this affected?
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              Dependency propagation path from target:
            </div>
            <div className="space-y-1.5 font-mono text-xs">
              {selectedNode.path_from_target.map((step, idx) => {
                const isStart = idx === 0
                const isEnd = idx === selectedNode.path_from_target.length - 1
                return (
                  <div key={idx} className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        isStart
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold"
                          : isEnd
                          ? "bg-primary/20 text-primary border border-primary/30 font-bold"
                          : "bg-muted text-foreground/80 border border-border"
                      }`}
                    >
                      {step.split("/").pop()}
                    </span>
                    {idx < selectedNode.path_from_target.length - 1 && (
                      <span className="text-muted-foreground flex items-center text-[10px]">
                        <ArrowRightIcon className="w-3 h-3 mx-0.5" />
                        impacts
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Evidence text */}
        {selectedNode.evidence && (
          <div className="text-xs space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Detected Evidence
            </span>
            <div className="p-2.5 rounded-lg bg-background border border-border text-foreground/90 font-mono text-[11px]">
              {selectedNode.evidence}
            </div>
          </div>
        )}

        {/* Metadata info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-background border border-border rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Layer</div>
            <div className="font-semibold text-foreground truncate mt-0.5">
              {selectedNode.architecture_layer || "Unassigned"}
            </div>
          </div>
          <div className="bg-background border border-border rounded-lg p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Category</div>
            <div className="font-semibold text-foreground truncate mt-0.5">
              {selectedNode.category || "unknown"}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-border/60 flex flex-wrap gap-2">
          {onInspectFile && (
            <button
              type="button"
              onClick={() => onInspectFile(selectedNode.file)}
              className="px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors border border-border"
            >
              <FileCodeIcon className="w-3.5 h-3.5 text-sky-400" />
              Inspect File
            </button>
          )}

          {onShowInGraph && (
            <button
              type="button"
              onClick={() => onShowInGraph(selectedNode.file)}
              className="px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors border border-border"
            >
              <CompassIcon className="w-3.5 h-3.5 text-indigo-400" />
              Show in Graph
            </button>
          )}

          {onTraceFlow && (
            <button
              type="button"
              onClick={() => onTraceFlow(selectedNode.file)}
              className="px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors border border-border"
            >
              <WorkflowIcon className="w-3.5 h-3.5 text-emerald-400" />
              Trace Flow
            </button>
          )}

          {onAnalyzeFromHere && !isTarget && (
            <button
              type="button"
              onClick={() => onAnalyzeFromHere(selectedNode.file)}
              className="px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium flex items-center gap-1.5 transition-colors border border-primary/30"
            >
              <ZapIcon className="w-3.5 h-3.5" />
              Analyze From Here
            </button>
          )}

          {onAskRepo && (
            <button
              type="button"
              onClick={() =>
                onAskRepo(
                  `How does changing ${analysis.target.file} impact ${selectedNode.file}?`
                )
              }
              className="px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors border border-border"
            >
              <MessageSquareIcon className="w-3.5 h-3.5 text-amber-400" />
              Ask Repo
            </button>
          )}
        </div>
      </div>
    )
  }

  // Edge Selected View
  if (selectedEdge) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between pb-2 border-b border-border/60">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Impact Edge
            </div>
            <h4 className="text-xs font-mono font-semibold text-foreground mt-0.5">
              {selectedEdge.source.replace("node_", "")} → {selectedEdge.target.replace("node_", "")}
            </h4>
          </div>
          <button
            type="button"
            onClick={onCloseSelection}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Relationship:</span>
            <div className="font-mono text-foreground mt-0.5">{selectedEdge.relationship}</div>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Confidence:</span>
            <div className="text-foreground mt-0.5">{selectedEdge.confidence}</div>
          </div>
          {selectedEdge.evidence && (
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">Evidence:</span>
              <div className="p-2 rounded bg-background border border-border text-foreground font-mono mt-0.5">
                {selectedEdge.evidence}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // No Node/Edge Selected: Entities List Tabs
  const routesCount = analysis.affected_routes?.length || 0
  const testsCount = analysis.affected_tests?.length || 0
  const modelsCount = analysis.affected_models?.length || 0
  const nodesCount = analysis.nodes?.filter((n) => n.impact_type !== "TARGET").length || 0

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-border pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("nodes")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === "nodes"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <FileCodeIcon className="w-3.5 h-3.5" />
          Nodes ({nodesCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("routes")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === "routes"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <RouteIcon className="w-3.5 h-3.5" />
          Routes ({routesCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("tests")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === "tests"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <WorkflowIcon className="w-3.5 h-3.5" />
          Tests ({testsCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("models")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === "models"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <DatabaseIcon className="w-3.5 h-3.5" />
          Models ({modelsCount})
        </button>
      </div>

      {/* Tab Content */}
      <div className="max-h-72 overflow-y-auto space-y-2 pr-1 text-xs">
        {activeTab === "nodes" && (
          <>
            {analysis.nodes
              .filter((n) => n.impact_type !== "TARGET")
              .map((node) => (
                <div
                  key={node.id}
                  onClick={() => onSelectNode(node)}
                  className="p-2.5 rounded-lg bg-background border border-border hover:border-primary/60 cursor-pointer transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-semibold text-foreground truncate">
                      {node.file}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span className="uppercase font-bold text-primary">{node.impact_type}</span>
                      <span>Depth: {node.depth}</span>
                      <span>{node.architecture_layer}</span>
                    </div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground shrink-0">
                    {node.confidence}
                  </span>
                </div>
              ))}
          </>
        )}

        {activeTab === "routes" && (
          <>
            {routesCount === 0 ? (
              <div className="text-center py-6 text-muted-foreground">No affected API routes detected.</div>
            ) : (
              analysis.affected_routes.map((r, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-background border border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-400">
                      {r.method || "GET"} {r.path}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{r.confidence}</span>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">{r.file}</div>
                  {r.evidence && <div className="text-[10px] text-foreground/80">{r.evidence}</div>}
                </div>
              ))
            )}
          </>
        )}

        {activeTab === "tests" && (
          <>
            {testsCount === 0 ? (
              <div className="text-center py-6 text-muted-foreground">No affected test files detected.</div>
            ) : (
              analysis.affected_tests.map((t, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-background border border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-amber-400 truncate">{t.file}</span>
                    <span className="text-[10px] text-muted-foreground">{t.confidence}</span>
                  </div>
                  {t.evidence && <div className="text-[10px] text-foreground/80">{t.evidence}</div>}
                </div>
              ))
            )}
          </>
        )}

        {activeTab === "models" && (
          <>
            {modelsCount === 0 ? (
              <div className="text-center py-6 text-muted-foreground">No affected database models detected.</div>
            ) : (
              analysis.affected_models.map((m, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-background border border-border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-rose-400">{m.name}</span>
                    <span className="text-[10px] text-muted-foreground">{m.framework}</span>
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">{m.file}</div>
                  {m.evidence && <div className="text-[10px] text-foreground/80">{m.evidence}</div>}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
