/**
 * frontend/src/types/impact.ts
 * Type definitions for Phase 8 Change Impact Analysis.
 */

export type ImpactConfidence = "CONFIRMED" | "LIKELY" | "INFERRED"

export type ImpactType = "TARGET" | "DIRECT" | "TRANSITIVE" | "TEST" | "ROUTE" | "MODEL"

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH"

export type ChangeType =
  | "GENERAL"
  | "FUNCTION_SIGNATURE"
  | "ROUTE_PATH"
  | "DATABASE_SCHEMA"
  | "RETURN_TYPE"
  | "ENVIRONMENT_VARIABLE"
  | "PUBLIC_API"

export interface ImpactTarget {
  file: string
  symbol?: string
  type: string
  line?: number
  route?: string
  model_name?: string
  env_var?: string
}

export interface ImpactNode {
  id: string
  file: string
  symbol?: string
  category: string
  architecture_layer: string
  impact_type: ImpactType
  depth: number
  confidence: ImpactConfidence
  evidence: string
  path_from_target: string[]
  line?: number
}

export interface ImpactEdge {
  id: string
  source: string
  target: string
  relationship: string
  confidence: ImpactConfidence
  evidence: string
}

export interface BlastRadius {
  directly_affected: number
  transitively_affected: number
  tests_affected: number
  routes_affected: number
  models_affected: number
  total_affected: number
}

export interface AffectedEntity {
  file?: string
  name?: string
  method?: string
  path?: string
  handler?: string
  framework?: string
  confidence: ImpactConfidence
  evidence: string
  naming_convention?: boolean
}

export interface ImpactAnalysis {
  id: string
  target: ImpactTarget
  change_type: ChangeType
  depth: number
  summary: string
  blast_radius: BlastRadius
  risk_level: RiskLevel
  risk_score: number
  risk_factors: string[]
  nodes: ImpactNode[]
  edges: ImpactEdge[]
  affected_tests: AffectedEntity[]
  affected_routes: AffectedEntity[]
  affected_models: AffectedEntity[]
  affected_features: string[]
  warnings: string[]
  truncated: boolean
  direct_impacts?: ImpactNode[]
  transitive_impacts?: ImpactNode[]
  affected_layers?: string[]
  paths?: string[][]
  risk?: {
    level: string
    score: number
    reasons: string[]
  }
}

export interface ImpactTrigger {
  file?: string
  symbol?: string
  route?: string
  model?: string
  env_var?: string
  changeType?: ChangeType
  depth?: number
}
