export interface HistoryStatus {
  success: boolean
  available: boolean
  message?: string | null
  head?: string
  branch?: string | null
  branches?: string[]
  shallow?: boolean
  commit_depth?: number
  dirty?: boolean
}

export interface GitCommit {
  sha: string
  short_sha: string
  parents: string[]
  author_name: string
  author_date: string
  committer_date: string
  subject: string
  files_changed: number
  insertions: number
  deletions: number
  is_merge: boolean
  tags?: string[]
  branches?: string[]
}

export interface HistoryTimeline {
  success: boolean
  commits: GitCommit[]
  limit: number
  offset: number
  has_more: boolean
  partial: boolean
  cached: boolean
}

export interface FileHistory {
  success: boolean
  path: string
  first_known_commit: string | null
  latest_commit: string | null
  total_commits: number
  partial: boolean
  additions: number
  deletions: number
  total_churn: number
  days_since_last_change: number | null
  rename_history: Array<{ sha: string; from: string; to: string }>
  contributors: Array<{ author_name: string; commit_count: number; recent_commits: number; share_percent: number; label: string }>
  recent_commits: GitCommit[]
}

export interface Hotspot {
  path: string
  score: number
  label: string
  factors: Record<"churn" | "frequency" | "centrality" | "maintainability", number>
  commits: number
  total_churn: number
  recent_churn: number
  days_since_last_change: number | null
  confidence: string
  description: string
}

export interface HotspotResponse {
  success: boolean
  hotspots: Hotspot[]
  sampled_commits: number
  weights: Record<string, number>
  thresholds: Record<string, string>
  high_change_impact_commits: Array<{ sha: string; short_sha: string; subject: string; score: number; files_changed: number; churn: number; label: string }>
  warnings: string[]
}

export interface CoChangePair {
  files: [string, string]
  shared_commits: number
  cochange_ratio: number
  confidence: string
  structurally_coupled: boolean
  temporal_only: boolean
}

export interface HistoryComparison {
  success: boolean
  before: string | null
  after: string
  files_changed: number
  insertions: number
  deletions: number
  truncated: boolean
  files: Array<{ path: string; old_path: string | null; status: string; similarity: number | null; additions: number; deletions: number; binary: boolean; diff: string; diff_truncated: boolean; redacted?: boolean }>
}

export interface CommitDetail {
  success: boolean
  commit: GitCommit
  comparison: HistoryComparison
  impact: { label: string; files: Array<{ file: string; risk_level: string; summary: string; blast_radius?: { total_affected?: number } }>; revert_preview?: string }
  architecture_areas: string[]
}

export interface EvolutionResponse {
  success: boolean
  method: string
  checkpoints: Array<{ days_ago: number; available: boolean; sha?: string; files_before?: number; files_now?: number; files_added?: number; files_removed?: number; sample_added?: string[]; sample_removed?: string[]; directories_before?: number; directories_now?: number }>
}

export interface BlameResponse {
  success: boolean
  lines: Array<{ line: number; sha: string; author_name: string; author_time: number; subject: string }>
}
