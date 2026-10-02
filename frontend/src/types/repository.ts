/**
 * frontend/src/types/repository.ts
 * Type definitions matching the Phase 3 / Phase 4 normalized RepositoryModel.
 */

export interface RepositoryMetadata {
  owner: string
  repo: string
  description?: string | null
  default_branch: string
  latest_commit_sha?: string | null
  primary_language?: string | null
  languages: string[]
  stars: number
  forks: number
  license?: string | null
}

export type SymbolType =
  | "function"
  | "class"
  | "method"
  | "component"
  | "hook"
  | "variable"
  | "constant"
  | "type"
  | "interface"

export interface SymbolModel {
  name: string
  type: SymbolType
  file: string
  line?: number | null
  signature?: string | null
}

export type RelationshipType =
  | "imports"
  | "component -> service"
  | "route -> controller"
  | "controller -> service"
  | "service -> model"
  | "renders"
  | string

export interface DependencyEdge {
  source: string
  target: string
  type: RelationshipType
  confidence: number
  evidence: string
}

export interface RouteModel {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "ALL" | string
  path: string
  file: string
  handler?: string | null
  framework: "express" | "flask" | "fastapi" | "nextjs" | "django" | string
}

export interface DatabaseField {
  name: string
  type?: string
  definition?: string
}

export interface DatabaseModel {
  name: string
  file: string
  framework: "sqlalchemy" | "prisma" | "mongoose" | "django" | "sequelize" | "typeorm" | string
  fields: DatabaseField[]
  relationships: any[]
}

export interface EntryPoint {
  path: string
  type: "web-frontend" | "web-backend" | "cli/service" | "entrypoint" | string
  confidence: number
  evidence: string
}

export interface TechnologyDetection {
  name: string
  category: "frontend" | "backend" | "database" | "orm" | "tooling" | "testing" | "language" | string
  confidence: "high" | "medium" | "low"
  evidence: string
}

export type FileCategory =
  | "entrypoint"
  | "frontend-component"
  | "frontend-page"
  | "backend-route"
  | "controller"
  | "service"
  | "model"
  | "database"
  | "config"
  | "middleware"
  | "utility"
  | "test"
  | "documentation"
  | "build"
  | "deployment"
  | "script"
  | "unknown"
  | string

export interface FileModel {
  path: string
  name: string
  extension: string
  language: string
  size: number
  category: FileCategory
  purpose: string
  imports: string[]
  exports: string[]
  classes: string[]
  functions: string[]
  constants: string[]
  routes: RouteModel[]
  dependencies: string[] // resolved paths imported by this file
  dependents: string[]   // resolved paths that import this file (reverse deps)
  env_vars: string[]
  confidence: number
}

export interface RepositoryModel {
  metadata: RepositoryMetadata
  technologies: TechnologyDetection[]
  directories: Record<string, string[]>
  files: Record<string, FileModel>
  symbols: SymbolModel[]
  dependencies: DependencyEdge[]
  entry_points: EntryPoint[]
  api_routes: RouteModel[]
  database_models: DatabaseModel[]
  architecture_layers: Record<string, string[]>
  warnings: string[]
}
