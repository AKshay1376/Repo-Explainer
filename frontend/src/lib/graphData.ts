/**
 * frontend/src/lib/graphData.ts
 * Transformation layer from normalized RepositoryModel to visual graph nodes & edges.
 */

import type { RepositoryModel } from "../types/repository"
import type {
  FileNodeData,
  LayerNodeData,
  GraphEdgeData,
  GraphFilterState,
  GraphSummaryMetrics,
} from "../types/graph"

export const MAX_INITIAL_FILES = 80

export const DEFAULT_GRAPH_FILTERS: GraphFilterState = {
  searchQuery: "",
  selectedLayer: "all",
  selectedLanguage: "all",
  selectedCategory: "all",
  selectedRelationship: "all",
  neighborhoodMode: false,
  neighborhoodDepth: 1,
  showAllFiles: false,
}

export function computeGraphSummary(model: RepositoryModel): GraphSummaryMetrics {
  const layersCount = Object.keys(model.architecture_layers || {}).length
  const filesCount = Object.keys(model.files || {}).length
  const dependenciesCount = (model.dependencies || []).length
  const entryPointsCount = (model.entry_points || []).length
  const routesCount = (model.api_routes || []).length
  const modelsCount = (model.database_models || []).length

  return {
    layersCount,
    filesCount,
    dependenciesCount,
    entryPointsCount,
    routesCount,
    modelsCount,
  }
}

/**
 * Build high-level architecture layer graph.
 * Nodes represent architectural layers; edges represent cross-layer file dependencies.
 */
export function buildArchitectureLayersGraph(model: RepositoryModel) {
  const layers = model.architecture_layers || {}
  const layerEntries = Object.entries(layers).filter(([_, files]) => files.length > 0)

  // Map file path to primary layer
  const fileToLayer: Record<string, string> = {}
  layerEntries.forEach(([layerName, files]) => {
    files.forEach((f) => {
      if (!fileToLayer[f]) {
        fileToLayer[f] = layerName
      }
    })
  })

  // Layer nodes
  const nodes = layerEntries.map(([layerName, files]) => {
    const data: LayerNodeData = {
      layerName,
      fileCount: files.length,
      files,
    }

    return {
      id: `layer-${layerName}`,
      type: "layerNode",
      data,
      position: { x: 0, y: 0 },
    }
  })

  // Aggregate cross-layer dependencies
  const layerEdgeCounts: Record<string, { source: string; target: string; count: number }> = {}

  ;(model.dependencies || []).forEach((edge) => {
    const sourceLayer = fileToLayer[edge.source]
    const targetLayer = fileToLayer[edge.target]

    if (sourceLayer && targetLayer && sourceLayer !== targetLayer) {
      const edgeKey = `${sourceLayer}->${targetLayer}`
      if (!layerEdgeCounts[edgeKey]) {
        layerEdgeCounts[edgeKey] = {
          source: `layer-${sourceLayer}`,
          target: `layer-${targetLayer}`,
          count: 0,
        }
      }
      layerEdgeCounts[edgeKey].count += 1
    }
  })

  const edges = Object.entries(layerEdgeCounts).map(([key, item]) => {
    const data: GraphEdgeData = {
      source: item.source,
      target: item.target,
      type: "depends on",
      confidence: 1.0,
      evidence: `${item.count} cross-layer file dependencies`,
      count: item.count,
    }

    return {
      id: `edge-${key}`,
      source: item.source,
      target: item.target,
      type: "smoothstep",
      animated: item.count > 3,
      data,
      label: `${item.count} ${item.count === 1 ? "dep" : "deps"}`,
      style: {
        strokeWidth: Math.min(Math.max(item.count, 1.5), 5),
        stroke: "#F97316",
      },
    }
  })

  return { nodes, edges }
}

/**
 * Build file-level dependency graph with neighborhood filtering, selection highlighting,
 * and large repository safety limits.
 */
export function buildFilesGraph(
  model: RepositoryModel,
  filters: GraphFilterState,
  selectedFile: string | null
) {
  const allFiles = model.files || {}
  const allEdges = model.dependencies || []

  // Pre-calculate adjacency lists for quick neighborhood lookups
  const outgoingAdjacency: Record<string, string[]> = {}
  const incomingAdjacency: Record<string, string[]> = {}

  allEdges.forEach((e) => {
    if (!outgoingAdjacency[e.source]) outgoingAdjacency[e.source] = []
    outgoingAdjacency[e.source].push(e.target)

    if (!incomingAdjacency[e.target]) incomingAdjacency[e.target] = []
    incomingAdjacency[e.target].push(e.source)
  })

  // Determine candidate visible file paths
  let candidatePaths: string[] = []

  if (filters.neighborhoodMode && selectedFile && allFiles[selectedFile]) {
    // Neighborhood Mode: 1-hop or 2-hop around selectedFile
    const neighborhood = new Set<string>([selectedFile])
    const hop1Outgoing = outgoingAdjacency[selectedFile] || []
    const hop1Incoming = incomingAdjacency[selectedFile] || []

    hop1Outgoing.forEach((p) => neighborhood.add(p))
    hop1Incoming.forEach((p) => neighborhood.add(p))

    if (filters.neighborhoodDepth === 2) {
      const hop1List = Array.from(neighborhood)
      hop1List.forEach((p) => {
        ;(outgoingAdjacency[p] || []).forEach((n) => neighborhood.add(n))
        ;(incomingAdjacency[p] || []).forEach((n) => neighborhood.add(n))
      })
    }

    candidatePaths = Array.from(neighborhood).filter((p) => !!allFiles[p])
  } else {
    // Standard File Mode with Filters
    const q = filters.searchQuery.trim().toLowerCase()
    const layerFiles =
      filters.selectedLayer !== "all"
        ? new Set(model.architecture_layers?.[filters.selectedLayer] || [])
        : null

    candidatePaths = Object.keys(allFiles).filter((path) => {
      const f = allFiles[path]
      if (!f) return false

      if (filters.selectedLanguage !== "all" && f.language !== filters.selectedLanguage) {
        return false
      }
      if (filters.selectedCategory !== "all" && f.category !== filters.selectedCategory) {
        return false
      }
      if (layerFiles && !layerFiles.has(path)) {
        return false
      }
      if (q !== "") {
        const matchPath = path.toLowerCase().includes(q)
        const matchName = f.name.toLowerCase().includes(q)
        const matchCategory = (f.category || "").toLowerCase().includes(q)
        return matchPath || matchName || matchCategory
      }

      return true
    })
  }

  const totalMatching = candidatePaths.length
  let isTruncated = false

  // Apply sensible limit for large repositories
  if (!filters.showAllFiles && candidatePaths.length > MAX_INITIAL_FILES) {
    isTruncated = true

    // Score files to prioritize the most architecturally important nodes
    const entrySet = new Set((model.entry_points || []).map((ep) => ep.path))
    const routeSet = new Set((model.api_routes || []).map((r) => r.file))
    const modelSet = new Set((model.database_models || []).map((m) => m.file))

    const scored = candidatePaths.map((path) => {
      let score = 0
      if (path === selectedFile) score += 1000
      if (entrySet.has(path)) score += 50
      if (routeSet.has(path)) score += 30
      if (modelSet.has(path)) score += 30

      const f = allFiles[path]
      if (f?.category && ["service", "controller", "model", "backend-route"].includes(f.category)) {
        score += 20
      }
      // Edge degree
      const outDeg = (outgoingAdjacency[path] || []).length
      const inDeg = (incomingAdjacency[path] || []).length
      score += (outDeg + inDeg) * 3

      return { path, score }
    })

    scored.sort((a, b) => b.score - a.score)
    candidatePaths = scored.slice(0, MAX_INITIAL_FILES).map((s) => s.path)
  }

  const candidateSet = new Set(candidatePaths)

  // Direct neighbors of selected file for contextual highlighting
  const selectedOutgoing = new Set(selectedFile ? outgoingAdjacency[selectedFile] || [] : [])
  const selectedIncoming = new Set(selectedFile ? incomingAdjacency[selectedFile] || [] : [])
  const hasSelection = !!selectedFile && candidateSet.has(selectedFile)

  // Find layer for each file
  const fileToLayer: Record<string, string> = {}
  Object.entries(model.architecture_layers || {}).forEach(([layerName, files]) => {
    files.forEach((f) => {
      if (!fileToLayer[f]) fileToLayer[f] = layerName
    })
  })

  // Build React Flow nodes
  const nodes = candidatePaths.map((path) => {
    const f = allFiles[path]
    const isSelected = path === selectedFile
    const isDependency = hasSelection && selectedOutgoing.has(path)
    const isDependent = hasSelection && selectedIncoming.has(path)
    const isDimmed = hasSelection && !isSelected && !isDependency && !isDependent

    const entryPoint = (model.entry_points || []).find((ep) => ep.path === path)
    const routes = (model.api_routes || []).filter((r) => r.file === path)
    const models = (model.database_models || []).filter((m) => m.file === path)

    const isSearchResult =
      !!filters.searchQuery.trim() &&
      path.toLowerCase().includes(filters.searchQuery.trim().toLowerCase())

    const data: FileNodeData = {
      path,
      name: f?.name || path.split("/").pop() || path,
      extension: f?.extension || "",
      language: f?.language || "Unknown",
      category: f?.category || "unknown",
      layer: fileToLayer[path],
      isEntryPoint: !!entryPoint,
      entryPointType: entryPoint?.type,
      hasRoutes: routes.length > 0,
      routeCount: routes.length,
      hasDatabaseModels: models.length > 0,
      modelCount: models.length,
      isSelected,
      isDependency,
      isDependent,
      isDimmed,
      isSearchResult,
    }

    return {
      id: path,
      type: "fileNode",
      data,
      position: { x: 0, y: 0 },
    }
  })

  // Build React Flow edges connecting visible candidate nodes
  const edges = allEdges
    .filter((e) => candidateSet.has(e.source) && candidateSet.has(e.target))
    .filter((e) => {
      if (filters.selectedRelationship !== "all" && e.type !== filters.selectedRelationship) {
        return false
      }
      return true
    })
    .map((e) => {
      const isConnectedToSelected =
        hasSelection && (e.source === selectedFile || e.target === selectedFile)
      const isDimmed = hasSelection && !isConnectedToSelected
      const isOutgoing = e.source === selectedFile
      const isIncoming = e.target === selectedFile

      const edgeData: GraphEdgeData = {
        source: e.source,
        target: e.target,
        type: e.type,
        confidence: e.confidence,
        evidence: e.evidence,
        isHighlighted: isConnectedToSelected,
        isDimmed,
        direction: isOutgoing ? "outgoing" : isIncoming ? "incoming" : undefined,
      }

      let strokeColor = "#94A3B8" // subtle default slate
      if (hasSelection) {
        if (isOutgoing) strokeColor = "#0284C7" // blue for dependencies (outgoing)
        else if (isIncoming) strokeColor = "#10B981" // green for dependents (incoming)
        else strokeColor = "#CBD5E1" // dimmed
      } else if (e.type.includes("service") || e.type.includes("controller") || e.type.includes("route")) {
        strokeColor = "#F97316" // brand orange for core architecture connections
      }

      return {
        id: `edge-${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        data: edgeData,
        animated: isConnectedToSelected,
        style: {
          stroke: strokeColor,
          strokeWidth: isConnectedToSelected ? 2.5 : 1.5,
          opacity: isDimmed ? 0.2 : 0.85,
        },
      }
    })

  return {
    nodes,
    edges,
    totalMatching,
    isTruncated,
    displayedCount: nodes.length,
  }
}
