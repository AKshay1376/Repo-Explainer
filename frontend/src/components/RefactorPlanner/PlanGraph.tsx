import React, { useMemo } from "react"
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react"
import { applyImpactGraphLayout } from "../../lib/graphLayout"
import type { PlanStep } from "../../types/refactor"

export function buildPlanGraph(steps: PlanStep[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = steps.map((step) => ({
    id: step.id, position: { x: 0, y: 0 },
    data: { label: `${step.order}. ${step.title} · ${step.risk_level}${step.requires_manual_review ? " · review" : " · validation"}` },
    style: { width: 220, borderRadius: 12, padding: 10, border: "1px solid #94a3b8", background: "#ffffff", color: "#172033" },
  }))
  const edges: Edge[] = steps.flatMap((step) => step.prerequisites.map((parent) => ({
    id: `${parent}-${step.id}`, source: parent, target: step.id,
  })))
  return applyImpactGraphLayout(nodes, edges, "LR")
}

export const PlanGraph: React.FC<{ steps: PlanStep[] }> = ({ steps }) => {
  const { nodes, edges } = useMemo(() => buildPlanGraph(steps), [steps])
  return <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Plan dependency graph">
    <h3 className="mb-3 text-sm font-semibold text-ink">Step dependencies</h3>
    <div className="h-96 rounded-lg border border-line" data-graph-nodes={nodes.length} data-graph-edges={edges.length}>
      <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
        <Background /><Controls showInteractive={false} />
      </ReactFlow>
    </div>
  </section>
}
