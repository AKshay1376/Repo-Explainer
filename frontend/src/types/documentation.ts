export const DOC_TYPES = ["PROJECT_OVERVIEW", "ARCHITECTURE", "MODULE", "API", "DATA_MODELS", "EXECUTION_FLOW", "ONBOARDING", "CONTRIBUTOR_GUIDE", "CHANGE_SUMMARY", "TECH_DEBT", "REFACTOR_NOTES", "README_DRAFT"] as const
export type DocType = typeof DOC_TYPES[number]
export interface DocCitation { file: string; start_line: number | null; end_line: number | null; symbol: string | null; kind: string }
export interface DocSection { id: string; title: string; facts: string[]; inferences: string[]; unknowns: string[]; citations: DocCitation[]; diagram: string | null; subsections: DocSection[] }
export interface GeneratedDocument { success: true; id: string; type: DocType; title: string; repo_revision: string; scope: string | null; summary: string; sections: DocSection[]; citations: DocCitation[]; warnings: string[]; confidence: string; generated_at: string; cached: boolean; llm_calls: 0 }
export interface DocumentTarget { type: DocType; scope?: string; requestId?: number; options?: Record<string, unknown> }
