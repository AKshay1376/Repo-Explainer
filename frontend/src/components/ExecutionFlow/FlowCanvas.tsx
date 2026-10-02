/**
 * components/ExecutionFlow/FlowCanvas.tsx
 * Interactive canvas rendering the single-path execution flow with step cards and relationship edges.
 */

import React, { useMemo, useEffect } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  type Node,
  type Edge,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { ExecutionFlow, ExecutionStep, ExecutionEdge } from "../../types/trace"
import { StepNode } from "./StepNode"
import { applyStepFlowLayout } from "../../lib/graphLayout"

interface FlowCanvasProps {
  flow: ExecutionFlow
  direction: "TB" | "LR"
  selectedStep: ExecutionStep | null
  onSelectStep: (step: ExecutionStep) => void
  onSelectEdge: (edge: ExecutionEdge) => void
}

const nodeTypes = {
  stepNode: StepNode,
}

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
  flow,
  direction,
  selectedStep,
  onSelectStep,
  onSelectEdge,
}) => {
  const { fitView } = useReactFlow()

  // 1. Build raw nodes and edges
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    const rawNodes: Node[] = flow.steps.map((step, idx) => ({
      id: step.id,
      type: "stepNode",
      position: { x: 0, y: 0 },
      data: {
        step,
        isSelected: selectedStep?.id === step.id,
        stepNumber: idx + 1,
        totalSteps: flow.steps.length,
        direction,
      },
    }))

    const rawEdges: Edge[] = flow.edges.map((edge) => {
      const isHttp = edge.relationship === "HTTP Request"
      const isCycle = edge.relationship === "cycle to"

      return {
        id: edge.id,
        source: edge.source_step,
        target: edge.target_step,
        type: "smoothstep",
        animated: isHttp,
        label: edge.relationship,
        labelStyle: {
          fontSize: 10,
          fontFamily: "monospace",
          fontWeight: 600,
          fill: isCycle ? "#F59E0B" : isHttp ? "#10B981" : "#EA580C",
        },
        labelBgStyle: {
          fill: "var(--color-surface, #ffffff)",
          fillOpacity: 0.9,
          stroke: "var(--color-line, #e2e8f0)",
          strokeWidth: 1,
          rx: 4,
          ry: 4,
        },
        style: {
          stroke: isCycle ? "#F59E0B" : isHttp ? "#10B981" : "#EA580C",
          strokeWidth: 2,
          strokeDasharray: isCycle ? "5 5" : undefined,
        },
        data: { edge },
      }
    })

    return applyStepFlowLayout(rawNodes, rawEdges, direction)
  }, [flow, direction, selectedStep])

  // Fit view whenever flow or layout direction changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.25, duration: 400 })
    }, 50)
    return () => clearTimeout(timer)
  }, [flow.id, direction, fitView])

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    const step = node.data?.step as ExecutionStep | undefined
    if (step) {
      onSelectStep(step)
    }
  }

  const handleEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    const edgeData = edge.data?.edge as ExecutionEdge | undefined
    if (edgeData) {
      onSelectEdge(edgeData)
    }
  }

  return (
    <div className="relative w-full h-full min-h-[550px] bg-canvas overflow-hidden">
      <ReactFlow
        nodes={layoutedNodes}
        edges={layoutedEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={2.0}
        proOptions={{ hideAttribution: true }}
        className="bg-canvas"
      >
        <Background color="#94A3B8" gap={20} size={1} className="opacity-20" />
        <Controls showInteractive={false} position="bottom-left" className="!m-4 !border-line !bg-surface" />
      </ReactFlow>
    </div>
  )
}
