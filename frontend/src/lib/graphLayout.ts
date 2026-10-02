/**
 * frontend/src/lib/graphLayout.ts
 * Automatic deterministic directional graph layout using Dagre.
 */

import dagre from "@dagrejs/dagre"
import type { Node, Edge } from "@xyflow/react"
import type { GraphDirection } from "../types/graph"

export const LAYER_NODE_WIDTH = 260
export const LAYER_NODE_HEIGHT = 110

export const FILE_NODE_WIDTH = 240
export const FILE_NODE_HEIGHT = 80

/**
 * Apply automatic directional layout to nodes and edges.
 * Guarantees stable deterministic layout coordinates.
 */
export function applyDagreLayout<T extends Node, E extends Edge>(
  nodes: T[],
  edges: E[],
  direction: GraphDirection = "TB",
  isLayerMode = false
): { nodes: T[]; edges: E[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))

  const nodeWidth = isLayerMode ? LAYER_NODE_WIDTH : FILE_NODE_WIDTH
  const nodeHeight = isLayerMode ? LAYER_NODE_HEIGHT : FILE_NODE_HEIGHT

  g.setGraph({
    rankdir: direction,
    nodesep: isLayerMode ? 80 : 40,
    ranksep: isLayerMode ? 100 : 75,
    marginx: 40,
    marginy: 40,
  })

  // Add nodes
  nodes.forEach((node) => {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  })

  // Add edges
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  // Calculate layout
  dagre.layout(g)

  // Position nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id)
    return {
      ...node,
      targetPosition: direction === "TB" ? "top" : "left",
      sourcePosition: direction === "TB" ? "bottom" : "right",
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

export const STEP_NODE_WIDTH = 290
export const STEP_NODE_HEIGHT = 85

/**
 * Directional layout for linear/focused execution flow paths.
 */
export function applyStepFlowLayout<T extends Node, E extends Edge>(
  nodes: T[],
  edges: E[],
  direction: "TB" | "LR" = "TB"
): { nodes: T[]; edges: E[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))

  g.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 60,
    marginx: 40,
    marginy: 40,
  })

  nodes.forEach((node) => {
    g.setNode(node.id, { width: STEP_NODE_WIDTH, height: STEP_NODE_HEIGHT })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id)
    if (!nodeWithPosition) return node

    return {
      ...node,
      targetPosition: direction === "TB" ? "top" : "left",
      sourcePosition: direction === "TB" ? "bottom" : "right",
      position: {
        x: nodeWithPosition.x - STEP_NODE_WIDTH / 2,
        y: nodeWithPosition.y - STEP_NODE_HEIGHT / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

export const IMPACT_NODE_WIDTH = 260
export const IMPACT_NODE_HEIGHT = 80

/**
 * Directional layout for Change Impact Analysis graphs (TARGET -> DIRECT -> TRANSITIVE).
 */
export function applyImpactGraphLayout<T extends Node, E extends Edge>(
  nodes: T[],
  edges: E[],
  direction: "TB" | "LR" = "LR"
): { nodes: T[]; edges: E[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))

  g.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 70,
    marginx: 40,
    marginy: 40,
  })

  nodes.forEach((node) => {
    g.setNode(node.id, { width: IMPACT_NODE_WIDTH, height: IMPACT_NODE_HEIGHT })
  })

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target)
  })

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id)
    if (!nodeWithPosition) return node

    return {
      ...node,
      targetPosition: direction === "LR" ? "left" : "top",
      sourcePosition: direction === "LR" ? "right" : "bottom",
      position: {
        x: nodeWithPosition.x - IMPACT_NODE_WIDTH / 2,
        y: nodeWithPosition.y - IMPACT_NODE_HEIGHT / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}
