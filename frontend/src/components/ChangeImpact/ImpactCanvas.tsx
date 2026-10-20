/**
 * frontend/src/components/ChangeImpact/ImpactCanvas.tsx
 * Interactive directional graph canvas for Change Impact Analysis.
 * Utilizes @xyflow/react with Dagre layout, custom node views,
 * filtering, sorting, and edge inspection.
 */

import React, { useMemo, useEffect, useRef } from "react"
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeTypes,
  type Viewport,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { ImpactAnalysis, ImpactNode, ImpactEdge } from "../../types/impact"
import { ImpactNodeView } from "./ImpactNodeView"
import { applyImpactGraphLayout } from "../../lib/graphLayout"
import { ZapIcon, AlertCircleIcon } from "../ui/icons"
import { decorateStoryGraph } from "../../lib/storyBuilder"
import type { StorySequence } from "../../types/story"
import type { StoryModeState } from "../../hooks/useStoryMode"

interface ImpactCanvasProps {
  analysis: ImpactAnalysis | null
  story?: StorySequence | null
  storyMode?: StoryModeState
  isLoading: boolean
  selectedNode: ImpactNode | null
  selectedEdge: ImpactEdge | null
  impactFilter: string
  confidenceFilter: string
  layerFilter: string
  searchFilter: string
  sortBy: "depth" | "confidence" | "name"
  layoutDirection: "LR" | "TB"
  onSelectNode: (node: ImpactNode) => void
  onSelectEdge: (edge: ImpactEdge) => void
  onClearSelection: () => void
}

const nodeTypes: NodeTypes = {
  impactNode: ImpactNodeView,
}

const MAX_DISPLAYED_NODES = 100

const ImpactCanvasInner: React.FC<ImpactCanvasProps> = ({
  analysis,
  story,
  storyMode,
  isLoading,
  selectedNode,
  selectedEdge,
  impactFilter,
  confidenceFilter,
  layerFilter,
  searchFilter,
  sortBy,
  layoutDirection,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
}) => {
  const { getViewport, setViewport, setCenter } = useReactFlow()
  const savedViewport = useRef<Viewport | null>(null)
  // Filter and sort nodes
  const { filteredNodes, isCapped, totalBeforeCap } = useMemo(() => {
    if (!analysis) return { filteredNodes: [], isCapped: false, totalBeforeCap: 0 }

    let list = [...analysis.nodes]

    // Always keep TARGET node
    const targetNode = list.find((n) => n.impact_type === "TARGET")
    let dependents = list.filter((n) => n.impact_type !== "TARGET")

    // Filter by impact type
    if (impactFilter !== "ALL") {
      dependents = dependents.filter((n) => n.impact_type === impactFilter)
    }

    // Filter by confidence
    if (confidenceFilter !== "ALL") {
      dependents = dependents.filter((n) => n.confidence === confidenceFilter)
    }

    // Filter by layer
    if (layerFilter !== "ALL") {
      dependents = dependents.filter((n) => n.architecture_layer === layerFilter)
    }

    // Filter by search string
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase()
      dependents = dependents.filter(
        (n) =>
          n.file.toLowerCase().includes(q) ||
          (n.symbol && n.symbol.toLowerCase().includes(q)) ||
          n.architecture_layer.toLowerCase().includes(q)
      )
    }

    // Sort dependents
    if (sortBy === "depth") {
      dependents.sort((a, b) => a.depth - b.depth)
    } else if (sortBy === "confidence") {
      const rank = { CONFIRMED: 1, LIKELY: 2, INFERRED: 3 }
      dependents.sort((a, b) => (rank[a.confidence] || 9) - (rank[b.confidence] || 9))
    } else if (sortBy === "name") {
      dependents.sort((a, b) => a.file.localeCompare(b.file))
    }

    const totalBeforeCap = dependents.length + (targetNode ? 1 : 0)
    const isCapped = dependents.length > MAX_DISPLAYED_NODES
    const cappedDependents = dependents.slice(0, MAX_DISPLAYED_NODES)

    const finalNodes = targetNode ? [targetNode, ...cappedDependents] : cappedDependents

    return {
      filteredNodes: finalNodes,
      isCapped,
      totalBeforeCap,
    }
  }, [analysis, impactFilter, confidenceFilter, layerFilter, searchFilter, sortBy])

  // Convert to React Flow Nodes & Edges with layout
  const { layoutedNodes, layoutedEdges } = useMemo(() => {
    if (!analysis || filteredNodes.length === 0) {
      return { layoutedNodes: [], layoutedEdges: [] }
    }

    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id))

    // Build React Flow nodes
    const rfNodes: Node[] = filteredNodes.map((n) => ({
      id: n.id,
      type: "impactNode",
      data: {
        ...n,
        isSelected: selectedNode?.id === n.id,
      },
      position: { x: 0, y: 0 },
    }))

    // Build React Flow edges that connect visible nodes
    const rfEdges: Edge[] = analysis.edges
      .filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
      .map((e) => {
        const isSelected = selectedEdge?.id === e.id
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: e.confidence === "CONFIRMED",
          style: {
            stroke: isSelected ? "#38bdf8" : e.confidence === "CONFIRMED" ? "#38bdf8" : "#94a3b8",
            strokeWidth: isSelected ? 2.5 : 1.5,
          },
        }
      })

    const { nodes, edges } = applyImpactGraphLayout(rfNodes, rfEdges, layoutDirection)
    return { layoutedNodes: nodes, layoutedEdges: edges }
  }, [analysis, filteredNodes, selectedNode, selectedEdge, layoutDirection])
  const decorated = useMemo(() => decorateStoryGraph(layoutedNodes, layoutedEdges, story || null, storyMode?.index || 0),
    [layoutedNodes, layoutedEdges, story, storyMode?.index])
  useEffect(() => {
    if (storyMode?.active && !savedViewport.current) savedViewport.current = getViewport()
    if (!storyMode?.active && savedViewport.current) {
      void setViewport(savedViewport.current, { duration: storyMode?.reducedMotion ? 0 : 250 }); savedViewport.current = null
    }
  }, [storyMode?.active, getViewport, setViewport])
  useEffect(() => {
    if (!storyMode?.active || !storyMode.follow || !story) return
    const node = layoutedNodes.find(item => item.id === story.steps[storyMode.index]?.node_ids[0])
    if (node) void setCenter(node.position.x + 110, node.position.y + 50,
      { zoom: getViewport().zoom, duration: storyMode.reducedMotion ? 0 : 350 })
  }, [storyMode?.active, storyMode?.index, storyMode?.follow, storyMode?.reducedMotion, story, layoutedNodes, setCenter, getViewport])

  if (isLoading) {
    return (
      <div className="w-full h-[520px] bg-card border border-border rounded-xl flex flex-col items-center justify-center p-6 text-center shadow-sm">
        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <h4 className="text-sm font-semibold text-foreground">Computing Change Blast Radius</h4>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Analyzing reverse dependencies, call sites, API routes, database models, and test connections...
        </p>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="w-full h-[520px] bg-card border border-border rounded-xl flex flex-col items-center justify-center p-6 text-center shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
          <ZapIcon className="w-6 h-6" />
        </div>
        <h4 className="text-base font-semibold text-foreground">Change Impact Analysis</h4>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-md leading-relaxed">
          Select any file, symbol, route, or model in the toolbar above to trace direct and transitive blast radius, exposed tests, and affected routes with 0 LLM calls.
        </p>
      </div>
    )
  }

  return (
    <div className={`relative w-full bg-background border border-border rounded-xl overflow-hidden shadow-inner ${storyMode?.presentation ? "h-[calc(100vh-250px)]" : "h-[520px]"}`}>
      {/* Capped Warning Banner */}
      {isCapped && (
        <div className="absolute top-3 left-3 z-10 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-1.5 rounded-lg backdrop-blur-md flex items-center gap-1.5 shadow">
          <AlertCircleIcon className="w-3.5 h-3.5 shrink-0" />
          <span>
            Displaying 100 of {totalBeforeCap} impacted nodes. Use filters to narrow scope.
          </span>
        </div>
      )}

      <ReactFlow
        nodes={decorated.nodes}
        edges={decorated.edges}
        nodeTypes={nodeTypes}
        fitView
        onNodeClick={(_, node) => {
          const matched = analysis.nodes.find((n) => n.id === node.id)
          if (matched) onSelectNode(matched)
        }}
        onEdgeClick={(_, edge) => {
          const matched = analysis.edges.find((e) => e.id === edge.id)
          if (matched) onSelectEdge(matched)
        }}
        onPaneClick={onClearSelection}
        minZoom={0.2}
        maxZoom={1.8}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
        <Controls className="!bg-card !border-border !text-foreground !rounded-lg !shadow-md" />
        <MiniMap
          nodeColor={(node) => {
            const nData = node.data as unknown as ImpactNode
            if (storyMode?.active && story?.steps[storyMode.index]?.node_ids.includes(node.id)) return "#f97316"
            if (selectedNode?.id === node.id) return "#0ea5e9"
            if (nData?.impact_type === "TARGET") return "#a855f7"
            if (nData?.impact_type === "DIRECT") return "#0ea5e9"
            if (nData?.impact_type === "TEST") return "#f59e0b"
            if (nData?.impact_type === "ROUTE") return "#10b981"
            if (nData?.impact_type === "MODEL") return "#f43f5e"
            return "#6366f1"
          }}
          className="!bg-card/90 !border-border !rounded-lg overflow-hidden"
        />
      </ReactFlow>
    </div>
  )
}

export const ImpactCanvas: React.FC<ImpactCanvasProps> = props => <ReactFlowProvider><ImpactCanvasInner {...props} /></ReactFlowProvider>
