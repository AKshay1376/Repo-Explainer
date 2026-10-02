export type HumanizeMode = "Conservative" | "Balanced" | "Aggressive"
export type HumanizeRisk = "LOW" | "MEDIUM" | "HIGH"

export interface HumanizeFinding {
  id: string
  category: "readability" | "complexity" | "naming" | "comments" | "duplication" | "control-flow" | "abstraction"
  rule: string
  line: number
  end_line: number
  message: string
  evidence: string
  confidence: "HIGH" | "MEDIUM" | "LOW"
  severity: "HIGH" | "MEDIUM" | "LOW"
  suggestion: string
  auto_fixable: boolean
}

export interface HumanizeMetrics {
  total_lines: number
  code_lines: number
  blank_lines: number
  comment_lines: number
  comment_ratio: number
  average_line_length: number
  max_line_length: number
  long_line_count: number
  function_count: number
  max_function_lines: number
  max_complexity: number
  max_nesting: number
  duplicate_block_count: number
  maintainability_score: number
  parser_verified: boolean
}

export interface HumanizePreview {
  id: string
  title: string
  description?: string
  patch: string
  risk_level: HumanizeRisk
  preserves_public_api: boolean
  preview_only: boolean
}

export interface HumanizeImpactSummary {
  available: boolean
  reason?: string
  risk_level?: HumanizeRisk
  risk_score?: number
  summary?: string
  blast_radius?: { total_affected?: number }
  risk_factors?: string[]
}

export interface HumanizeFileResult {
  success: true
  path: string
  language: string
  mode: HumanizeMode
  source_sha256: string
  revision: string
  metrics: HumanizeMetrics
  findings: HumanizeFinding[]
  finding_count: number
  previews: HumanizePreview[]
  risk: { level: HumanizeRisk; factors: string[]; impact: HumanizeImpactSummary | null; public_api_preserved_by_default: boolean }
  redacted: boolean
  warnings?: string[]
  llm_calls: 0
}

export interface HumanizeAuditResult {
  success: true
  analysis_only: true
  mode: HumanizeMode
  revision: string
  coverage: {
    total_files: number
    content_analyzed: number
    metadata_only: number
    skipped_sensitive: number
    skipped_binary: number
    skipped_generated: number
  }
  category_counts: Record<string, number>
  top_files: Array<{
    path: string
    coverage: "content" | "metadata"
    size: number
    public_api_factors: string[]
    finding_count: number
    score: number | null
    top_findings?: HumanizeFinding[]
  }>
  warnings: string[]
  no_repository_changes: true
  llm_calls: 0
}

export interface HumanizeAiResult {
  success: true
  preview_only: true
  applied: false
  llm_calls: 1
  path: string
  mode: HumanizeMode
  risk: { level: "HIGH"; factors: string[]; impact: HumanizeImpactSummary }
  preview: HumanizePreview
}
