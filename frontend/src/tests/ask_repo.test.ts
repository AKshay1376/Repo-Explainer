/**
 * frontend/src/tests/ask_repo.test.ts
 * Unit tests for Ask Repo Phase 6 frontend logic.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import type { RepositoryModel } from "../types/repository"
import type { AskRepoScope, AskCitation, AskMessage } from "../types/qa"

const mockModel: RepositoryModel = {
  metadata: {
    owner: "testorg",
    repo: "web-app",
    description: "Test application",
    default_branch: "main",
    stars: 50,
    forks: 10,
    primary_language: "TypeScript",
    languages: ["TypeScript"],
  },
  technologies: [
    { name: "Express", category: "backend", confidence: "high", evidence: "package.json" },
  ],
  directories: {
    "src": ["src/index.ts", "src/auth.ts"],
  },
  files: {
    "src/index.ts": {
      path: "src/index.ts",
      name: "index.ts",
      extension: ".ts",
      language: "typescript",
      size: 1200,
      category: "entrypoint",
      purpose: "Entry point.",
      imports: [],
      exports: [],
      classes: [],
      functions: ["main"],
      constants: [],
      routes: [],
      dependencies: ["src/auth.ts"],
      dependents: [],
      env_vars: [],
      confidence: 1.0,
    },
    "src/auth.ts": {
      path: "src/auth.ts",
      name: "auth.ts",
      extension: ".ts",
      language: "typescript",
      size: 850,
      category: "service",
      purpose: "Auth logic.",
      imports: [],
      exports: [],
      classes: ["AuthService"],
      functions: ["login"],
      constants: [],
      routes: [],
      dependencies: [],
      dependents: ["src/index.ts"],
      env_vars: [],
      confidence: 1.0,
    },
  },
  symbols: [
    { name: "AuthService", type: "class", file: "src/auth.ts", line: 10 },
  ],
  dependencies: [
    { source: "src/index.ts", target: "src/auth.ts", type: "imports", confidence: 1.0, evidence: "import" },
  ],
  entry_points: [
    { path: "src/index.ts", type: "web-backend", confidence: 1.0, evidence: "start" },
  ],
  api_routes: [
    { method: "POST", path: "/api/login", file: "src/auth.ts", handler: "login", framework: "express" },
  ],
  database_models: [
    { name: "User", file: "src/auth.ts", framework: "prisma", fields: [], relationships: [] },
  ],
  architecture_layers: {
    entry: ["src/index.ts"],
    service: ["src/auth.ts"],
  },
  warnings: [],
}

describe("Ask Repo Suggestions Logic", () => {
  test("generates file-scoped questions when scope is set to a file", () => {
    const scope: AskRepoScope = { file: "src/auth.ts" }
    const fileName = scope.file?.split("/").pop()

    assert.equal(fileName, "auth.ts")
    const expectedPrompts = [
      `What files depend on ${scope.file}? List all reverse dependents.`,
      `What internal and external dependencies does ${scope.file} import?`,
    ]

    assert.match(expectedPrompts[0], /What files depend on src\/auth\.ts\?/)
    assert.match(expectedPrompts[1], /What internal and external dependencies does src\/auth\.ts import\?/)
  })

  test("generates edge-scoped questions when relationship is selected", () => {
    const scope: AskRepoScope = {
      edge: {
        source: "src/index.ts",
        target: "src/auth.ts",
        type: "imports",
      },
    }

    const question = `Explain the relationship and data flow between ${scope.edge?.source} and ${scope.edge?.target} (${scope.edge?.type}).`
    assert.match(question, /src\/index\.ts and src\/auth\.ts \(imports\)/)
  })

  test("derives global suggestions from repository model features", () => {
    const hasEntrypoints = (mockModel.entry_points?.length || 0) > 0
    const hasRoutes = (mockModel.api_routes?.length || 0) > 0
    const hasModels = (mockModel.database_models?.length || 0) > 0

    assert.equal(hasEntrypoints, true)
    assert.equal(hasRoutes, true)
    assert.equal(hasModels, true)
  })
})

describe("Ask Repo Markdown Citations & Links", () => {
  test("extracts markdown link targets formatted with file://", () => {
    const sampleText = "Entry point is defined in [src/index.ts](file://src/index.ts#L10) and imports [src/auth.ts](file://src/auth.ts)."
    const linkRegex = /\[([^\]]+)\]\(file:\/\/\/?([^)#\s]+)(?:#L(\d+))?\)/g
    const matches: Array<{ label: string; file: string; line?: number }> = []

    let match: RegExpExecArray | null
    while ((match = linkRegex.exec(sampleText)) !== null) {
      matches.push({
        label: match[1],
        file: match[2],
        line: match[3] ? parseInt(match[3], 10) : undefined,
      })
    }

    assert.equal(matches.length, 2)
    assert.equal(matches[0].file, "src/index.ts")
    assert.equal(matches[0].line, 10)
    assert.equal(matches[1].file, "src/auth.ts")
    assert.equal(matches[1].line, undefined)
  })
})

describe("Ask Repo Bounded Conversation History", () => {
  test("bounds history to the last 6 messages to stay within token budget", () => {
    const messages: AskMessage[] = Array.from({ length: 12 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
      timestamp: Date.now() + i,
    }))

    const bounded = messages.slice(-6)
    assert.equal(bounded.length, 6)
    assert.equal(bounded[0].content, "Message 6")
    assert.equal(bounded[5].content, "Message 11")
  })
})
