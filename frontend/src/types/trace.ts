/**
 * types/trace.ts
 * Frontend type definitions for Phase 7 Execution Path Tracing.
 */

export type StepType =
  | "UI_COMPONENT"
  | "EVENT_HANDLER"
  | "CLIENT_SERVICE"
  | "API_CLIENT"
  | "API_ROUTE"
  | "MIDDLEWARE"
  | "CONTROLLER"
  | "SERVICE"
  | "MODEL"
  | "DATABASE"
  | "UTILITY"
  | "ENTRY_POINT"
  | "UNKNOWN"

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW"

export interface ExecutionStep {
  id: string
  file: string
  symbol?: string | null
  type: StepType
  label: string
  architecture_layer: string
  evidence: string
  confidence: ConfidenceLevel
  line?: number | null
  is_inferred?: boolean
}

export interface ExecutionEdge {
  id: string
  source_step: string
  target_step: string
  relationship: string
  evidence: string
  confidence: ConfidenceLevel
}

export interface ExecutionFlow {
  id: string
  title: string
  description: string
  trigger: string
  steps: ExecutionStep[]
  edges: ExecutionEdge[]
  confidence: ConfidenceLevel
  warnings: string[]
  cycle_detected: boolean
  is_primary: boolean
  flow_category: string
}

export interface TraceResponsePayload {
  success: boolean
  flows: ExecutionFlow[]
  primary_flow_id: string | null
  total_flows: number
  warnings: string[]
  start_step?: ExecutionStep | null
  error?: string
}

export interface TraceTrigger {
  query?: string
  startFile?: string
  startSymbol?: string
  route?: string
  askRepoContext?: {
    candidate_files?: string[]
    related_files?: string[]
    intent?: string
    query?: string
  }
}

export interface TraceHistoryItem {
  id: string
  title: string
  trigger: TraceTrigger
  timestamp: number
}
