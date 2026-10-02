import type { PlanTrigger } from "./refactor"

export interface PatchTrigger {
  source: "humanize" | "planner" | "selection"
  path: string
  suggestionId?: string
  startLine?: number
  endLine?: number
  transformation?: "trim_trailing_whitespace" | "replace_range"
  replacement?: string
  planTrigger?: PlanTrigger
  stepId?: string
  requestId?: number
}

export interface PatchHunk {
  id: string
  old_start: number
  old_count: number
  new_start: number
  new_count: number
  original_lines: string[]
  proposed_lines: string[]
  reason: string
  confidence: string
  depends_on: string[]
}

export interface PatchFile {
  path: string
  operation?: "modify" | "create" | "delete" | "move"
  source_path?: string | null
  destination_path?: string | null
  confidence?: "HIGH" | "MEDIUM" | "LOW"
  patch_support?: "Verified" | "Preview Only" | "Manual"
  original_hash: string
  proposed_hash: string
  risk_level: string
  public_api_change: boolean
  hunks: PatchHunk[]
  unified_diff: string
  changed_lines: number
  warnings: string[]
}

export interface PatchSet {
  id: string
  source: string
  source_id: string
  repo_revision: string
  status: string
  summary: string
  risk_level: string
  confidence?: "HIGH" | "MEDIUM" | "LOW"
  files: PatchFile[]
  created_at: string
  warnings: string[]
  validation: { state: "PASSED" | "PARTIAL" | "FAILED" | "NOT_RUN"; checks: Array<{ state: string; command: string; output_summary: string; exit_code: number | null }>; checklist?: Record<string, boolean>; note?: string; graph?: Array<{ name: string; state: string }> }
  rollback_available: boolean
  impact: Record<string, unknown>
  git: { available?: boolean; branch?: string; dirty?: boolean; head?: string; commit_status?: string; diff_stat?: string; origin?: string }
  selected_hunks: string[]
  rolled_back_files?: string[]
}

export interface PatchHistoryItem {
  id: string
  source: string
  created_at: string
  status: string
  risk_level: string
  files: string[]
  validation: { state: string }
  rollback_available: boolean
  rolled_back_files?: string[]
}
