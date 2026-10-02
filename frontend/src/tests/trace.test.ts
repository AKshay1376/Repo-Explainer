/**
 * frontend/src/tests/trace.test.ts
 * Unit tests for Phase 7 Execution Path Tracing.
 */

import { test, describe } from "node:test"
import assert from "node:assert/strict"
import type { Node, Edge } from "@xyflow/react"
import { applyStepFlowLayout, STEP_NODE_WIDTH, STEP_NODE_HEIGHT } from "../lib/graphLayout"
import type {
  ExecutionFlow,
  ExecutionStep,
  ExecutionEdge,
  StepType,
  ConfidenceLevel,
  TraceTrigger,
} from "../types/trace"
import type { RepositoryModel } from "../types/repository"

describe("Execution Path Tracing Layout", () => {
  test("applyStepFlowLayout returns empty arrays for empty nodes", () => {
    const res = applyStepFlowLayout([], [])
    assert.deepEqual(res.nodes, [])
    assert.deepEqual(res.edges, [])
  })

  test("applyStepFlowLayout positions nodes sequentially in TB (top-to-bottom) mode", () => {
    const mockNodes: Node[] = [
      { id: "step-1", position: { x: 0, y: 0 }, data: { label: "UI Button" } },
      { id: "step-2", position: { x: 0, y: 0 }, data: { label: "POST /login" } },
      { id: "step-3", position: { x: 0, y: 0 }, data: { label: "authController.login" } },
      { id: "step-4", position: { x: 0, y: 0 }, data: { label: "User.find" } },
    ]

    const mockEdges: Edge[] = [
      { id: "e1-2", source: "step-1", target: "step-2" },
      { id: "e2-3", source: "step-2", target: "step-3" },
      { id: "e3-4", source: "step-3", target: "step-4" },
    ]

    const { nodes } = applyStepFlowLayout(mockNodes, mockEdges, "TB")

    assert.equal(nodes.length, 4)
    // In TB mode, Y coordinate should strictly increase for each successive step in the chain
    assert.ok(nodes[0].position.y < nodes[1].position.y)
    assert.ok(nodes[1].position.y < nodes[2].position.y)
    assert.ok(nodes[2].position.y < nodes[3].position.y)

    // Verify handle positions
    nodes.forEach((n) => {
      assert.equal(n.targetPosition, "top")
      assert.equal(n.sourcePosition, "bottom")
    })
  })

  test("applyStepFlowLayout positions nodes sequentially in LR (left-to-right) mode", () => {
    const mockNodes: Node[] = [
      { id: "step-1", position: { x: 0, y: 0 }, data: { label: "UI Button" } },
      { id: "step-2", position: { x: 0, y: 0 }, data: { label: "POST /login" } },
      { id: "step-3", position: { x: 0, y: 0 }, data: { label: "authController.login" } },
    ]

    const mockEdges: Edge[] = [
      { id: "e1-2", source: "step-1", target: "step-2" },
      { id: "e2-3", source: "step-2", target: "step-3" },
    ]

    const { nodes } = applyStepFlowLayout(mockNodes, mockEdges, "LR")

    assert.equal(nodes.length, 3)
    // In LR mode, X coordinate should strictly increase for each successive step
    assert.ok(nodes[0].position.x < nodes[1].position.x)
    assert.ok(nodes[1].position.x < nodes[2].position.x)

    // Verify handle positions
    nodes.forEach((n) => {
      assert.equal(n.targetPosition, "left")
      assert.equal(n.sourcePosition, "right")
    })
  })
})

describe("Execution Flow Data Models & Classification", () => {
  test("all 13 step types are properly recognized", () => {
    const validStepTypes: StepType[] = [
      "UI_COMPONENT",
      "EVENT_HANDLER",
      "CLIENT_SERVICE",
      "API_CLIENT",
      "API_ROUTE",
      "MIDDLEWARE",
      "CONTROLLER",
      "SERVICE",
      "MODEL",
      "DATABASE",
      "UTILITY",
      "ENTRY_POINT",
      "UNKNOWN",
    ]

    validStepTypes.forEach((t) => {
      const step: ExecutionStep = {
        id: `step-${t}`,
        type: t,
        label: `Step ${t}`,
        file: `src/${t}.ts`,
        architecture_layer: "Presentation",
        evidence: `Evidence for ${t}`,
        confidence: "HIGH",
        is_inferred: false,
      }
      assert.equal(step.type, t)
      assert.equal(step.is_inferred, false)
    })
  })

  test("confidence levels and fact vs inferred flags operate correctly", () => {
    const confidenceLevels: ConfidenceLevel[] = ["HIGH", "MEDIUM", "LOW"]

    confidenceLevels.forEach((conf) => {
      const edge: ExecutionEdge = {
        id: `edge-${conf}`,
        source_step: "step-1",
        target_step: "step-2",
        relationship: "calls",
        confidence: conf,
        evidence: `Direct call with ${conf} confidence`,
      }
      assert.equal(edge.confidence, conf)
    })
  })

  test("ExecutionFlow full path integrity", () => {
    const mockFlow: ExecutionFlow = {
      id: "flow-login",
      title: "User Login Authentication Flow",
      description: "Traces from LoginForm to database user verification",
      trigger: "LoginForm.handleSubmit",
      is_primary: true,
      confidence: "HIGH",
      warnings: [],
      cycle_detected: false,
      flow_category: "auth",
      steps: [
        {
          id: "step-1",
          type: "UI_COMPONENT",
          label: "LoginForm.handleSubmit",
          file: "src/components/LoginForm.tsx",
          symbol: "handleSubmit",
          architecture_layer: "Presentation",
          line: 42,
          is_inferred: false,
          evidence: "User submits login form",
          confidence: "HIGH",
        },
        {
          id: "step-2",
          type: "API_ROUTE",
          label: "POST /api/auth/login",
          file: "src/server/authRoutes.ts",
          symbol: "loginRoute",
          architecture_layer: "API / Routing",
          line: 15,
          is_inferred: false,
          evidence: "Registered route handler",
          confidence: "HIGH",
        },
        {
          id: "step-3",
          type: "MODEL",
          label: "UserModel.findOne",
          file: "src/server/models/User.ts",
          symbol: "findOne",
          architecture_layer: "Data Access",
          line: 78,
          is_inferred: false,
          evidence: "Mongoose database lookup",
          confidence: "HIGH",
        },
      ],
      edges: [
        {
          id: "e1-2",
          source_step: "step-1",
          target_step: "step-2",
          relationship: "HTTP Request",
          confidence: "HIGH",
          evidence: "Calls POST /api/auth/login",
        },
        {
          id: "e2-3",
          source_step: "step-2",
          target_step: "step-3",
          relationship: "queries",
          confidence: "HIGH",
          evidence: "Invokes UserModel.findOne",
        },
      ],
    }

    assert.equal(mockFlow.steps.length, 3)
    assert.equal(mockFlow.edges.length, 2)
    assert.equal(mockFlow.confidence, "HIGH")
    assert.equal(mockFlow.steps[0].type, "UI_COMPONENT")
    assert.equal(mockFlow.steps[2].type, "MODEL")
    assert.equal(mockFlow.edges[0].relationship, "HTTP Request")
  })

  test("Trace triggers structure validation", () => {
    const routeTrigger: TraceTrigger = {
      route: "POST /api/login",
    }
    assert.equal(routeTrigger.route, "POST /api/login")

    const fileTrigger: TraceTrigger = {
      startFile: "src/controllers/userController.ts",
      startSymbol: "getUser",
    }
    assert.equal(fileTrigger.startFile, "src/controllers/userController.ts")
    assert.equal(fileTrigger.startSymbol, "getUser")

    const queryTrigger: TraceTrigger = {
      query: "authentication flow",
    }
    assert.equal(queryTrigger.query, "authentication flow")
  })
})