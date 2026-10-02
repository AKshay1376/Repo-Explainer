/**
 * frontend/src/types/graph.ts
 * Type definitions for the interactive architecture graph.
 */

export type GraphMode = "architecture" | "files"
export type GraphDirection = "TB" | "LR"

export interface LayerNodeData {
  layerName: string
  fileCount: number
  files: string[]
  isHighlighted?: boolean
  isDimmed?: boolean
  [key: string]: unknown
}

export interface FileNodeData {
  path: string
  onOpenSource?: (path: string) => void
  name: string
  extension: string
  language: string
  category: string
  layer?: string
  isEntryPoint?: boolean
  entryPointType?: string
  hasRoutes?: boolean
  routeCount?: number
  hasDatabaseModels?: boolean
  modelCount?: number
  isSelected?: boolean
  isDependency?: boolean // selected -> target (outgoing)
  isDependent?: boolean  // source -> selected (incoming)
  isDimmed?: boolean
  isSearchResult?: boolean
  [key: string]: unknown
}

export interface GraphEdgeData {
  source: string
  target: string
  type: string
  confidence: number
  evidence: string
  count?: number // for layer aggregate edges
  isHighlighted?: boolean
  isDimmed?: boolean
  direction?: "outgoing" | "incoming"
  [key: string]: unknown
}

export interface GraphFilterState {
  searchQuery: string
  selectedLayer: string
  selectedLanguage: string
  selectedCategory: string
  selectedRelationship: string
  neighborhoodMode: boolean
  neighborhoodDepth: 1 | 2
  showAllFiles: boolean
}

export interface GraphSummaryMetrics {
  layersCount: number
  filesCount: number
  dependenciesCount: number
  entryPointsCount: number
  routesCount: number
  modelsCount: number
}
