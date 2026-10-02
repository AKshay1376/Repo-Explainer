/**
 * types/qa.ts
 * Frontend type definitions for Ask Repo Q&A assistant.
 */

export interface AskCitation {
  file: string
  line?: number | null
  label?: string
}

export interface AskMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  citations?: AskCitation[]
  relatedFiles?: string[]
  evidenceSummary?: string[]
  confidence?: "high" | "medium" | "low"
  isStreaming?: boolean
  intent?: string
  insufficientEvidence?: boolean
}

export interface AskRepoScope {
  file?: string | null
  edge?: {
    source: string
    target: string
    type: string
  } | null
}

export interface AskResponsePayload {
  success: boolean
  answer: string
  citations: AskCitation[]
  related_files: string[]
  confidence: "high" | "medium" | "low"
  evidence_summary: string[]
  intent: string
  insufficient_evidence: boolean
  error?: string
}
