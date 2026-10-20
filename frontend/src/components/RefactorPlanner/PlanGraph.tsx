import React, { useMemo, useEffect, useRef } from "react"
import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type Viewport } from "@xyflow/react"
import { applyImpactGraphLayout } from "../../lib/graphLayout"
import type { PlanStep } from "../../types/refactor"
import type { StorySequence } from "../../types/story"
import type { StoryModeState } from "../../hooks/useStoryMode"
import { decorateStoryGraph } from "../../lib/storyBuilder"

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

const PlanGraphInner: React.FC<{ steps: PlanStep[]; story?: StorySequence | null; storyMode?: StoryModeState }> = ({ steps, story, storyMode }) => {
  const { nodes, edges } = useMemo(() => buildPlanGraph(steps), [steps])
  const decorated = useMemo(() => decorateStoryGraph(nodes, edges, story || null, storyMode?.index || 0), [nodes, edges, story, storyMode?.index])
  const { getViewport, setViewport, setCenter } = useReactFlow()
  const savedViewport = useRef<Viewport | null>(null)
  useEffect(() => {
    if (storyMode?.active && !savedViewport.current) savedViewport.current = getViewport()
    if (!storyMode?.active && savedViewport.current) {
      void setViewport(savedViewport.current, { duration: storyMode?.reducedMotion ? 0 : 250 }); savedViewport.current = null
    }
  }, [storyMode?.active, getViewport, setViewport])
  useEffect(() => {
    if (!storyMode?.active || !storyMode.follow || !story) return
    const node = nodes.find(item => item.id === story.steps[storyMode.index]?.node_ids[0])
    if (node) void setCenter(node.position.x + 110, node.position.y + 45,
      { zoom: getViewport().zoom, duration: storyMode.reducedMotion ? 0 : 350 })
  }, [storyMode?.active, storyMode?.index, storyMode?.follow, storyMode?.reducedMotion, story, nodes, setCenter, getViewport])
  return <section className="rounded-2xl border border-line bg-surface p-4" aria-label="Plan dependency graph">
    <h3 className="mb-3 text-sm font-semibold text-ink">Step dependencies</h3>
    <div className={storyMode?.presentation ? "h-[calc(100vh-240px)] rounded-lg border border-line" : "h-96 rounded-lg border border-line"} data-graph-nodes={nodes.length} data-graph-edges={edges.length}>
      <ReactFlow nodes={decorated.nodes} edges={decorated.edges} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
        <Background /><Controls showInteractive={false} />
      </ReactFlow>
    </div>
  </section>
}

export const PlanGraph: React.FC<{ steps: PlanStep[]; story?: StorySequence | null; storyMode?: StoryModeState }> = props =>
  <ReactFlowProvider><PlanGraphInner {...props} /></ReactFlowProvider>
