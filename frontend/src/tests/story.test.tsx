import assert from "node:assert/strict"
import { test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { Edge, Node } from "@xyflow/react"
import type { RepositoryModel } from "../types/repository"
import type { ExecutionFlow } from "../types/trace"
import type { ImpactAnalysis } from "../types/impact"
import type { RefactorPlan } from "../types/refactor"
import type { StorySequence } from "../types/story"
import type { StoryModeState } from "../hooks/useStoryMode"
import { buildArchitectureStory, buildExecutionStory, buildImpactStory, buildRefactorStory, decorateStoryGraph, focusedRoute, safeStoryLink } from "../lib/storyBuilder"
import { buildLifecycle } from "../lib/lifecycle"
import { storyHtml, storyMarkdown } from "../lib/storyExport"
import { nextStoryIndex, previousStoryIndex, storyProgress } from "../lib/storyPlayback"
import { StoryController } from "../components/StoryMode/StoryController"
import { readWorkspaceLink, workspaceLink } from "../lib/workspaceNavigation"

const flow = {
  id: "flow-1", title: "GET /users", description: "Users route", trigger: "GET /users", is_primary: true,
  steps: [
    { id: "route", file: "src/routes.py", line: 4, label: "GET /users", type: "API_ROUTE", evidence: "route decorator", confidence: "HIGH" },
    { id: "service", file: "src/service.py", line: 9, label: "UserService", type: "SERVICE", evidence: "calls service", confidence: "HIGH" },
  ],
  edges: [{ id: "e", source_step: "route", target_step: "service", relationship: "calls", evidence: "direct call" }],
} as unknown as ExecutionFlow

const model = {
  metadata: { owner: "o", repo: "r" }, files: { "src/routes.py": {}, "src/service.py": {}, "src/model.py": {} },
  architecture_layers: { routes: ["src/routes.py"], services: ["src/service.py"], models: ["src/model.py"] },
  dependencies: [{ source: "src/routes.py", target: "src/service.py", type: "imports", evidence: "import" },
    { source: "src/service.py", target: "src/model.py", type: "imports", evidence: "import" }],
} as unknown as RepositoryModel

test("execution and architecture stories follow existing ordered graph evidence", () => {
  const execution = buildExecutionStory(flow)
  assert.equal(execution.id, "primary")
  assert.deepEqual(execution.steps.map(step => step.node_ids[0]), ["route", "service"])
  assert.deepEqual(execution.steps[1].edge_ids, ["e"])
  assert.deepEqual(execution.steps[0].source_links[0], { file: "src/routes.py", line: 4, symbol: null })
  const architecture = buildArchitectureStory(model)
  assert.deepEqual(architecture.steps.map(step => step.title), ["routes", "services", "models"])
  assert.ok(architecture.steps[1].edge_ids.length > 0)
})

test("impact groups and refactor prerequisites retain source graph ids", () => {
  const impact = buildImpactStory({ id: "impact-1", summary: "Blast", nodes: [
    { id: "target", file: "src/routes.py", impact_type: "TARGET", evidence: "changed" },
    { id: "direct", file: "src/service.py", impact_type: "DIRECT", evidence: "imports target" },
    { id: "test", file: "tests/test_users.py", impact_type: "TEST", evidence: "tests route" },
  ], edges: [{ id: "link", source: "target", target: "direct" }] } as unknown as ImpactAnalysis)
  assert.deepEqual(impact.steps.map(step => step.id), ["target", "direct", "test"])
  assert.ok(impact.steps[1].edge_ids.includes("link"))
  const refactor = buildRefactorStory({ id: "plan-1", summary: "Move service", steps: [
    { id: "second", order: 2, title: "Validate", prerequisites: ["first"], description: "Run checks", validation: ["unit tests"], source_locations: [], risk_level: "LOW" },
    { id: "first", order: 1, title: "Move", prerequisites: [], description: "Move file", validation: [], source_locations: [{ path: "src/service.py", line: 9 }], risk_level: "MEDIUM" },
  ] } as unknown as RefactorPlan)
  assert.deepEqual(refactor.steps.map(step => step.id), ["first", "second"])
  assert.deepEqual(refactor.steps[1].edge_ids, ["first-second"])
})

test("playback bounds, progress and graph roles remain deterministic", () => {
  assert.equal(previousStoryIndex(0), 0)
  assert.equal(nextStoryIndex(1, 2), 1)
  assert.equal(storyProgress(1, 2), "Step 2 of 2")
  const story = buildExecutionStory(flow)
  const nodes: Node[] = ["route", "service", "unrelated"].map(id => ({ id, position: { x: 0, y: 0 }, data: {} }))
  const edges: Edge[] = [{ id: "e", source: "route", target: "service" }]
  const first = decorateStoryGraph(nodes, edges, story, 0)
  assert.equal(first.nodes[0].style?.opacity, 1)
  assert.equal(first.nodes[1].style?.opacity, .28)
  assert.equal(first.nodes[2].style?.opacity, .14)
  const second = decorateStoryGraph(nodes, edges, story, 1)
  assert.equal(second.edges[0].style?.stroke, "#f97316")
  assert.equal(second.nodes[0].style?.opacity, .58)
})

test("focus follows directed edges for one, two and full hops", () => {
  const nodes: Node[] = ["a", "b", "c", "d"].map(id => ({ id, position: { x: 0, y: 0 }, data: {} }))
  const edges: Edge[] = [{ id: "ab", source: "a", target: "b" }, { id: "bc", source: "b", target: "c" }, { id: "cd", source: "c", target: "d" }]
  assert.deepEqual([...focusedRoute(nodes, edges, "b", "upstream", 1)!], ["b", "a"])
  assert.deepEqual([...focusedRoute(nodes, edges, "b", "downstream", 2)!], ["b", "c", "d"])
  assert.equal(focusedRoute(nodes, edges, "b", "both", "full")?.size, 4)
})

test("patch, validator, job, refactor and documentation lifecycle highlight observed states", () => {
  for (const [type, status] of [["patch", "validation_failed"], ["validator", "trusted_repo"], ["job", "running"],
    ["refactor", "planned"], ["documentation", "generating"]] as const) {
    const lifecycle = buildLifecycle(type, status)
    assert.equal(lifecycle.current, status)
    assert.equal(lifecycle.states.filter(state => state.current).length, 1)
    assert.ok(lifecycle.edges.length > 0)
  }
  assert.equal(buildLifecycle("patch", "unknown").current, null)
})

test("story controls render accessible narration and export actions", () => {
  const story = buildExecutionStory(flow)
  const noop = () => undefined
  const mode = { active: true, index: 1, playing: false, follow: true, presentation: true, speed: 2500, reducedMotion: true,
    open: noop, close: noop, previous: noop, next: noop, restart: noop, togglePlay: noop, setFollow: noop,
    setPresentation: noop, setSpeed: noop } as StoryModeState
  const html = renderToStaticMarkup(<StoryController sequence={story} mode={mode} launchLabel="Play Flow" onSource={noop} />)
  for (const label of ["Step 2 of 2", "Previous", "Play", "Next", "Restart", "Follow Story", "Exit presentation", "View Source", "Interactive HTML Story"]) assert.ok(html.includes(label), label)
  assert.ok(html.includes('aria-live="polite"'))
})

test("deep links restore bounded story steps without unsafe paths", () => {
  const location = readWorkspaceLink("?view=flow&story=primary&step=2&presentation=1&flow=flow-1&trace=GET%20%2Fusers", model, ["flow"], "flow")
  assert.equal(location.story, "primary")
  assert.equal(location.step, 2)
  assert.equal(location.presentation, true)
  assert.equal(location.trace, "GET /users")
  assert.match(workspaceLink(location, model), /story=primary&step=2&presentation=1/)
  assert.equal(readWorkspaceLink("?view=flow&story=..%2F.env&step=-3", model, ["flow"], "flow").story, null)
  assert.equal(readWorkspaceLink("?view=graph&story=impact-abc", model, ["graph"], "graph").story, null)
  assert.equal(readWorkspaceLink("?view=refactor&story=refactor-abc&planType=move_file&planTarget=src%2Froutes.py&planDestination=src%2Fapi.py", model, ["refactor"], "refactor").planTarget, "src/routes.py")
})

test("standalone HTML escapes repository text and excludes sensitive content", () => {
  const fakeToken = "ghp_" + "abcdefghijklmnop123456"
  const story: StorySequence = { ...buildExecutionStory(flow), title: "</script><img src=x onerror=alert(1)>", steps: [
    { ...buildExecutionStory(flow).steps[0], title: `token=${fakeToken}`, evidence: ["password=hunter2"],
      source_links: [{ file: ".env.production" }, { file: "config/secret.json" }, { file: "src/routes.py", line: 4 }] },
  ] }
  const html = storyHtml(story)
  assert.ok(!html.includes("</script><img"))
  assert.ok(!html.includes("hunter2"))
  assert.ok(!html.includes(fakeToken))
  assert.ok(!html.includes(".env.production"))
  assert.ok(!html.includes("secret.json"))
  assert.ok(html.includes("src/routes.py"))
  assert.ok(storyMarkdown(story).includes("```mermaid"))
  assert.equal(safeStoryLink("C:\\Users\\user\\.env"), null)
})
