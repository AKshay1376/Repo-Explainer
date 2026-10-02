export const PLAN_TYPES = [
  "rename_symbol", "move_file", "move_module", "extract_function", "extract_module",
  "split_large_file", "merge_duplicate_helpers", "replace_dependency", "upgrade_dependency",
  "framework_migration", "api_migration", "database_model_migration",
] as const

export type PlanType = typeof PLAN_TYPES[number]
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH"
export interface PlanTrigger { planType: PlanType; target: string; destination?: string; options?: Record<string, unknown>; requestId?: number }
export interface SourcePoint { path: string; line: number | null; kind: string }

export interface PlanStep {
  id: string
  order: number
  title: string
  description: string
  target: string
  change_type: string
  prerequisites: string[]
  affected_files: string[]
  affected_symbols: string[]
  source_locations: SourcePoint[]
  validation: string[]
  risk_level: RiskLevel
  confidence: "HIGH" | "MEDIUM" | "LOW"
  can_auto_preview: boolean
  requires_manual_review: boolean
}

export interface RefactorPlan {
  id: string
  plan_type: PlanType
  target: string
  destination: string | null
  summary: string
  risk_level: RiskLevel
  risk_factors: string[]
  steps: PlanStep[]
  affected_files: string[]
  affected_symbols: string[]
  affected_routes: Array<{ method?: string; path?: string; file?: string }>
  affected_models: Array<{ name?: string; file?: string }>
  affected_tests: Array<{ file?: string }>
  dependencies: Array<{ source: string; target: string; type: string }>
  warnings: string[]
  manual_review_items: string[]
  confidence: string
  estimated_scope: { files: number; direct_dependents: number; tests: number; steps: number }
  impact: { available: boolean; summary?: string; blast_radius?: { directly_affected: number; transitively_affected: number }; direct?: Array<{ file: string }>; transitive?: Array<{ file: string }> }
  execution_paths: Array<{ route?: string; flow_id?: string; steps: Array<{ file: string; line?: number; label?: string }> }>
  proposed_partitions: Array<{ name: string; symbols: string[] }>
  partition_edges: Array<{ source: string; target: string; evidence: string }>
  migration_evidence: {
    manifests: string[]
    constraints: Array<{ path: string; line: number; evidence: string }>
    import_sites: Array<{ path: string; line: number; evidence: string }>
    usage_sites: Array<{ path: string; line: number; evidence: string }>
    wrapper_sites: Array<{ path: string; line: number; evidence: string }>
  }
  validation: string[]
  validation_state: string
  cycles: string[][]
  external_information_needed: boolean
  llm_calls: number
  planning_only: boolean
  revision: string
}

export interface PlanResponse { success: true; plan: RefactorPlan; llm_calls: number; cached: boolean }
export interface ValidateResponse { success: true; plan_id: string; revision: string; validation_state: "NOT_RUN"; checks: Array<{ name: string; state: string }>; blocking_review: string[]; llm_calls: number; executed_code: false }
export interface ExplainResponse { success: true; plan_id: string; explanation: string; llm_calls: 1; planning_only: true }
