export interface SourceLocation {
  path: string
  startLine?: number
  endLine?: number
  requestId?: number
}

export interface SourceFile {
  path: string
  language: string
  content: string | null
  line_count: number
  size: number
  commit_sha: string
  redacted: boolean
  is_sensitive?: boolean
  is_binary: boolean
  is_generated: boolean
  warning: string | null
}

export interface SourceResponse {
  success: boolean
  file?: SourceFile
  symbols?: Array<{ name: string; type: string; file: string; line?: number | null }>
  routes?: Array<{ path: string; file: string; handler?: string | null }>
  models?: Array<{ name: string; file: string }>
  selection?: { start_line: number; end_line: number }
  error?: string
}

export interface SourceMatch {
  line: number
  column: number
}
