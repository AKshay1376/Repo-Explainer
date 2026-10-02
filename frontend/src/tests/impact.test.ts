/**
 * frontend/src/tests/impact.test.ts
 * Unit tests for Phase 8 Change Impact Analysis.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import type { Node, Edge } from "@xyflow/react"
import {
  applyImpactGraphLayout,
  IMPACT_NODE_WIDTH,
  IMPACT_NODE_HEIGHT,
} from "../lib/graphLayout"
import type {
  ImpactAnalysis,
  ImpactNode,
  ImpactEdge,
  ImpactType,
  ImpactConfidence,
  RiskLevel,
  ChangeType,
  ImpactTrigger,
} from "../types/impact"

describe("Change Impact Graph Layout", () => {
  test("applyImpactGraphLayout returns empty arrays for empty nodes", () => {
    const res = applyImpactGraphLayout([], [])
    assert.deepEqual(res.nodes, [])
    assert.deepEqual(res.edges, [])
  })

  test("applyImpactGraphLayout positions nodes sequentially in LR (left-to-right) mode", () => {
    const mockNodes: Node[] = [
      { id: "node-target", position: { x: 0, y: 0 }, data: { label: "authService.ts" } },
      { id: "node-direct", position: { x: 0, y: 0 }, data: { label: "Login.tsx" } },
      { id: "node-transitive", position: { x: 0, y: 0 }, data: { label: "App.tsx" } },
    ]

    const mockEdges: Edge[] = [
      { id: "e1", source: "node-target", target: "node-direct" },
      { id: "e2", source: "node-direct", target: "node-transitive" },
    ]

    const { nodes } = applyImpactGraphLayout(mockNodes, mockEdges, "LR")

    assert.equal(nodes.length, 3)
    // In LR mode, X coordinate increases from target -> direct -> transitive
    assert.ok(nodes[0].position.x < nodes[1].position.x)
    assert.ok(nodes[1].position.x < nodes[2].position.x)

    // Verify handle orientations
    nodes.forEach((n) => {
      assert.equal(n.targetPosition, "left")
      assert.equal(n.sourcePosition, "right")
    })
  })

  test("applyImpactGraphLayout positions nodes sequentially in TB (top-to-bottom) mode", () => {
    const mockNodes: Node[] = [
      { id: "node-target", position: { x: 0, y: 0 }, data: { label: "authService.ts" } },
      { id: "node-direct", position: { x: 0, y: 0 }, data: { label: "Login.tsx" } },
      { id: "node-transitive", position: { x: 0, y: 0 }, data: { label: "App.tsx" } },
    ]

    const mockEdges: Edge[] = [
      { id: "e1", source: "node-target", target: "node-direct" },
      { id: "e2", source: "node-direct", target: "node-transitive" },
    ]

    const { nodes } = applyImpactGraphLayout(mockNodes, mockEdges, "TB")

    assert.equal(nodes.length, 3)
    // In TB mode, Y coordinate increases from target -> direct -> transitive
    assert.ok(nodes[0].position.y < nodes[1].position.y)
    assert.ok(nodes[1].position.y < nodes[2].position.y)

    nodes.forEach((n) => {
      assert.equal(n.targetPosition, "top")
      assert.equal(n.sourcePosition, "bottom")
    })
  })
})

describe("Impact Data Models & Classification", () => {
  test("all 6 impact node types are recognized", () => {
    const validTypes: ImpactType[] = ["TARGET", "DIRECT", "TRANSITIVE", "TEST", "ROUTE", "MODEL"]
    validTypes.forEach((t) => {
      assert.ok(typeof t === "string")
      assert.ok(["TARGET", "DIRECT", "TRANSITIVE", "TEST", "ROUTE", "MODEL"].includes(t))
    })
  })

  test("confidence levels and risk levels are properly typed", () => {
    const validConf: ImpactConfidence[] = ["CONFIRMED", "LIKELY", "INFERRED"]
    assert.equal(validConf.length, 3)

    const validRisk: RiskLevel[] = ["LOW", "MEDIUM", "HIGH"]
    assert.equal(validRisk.length, 3)

    const validChanges: ChangeType[] = [
      "GENERAL",
      "FUNCTION_SIGNATURE",
      "ROUTE_PATH",
      "DATABASE_SCHEMA",
      "RETURN_TYPE",
      "ENVIRONMENT_VARIABLE",
      "PUBLIC_API",
    ]
    assert.equal(validChanges.length, 7)
  })

  test("ImpactAnalysis full payload and blast radius integrity", () => {
    const sampleAnalysis: ImpactAnalysis = {
      id: "impact:src/services/auth.ts:GENERAL:2",
      target: {
        file: "src/services/auth.ts",
        symbol: "login",
        type: "function",
      },
      change_type: "FUNCTION_SIGNATURE",
      depth: 2,
      summary: "Modifying `login` may directly affect 2 files and transitively affect 3 files.",
      blast_radius: {
        directly_affected: 2,
        transitively_affected: 3,
        tests_affected: 1,
        routes_affected: 1,
        models_affected: 1,
        total_affected: 5,
      },
      risk_level: "MEDIUM",
      risk_score: 8.5,
      risk_factors: [
        "Directly affects 1 API route(s) (+2)",
        "2 confirmed direct dependent(s) (+2.0)",
      ],
      nodes: [
        {
          id: "node_src_services_auth_ts",
          file: "src/services/auth.ts",
          category: "service",
          architecture_layer: "Business Logic",
          impact_type: "TARGET",
          depth: 0,
          confidence: "CONFIRMED",
          evidence: "Impact target",
          path_from_target: ["src/services/auth.ts"],
        },
        {
          id: "node_src_components_Login_tsx",
          file: "src/components/Login.tsx",
          symbol: "login",
          category: "ui",
          architecture_layer: "Frontend",
          impact_type: "DIRECT",
          depth: 1,
          confidence: "CONFIRMED",
          evidence: "Direct call to login()",
          path_from_target: ["src/services/auth.ts", "src/components/Login.tsx"],
        },
      ],
      edges: [
        {
          id: "e1",
          source: "node_src_services_auth_ts",
          target: "node_src_components_Login_tsx",
          relationship: "imported_by",
          confidence: "CONFIRMED",
          evidence: "Direct import",
        },
      ],
      affected_tests: [{ file: "tests/auth.test.ts", confidence: "CONFIRMED", evidence: "Direct test import" }],
      affected_routes: [{ method: "POST", path: "/api/login", file: "src/routes/api.ts", confidence: "LIKELY", evidence: "Connected route" }],
      affected_models: [{ name: "User", framework: "TypeORM", file: "src/models/User.ts", confidence: "CONFIRMED", evidence: "Model reference" }],
      affected_features: ["Auth", "Login"],
      warnings: [],
      truncated: false,
    }

    assert.equal(sampleAnalysis.target.file, "src/services/auth.ts")
    assert.equal(sampleAnalysis.blast_radius.total_affected, 5)
    assert.equal(sampleAnalysis.risk_level, "MEDIUM")
    assert.equal(sampleAnalysis.nodes.length, 2)
    assert.equal(sampleAnalysis.nodes[1].path_from_target.length, 2)
    assert.equal(sampleAnalysis.affected_routes[0].path, "/api/login")
  })

  test("ImpactTrigger configuration validation", () => {
    const trigger: ImpactTrigger = {
      file: "src/routes/auth.ts",
      route: "/api/login",
      changeType: "ROUTE_PATH",
      depth: 3,
    }

    assert.equal(trigger.file, "src/routes/auth.ts")
    assert.equal(trigger.route, "/api/login")
    assert.equal(trigger.changeType, "ROUTE_PATH")
    assert.equal(trigger.depth, 3)
  })
})
