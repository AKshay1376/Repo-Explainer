export type StorySourceType = "execution" | "architecture" | "impact" | "refactor"

export interface StorySourceLink {
  file: string
  line?: number | null
  symbol?: string | null
}

export interface StoryStep {
  id: string
  order: number
  node_ids: string[]
  edge_ids: string[]
  title: string
  description: string
  evidence: string[]
  source_links: StorySourceLink[]
}

export interface StorySequence {
  id: string
  title: string
  description: string
  steps: StoryStep[]
  current_step: number
  source_type: StorySourceType
}

export type LifecycleType = "patch" | "validator" | "job" | "refactor" | "documentation"
export interface LifecycleState {
  id: string
  label: string
  current: boolean
  reached: boolean
  possible: boolean
}
export interface LifecycleSequence {
  type: LifecycleType
  current: string | null
  states: LifecycleState[]
  edges: Array<{ source: string; target: string }>
  detail?: string
}
