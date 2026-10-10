export interface SavedProject {
  id: string
  name: string
  description: string
  repo_url: string
  repository_name: string
  current_branch: string | null
  current_sha: string | null
  last_known_sha: string | null
  last_opened_at: string | null
  last_analyzed_at: string | null
  health_score: number | null
  document_count?: number
  latest_document_title?: string | null
  favorite: number
  archived: number
  local_path: string | null
  sha_changed?: boolean
  recent_activity?: Activity[]
  recent_files?: RecentItem[]
  documents?: SavedDocument[]
  bookmarks?: Bookmark[]
  recent_patches?: Array<{ id: string; status: string; risk: string }>
  saved_plans?: Array<{ id: string; repo_sha: string | null; scope: string; risk: string; steps: Array<{ title: string }> }>
  validation?: { status: string } | null
}

export interface Activity { id: string; type: string; label: string; created_at: string }
export interface RecentItem { id: string; type: string; target: string; view: string | null; created_at: string }
export interface SavedDocument { id: string; type: string; title: string; format: string; repo_sha: string | null; created_at: string; content?: string }
export interface Bookmark { id: string; type: string; target: string; label: string }
export interface AnalysisSnapshot { id: string; analysis_type: string; repo_sha: string | null; summary: string; created_at: string; metrics: Record<string, number> }
export interface WorkspaceSession { project_id: string | null; repo_sha: string | null; active_view: string; selected_file: string | null; selected_symbol: string | null; source_start: number | null; source_end: number | null; graph_mode: string | null; revision_changed?: boolean }
export interface Settings { remember_workspace: boolean; persist_ask_history: boolean; default_landing_page: "home" | "last_project"; auto_open_last_project: boolean; activity_limit: number; analysis_limit: number; validation_limit: number }
