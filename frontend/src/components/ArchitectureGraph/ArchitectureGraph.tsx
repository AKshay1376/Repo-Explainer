import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type Viewport,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { SourceLocation } from "../../types/source"
import type { RepositoryModel } from "../../types/repository"
import type {
  GraphMode,
  GraphDirection,
  GraphFilterState,
  GraphEdgeData,
} from "../../types/graph"
import {
  buildArchitectureLayersGraph,
  buildFilesGraph,
  computeGraphSummary,
  DEFAULT_GRAPH_FILTERS,
} from "../../lib/graphData"
import { applyDagreLayout } from "../../lib/graphLayout"
import { FileNode } from "./FileNode"
import { LayerNode } from "./LayerNode"
import { GraphToolbar } from "./GraphToolbar"
import { EdgeDetailsModal } from "./EdgeDetailsModal"
import { FileInspector } from "../FileInspector"
import { buildArchitectureStory, decorateStoryGraph, focusedRoute } from "../../lib/storyBuilder"
import { useStoryMode } from "../../hooks/useStoryMode"
import { StoryController } from "../StoryMode/StoryController"

interface ArchitectureGraphProps {
  model: RepositoryModel
  selectedFile: string | null
  onOpenSource?: (location: SourceLocation) => void
  onSelectFile: (path: string) => void
  onNavigateBack?: () => void
  onNavigateForward?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  onAskAboutFile?: (path: string) => void
  onAskAboutEdge?: (edgeData: GraphEdgeData) => void
  onTraceFile?: (filePath: string, symbol?: string) => void
  onTraceRoute?: (routeStr: string) => void
  onTraceEdge?: (edgeData: GraphEdgeData) => void
  onAnalyzeImpact?: (trigger: { file?: string; symbol?: string; route?: string }) => void
  storyLink?: { story?: string | null; step?: number | null; presentation?: boolean; graphMode?: "architecture" | "files" | null }
  onStoryNavigate?: (state: { story: string | null; step: number | null; presentation: boolean; graphMode: "architecture" | "files" }) => void
  onDocumentArchitecture?: () => void
  visible?: boolean
}

const nodeTypes = {
  fileNode: FileNode,
  layerNode: LayerNode,
}

const GraphCanvasInner: React.FC<ArchitectureGraphProps> = ({
  model,
  selectedFile,
  onSelectFile,
  onOpenSource,
  onNavigateBack,
  onNavigateForward,
  canGoBack,
  canGoForward,
  onAskAboutFile,
  onAskAboutEdge,
  onTraceFile,
  onTraceRoute,
  onTraceEdge,
  onAnalyzeImpact,
  storyLink,
  onStoryNavigate,
  onDocumentArchitecture,
  visible = true,
}) => {
  const [mode, setMode] = useState<GraphMode>(storyLink?.story ? "architecture" : storyLink?.graphMode || "architecture")
  const [direction, setDirection] = useState<GraphDirection>("TB")
  const [filters, setFilters] = useState<GraphFilterState>(DEFAULT_GRAPH_FILTERS)
  const [selectedEdgeData, setSelectedEdgeData] = useState<GraphEdgeData | null>(null)
  const [showInspectorPanel, setShowInspectorPanel] = useState<boolean>(true)

  const [focusDirection, setFocusDirection] = useState<"upstream" | "downstream" | "both">("both")
  const [focusHops, setFocusHops] = useState<1 | 2 | "full">(1)
  const [focusActive, setFocusActive] = useState(false)
  const { fitView, zoomIn, zoomOut, getViewport, setViewport, setCenter } = useReactFlow()
  const savedViewport = useRef<Viewport | null>(null)
  const architectureStory = useMemo(() => buildArchitectureStory(model), [model])
  const storyMode = useStoryMode(architectureStory, { active: !!storyLink?.story, step: storyLink?.step, presentation: storyLink?.presentation }, visible, mode,
    state => onStoryNavigate?.({ ...state, graphMode: mode }))

  // Summary statistics
  const summary = useMemo(() => computeGraphSummary(model), [model])

  // Available filter options
  const filterOptions = useMemo(() => {
    const layers = Object.keys(model.architecture_layers || {})
    const categories = new Set<string>()
    const relationships = new Set<string>()

    Object.values(model.files || {}).forEach((f) => {
      if (f.category && f.category !== "unknown") categories.add(f.category)
    })

    ;(model.dependencies || []).forEach((e) => {
      if (e.type) relationships.add(e.type)
    })

    return {
      layers: layers.sort(),
      categories: Array.from(categories).sort(),
      relationships: Array.from(relationships).sort(),
    }
  }, [model])

  // Build raw nodes & edges based on mode
  const { rawNodes, rawEdges, isTruncated, totalMatching, displayedCount } = useMemo(() => {
    if (mode === "architecture") {
      const { nodes, edges } = buildArchitectureLayersGraph(model)
      return {
        rawNodes: nodes,
        rawEdges: edges,
        isTruncated: false,
        totalMatching: nodes.length,
        displayedCount: nodes.length,
      }
    } else {
      const res = buildFilesGraph(model, filters, selectedFile)
      return {
        rawNodes: res.nodes.map((node) => ({ ...node, data: { ...node.data, onOpenSource: (path: string) => onOpenSource?.({ path }) } })),
        rawEdges: res.edges,
        isTruncated: res.isTruncated,
        totalMatching: res.totalMatching,
        displayedCount: res.displayedCount,
      }
    }
  }, [mode, model, filters, selectedFile, onOpenSource])

  // Apply deterministic Dagre layout
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
    return applyDagreLayout(
      rawNodes as Node[],
      rawEdges as Edge[],
      direction,
      mode === "architecture"
    )
  }, [rawNodes, rawEdges, direction, mode])
  const focusNodes = useMemo(() => mode === "files" && focusActive
    ? focusedRoute(layoutedNodes, layoutedEdges, selectedFile, focusDirection, focusHops) : null,
    [mode, focusActive, layoutedNodes, layoutedEdges, selectedFile, focusDirection, focusHops])
  const decorated = useMemo(() => decorateStoryGraph(layoutedNodes, layoutedEdges,
    mode === "architecture" && storyMode.active ? architectureStory : null, storyMode.index, focusNodes),
    [layoutedNodes, layoutedEdges, mode, storyMode.active, storyMode.index, architectureStory, focusNodes])
  useEffect(() => {
    if (storyMode.active && !savedViewport.current) savedViewport.current = getViewport()
    if (!storyMode.active && savedViewport.current) {
      void setViewport(savedViewport.current, { duration: storyMode.reducedMotion ? 0 : 250 }); savedViewport.current = null
    }
  }, [storyMode.active, storyMode.reducedMotion, getViewport, setViewport])
  useEffect(() => {
    if (!storyMode.active || !storyMode.follow || mode !== "architecture") return
    const node = layoutedNodes.find(item => item.id === architectureStory.steps[storyMode.index]?.node_ids[0])
    if (node) void setCenter(node.position.x + 140, node.position.y + 75,
      { zoom: getViewport().zoom, duration: storyMode.reducedMotion ? 0 : 350 })
  }, [storyMode.active, storyMode.index, storyMode.follow, storyMode.reducedMotion, mode, architectureStory, layoutedNodes, getViewport, setCenter])

  // Handle node selection
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (mode === "architecture") {
        // Clicking an architecture layer drills down into Files mode filtered by that layer
        const layerName = (node.data as any)?.layerName
        if (layerName) {
          setFilters((prev) => ({
            ...prev,
            selectedLayer: layerName,
          }))
          setMode("files")
          setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100)
        }
      } else {
        // Files mode: select the file
        onSelectFile(node.id)
        setShowInspectorPanel(true)
      }
    },
    [mode, onSelectFile, fitView]
  )

  // Handle edge inspection
  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (edge.data) {
      setSelectedEdgeData(edge.data as GraphEdgeData)
    }
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelectedEdgeData(null)
  }, [])

  return (
    <div className={storyMode.presentation ? "fixed inset-0 z-[100] overflow-auto bg-surface p-4 space-y-4" : "space-y-4"}>
      {/* Graph Toolbar */}
      {!storyMode.presentation && <GraphToolbar
        mode={mode}
        onModeChange={(newMode) => {
          setMode(newMode)
          setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100)
        }}
        direction={direction}
        onDirectionChange={(newDir) => setDirection(newDir)}
        filters={filters}
        onFiltersChange={setFilters}
        summary={summary}
        availableLayers={filterOptions.layers}
        availableCategories={filterOptions.categories}
        availableRelationships={filterOptions.relationships}
        isTruncated={isTruncated}
        totalMatching={totalMatching}
        displayedCount={displayedCount}
        selectedFile={selectedFile}
        onFitView={() => fitView({ padding: 0.2, duration: 400 })}
        onZoomIn={() => zoomIn({ duration: 250 })}
        onZoomOut={() => zoomOut({ duration: 250 })}
      />}

      {mode === "architecture" && <StoryController sequence={architectureStory} mode={storyMode} launchLabel="Present Architecture"
        onSource={link => onOpenSource?.({ path: link.file, startLine: link.line || undefined })}
        onAsk={(_, link) => { if (link) onAskAboutFile?.(link.file) }}
        onDocument={onDocumentArchitecture} />}
      {mode === "files" && selectedFile && !storyMode.presentation && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 text-xs">
        <button type="button" onClick={() => setFocusActive(value => !value)} aria-pressed={focusActive} className="font-semibold text-brand">{focusActive ? "Exit Focus" : "Focus on Node"}</button>
        {focusActive && <><label>Direction <select aria-label="Focus direction" value={focusDirection} onChange={event => setFocusDirection(event.target.value as typeof focusDirection)}><option value="upstream">Upstream</option><option value="downstream">Downstream</option><option value="both">Both</option></select></label>
          <label>Distance <select aria-label="Focus distance" value={focusHops} onChange={event => setFocusHops(event.target.value === "full" ? "full" : Number(event.target.value) as 1 | 2)}><option value="1">1 hop</option><option value="2">2 hops</option><option value="full">Full connected route</option></select></label></>}
      </div>}

      {/* Main Interactive Canvas & Inspector Container */}
      <div className={`relative w-full rounded-3xl border border-line bg-surface overflow-hidden shadow-card grid grid-cols-1 lg:grid-cols-12 min-h-[600px] ${storyMode.presentation ? "h-[calc(100vh-240px)]" : "h-[720px]"}`}>
        {/* React Flow Canvas (Left / Full) */}
        <div
          className={`relative h-full transition-all duration-300 ${
            selectedFile && showInspectorPanel && mode === "files"
              ? "lg:col-span-8"
              : "lg:col-span-12"
          }`}
        >
          <ReactFlow
            nodes={decorated.nodes}
            edges={decorated.edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            fitView
            minZoom={0.2}
            maxZoom={2.0}
            defaultEdgeOptions={{ type: "smoothstep" }}
            proOptions={{ hideAttribution: true }}
            className="bg-canvas"
          >
            <Background color="#94A3B8" gap={20} size={1} className="opacity-20" />
            <Controls showInteractive={false} position="bottom-left" className="!m-4 !border-line !bg-surface" />
            <MiniMap pannable zoomable nodeColor={node => node.id === architectureStory.steps[storyMode.index]?.node_ids[0] && storyMode.active ? "#f97316" : node.id === selectedFile ? "#0ea5e9" : mode === "architecture" ? "#64748b" : "#94a3b8"} className="!bg-surface/90 !border-line" />
          </ReactFlow>

          {/* Edge details modal */}
          <EdgeDetailsModal
            edgeData={selectedEdgeData}
            onClose={() => setSelectedEdgeData(null)}
            onSelectFile={(p) => {
              onSelectFile(p)
              setSelectedEdgeData(null)
            }}
            onAskAboutEdge={onAskAboutEdge}
            onTraceEdge={onTraceEdge}
            onAnalyzeImpact={onAnalyzeImpact}
            onOpenSource={(path) => onOpenSource?.({ path })}
          />

          {/* Open Inspector Floating Button (if file selected but inspector hidden) */}
          {selectedFile && !showInspectorPanel && mode === "files" && (
            <button
              onClick={() => setShowInspectorPanel(true)}
              className="absolute top-4 right-4 z-20 px-3.5 py-2 rounded-xl bg-brand text-white font-medium text-xs shadow-lg hover:bg-brand-hover transition-all cursor-pointer"
            >
              Open Inspector
            </button>
          )}
        </div>

        {/* File Inspector Panel (Right slide-over / column) */}
        {selectedFile && showInspectorPanel && mode === "files" && !storyMode.presentation && (
          <div className="lg:col-span-4 h-full border-t lg:border-t-0 lg:border-l border-line bg-surface overflow-hidden z-20 shadow-xl lg:shadow-none animate-in fade-in slide-in-from-right-2 duration-200">
            <FileInspector
              filePath={selectedFile}
              model={model}
              onSelectFile={onSelectFile}
              onNavigateBack={onNavigateBack}
              onNavigateForward={onNavigateForward}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onClose={() => setShowInspectorPanel(false)}
              onAskAboutFile={onAskAboutFile}
              onTraceFile={onTraceFile}
              onTraceRoute={onTraceRoute}
              onAnalyzeImpact={onAnalyzeImpact}
              onOpenSource={onOpenSource}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export const ArchitectureGraph: React.FC<ArchitectureGraphProps> = (props) => {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

export default ArchitectureGraph
