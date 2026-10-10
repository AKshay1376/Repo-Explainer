export type HealthCategory = "Architecture" | "Security" | "Performance" | "Code Quality"
export type HealthLevel = "HIGH" | "MEDIUM" | "LOW"

export interface HealthFinding {
  id: string
  category: HealthCategory
  rule: string
  severity: HealthLevel
  confidence: HealthLevel
  title: string
  summary: string
  why_it_matters: string
  file: string | null
  symbol: string | null
  start_line: number | null
  end_line: number | null
  evidence: Record<string, unknown>
  impact_summary: string | null
  source: string
  suggested_actions: string[]
  patch_suggestion_id?: string
}

export interface HealthDimension {
  score: number
  label: string
  finding_count: number
  high: number
  medium: number
  low: number
  factors: Array<{ finding_id: string; penalty: number }>
  confidence: HealthLevel
}

export interface ProjectHealthResult {
  success: true
  analysis_only: true
  llm_calls: 0
  cached: boolean
  revision: string
  snapshot: string
  overall: { score: number; label: string }
  overall_score: number
  dimensions: Record<HealthCategory, HealthDimension>
  findings: HealthFinding[]
  top_issues: HealthFinding[]
  summary: { finding_count: number; high_count: number; medium_count: number; low_count: number }
  coverage: Record<string, number>
  scoring: {
    start: number
    severity_penalties: Record<HealthLevel, number>
    confidence_weights: Record<HealthLevel, number>
    category_penalty_cap: number
    overall: string
  }
  warnings: string[]
  no_repository_changes: true
}
