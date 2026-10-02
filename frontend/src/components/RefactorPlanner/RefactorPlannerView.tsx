import React, { useEffect, useState } from "react"
import type { RepositoryModel } from "../../types/repository"
import type { SourceLocation } from "../../types/source"
import type { PatchTrigger } from "../../types/patch"
import { PLAN_TYPES, type PlanTrigger, type PlanType } from "../../types/refactor"
import { useRefactorPlanner } from "../../hooks/useRefactorPlanner"
import { PlanStepCard } from "./PlanStepCard"
import { PlanGraph } from "./PlanGraph"

interface Props {
  repoUrl: string
  model: RepositoryModel
  trigger?: PlanTrigger | null
  onOpenSource: (location: SourceLocation) => void
  onOpenImpact: (path: string) => void
  onOpenGraph: (path: string) => void
  onCreatePatch?: (trigger: PatchTrigger) => void
}

const label = (type: PlanType) => type.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

export const RefactorPlannerView: React.FC<Props> = ({ repoUrl, model, trigger, onOpenSource, onOpenImpact, onOpenGraph, onCreatePatch }) => {
  const [planType, setPlanType] = useState<PlanType>(trigger?.planType || "rename_symbol")
  const [target, setTarget] = useState(trigger?.target || "")
  const [symbol, setSymbol] = useState(String(trigger?.options?.symbol || ""))
  const [destination, setDestination] = useState(trigger?.destination || "")
  const [aiConsent, setAiConsent] = useState(false)
  const [plannedTrigger, setPlannedTrigger] = useState<PlanTrigger | null>(null)
  const { planResult, validationResult, explanation, loading, error, generate, validate, explain } = useRefactorPlanner(repoUrl, model)
  const requestPlan = (candidate: PlanTrigger) => { setPlannedTrigger(candidate); void generate(candidate) }
  useEffect(() => {
    if (trigger?.target) {
      setPlanType(trigger.planType); setTarget(trigger.planType === "rename_symbol" ? trigger.target.split("::")[0] : trigger.target)
      setSymbol(String(trigger.options?.symbol || (trigger.planType === "rename_symbol" ? trigger.target.split("::")[1] || "" : "")))
      setDestination(trigger.destination || "")
      const needsDestination = ["rename_symbol", "move_file", "move_module"].includes(trigger.planType)
      if ((!needsDestination || trigger.destination) &&
          (trigger.planType !== "rename_symbol" || trigger.options?.symbol)) requestPlan(trigger)
    }
  }, [trigger?.requestId])
  const current = (): PlanTrigger => ({ planType, target: planType === "rename_symbol" ? `${target}::${symbol}` : target,
    destination: destination.trim() || undefined,
    options: planType === "rename_symbol" ? { file: target, symbol } : (symbol ? { symbol } : {}) })
  const plan = planResult?.plan
  return <section className="space-y-5" aria-label="Refactoring and migration planner">
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-4">
      <div><h2 className="text-lg font-bold text-ink">Refactoring &amp; Migration Planner</h2>
        <p className="mt-1 text-xs text-ink-secondary">Evidence-grounded plans only. No repository code is changed or executed.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">Plan type
          <select value={planType} onChange={(event) => setPlanType(event.target.value as PlanType)} className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink">
            {PLAN_TYPES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">{planType.includes("dependency") ? "Package" : "Target file"}
          <input value={target} onChange={(event) => setTarget(event.target.value)} list="plan-paths" placeholder="src/service.py" className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink" />
          <datalist id="plan-paths">{Object.keys(model.files || {}).map((path) => <option key={path} value={path} />)}</datalist>
        </label>
        {(planType === "rename_symbol" || planType === "extract_function") && <label className="flex flex-col gap-1 text-xs text-ink-secondary">Symbol
          <input value={symbol} onChange={(event) => setSymbol(event.target.value)} list="plan-symbols" className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink" />
          <datalist id="plan-symbols">{model.symbols.filter((item) => item.file === target).map((item) => <option key={`${item.file}:${item.name}`} value={item.name} />)}</datalist>
        </label>}
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">Destination / version
          <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="new name, path, package or version" className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink" /></label>
      </div>
      <button disabled={loading || !target.trim() || (planType === "rename_symbol" && (!symbol.trim() || !destination.trim()))}
        onClick={() => requestPlan(current())} className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Generate plan</button>
      {loading && <p role="status" className="text-xs text-ink-secondary">Building plan…</p>}
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    </div>
    {plan && <>
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3">
        <h3 className="text-base font-semibold text-ink">{plan.summary}</h3>
        <p className="text-xs text-ink-secondary">{plan.risk_level} risk · {plan.confidence} confidence · {plan.estimated_scope.files} files · {plan.steps.length} ordered steps · revision {plan.revision.slice(0, 12)} · 0 LLM calls</p>
        {plan.risk_factors.map((item) => <p key={item} className="text-xs text-amber-700">Risk: {item}</p>)}
        {plan.warnings.map((item) => <p key={item} className="text-xs text-amber-700">{item}</p>)}
        {plan.manual_review_items.map((item) => <p key={item} className="text-xs text-ink-secondary">Manual review: {item}</p>)}
        {plan.cycles.length > 0 && <p className="text-xs text-rose-600">Dependency cycles: {plan.cycles.map((cycle) => cycle.join(" → ")).join("; ")}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="text-xs text-ink-secondary">Direct impact: {plan.impact.direct?.length || 0} · transitive: {plan.impact.transitive?.length || 0}. {plan.impact.summary}</p>
          <p className="text-xs text-ink-secondary">Affected tests: {plan.affected_tests.length} · routes: {plan.affected_routes.length} · models: {plan.affected_models.length}</p>
        </div>
        {plan.affected_routes.map((item, index) => <p key={`${item.method}:${item.path}:${index}`} className="text-xs text-ink-secondary">Route: {item.method} {item.path} · {item.file}</p>)}
        {plan.affected_models.map((item, index) => <p key={`${item.name}:${index}`} className="text-xs text-ink-secondary">Model: {item.name} · {item.file}</p>)}
        {plan.affected_tests.map((item, index) => <p key={`${item.file}:${index}`} className="text-xs text-ink-secondary">Test: {item.file}</p>)}
        {plan.execution_paths.map((flow, index) => <p key={`${flow.flow_id}:${index}`} className="text-xs text-ink-secondary">Execution path {flow.route}: {flow.steps.map((step) => step.file).join(" → ")}</p>)}
        {plan.proposed_partitions.map((part) => <p key={part.name} className="text-xs text-ink-secondary">Proposed {part.name} partition: {part.symbols.join(", ")}</p>)}
        {plan.partition_edges.map((edge, index) => <p key={`${edge.source}:${edge.target}:${index}`} className="text-xs text-ink-secondary">Partition edge {edge.source} → {edge.target}: {edge.evidence}</p>)}
        {plan.plan_type.includes("dependency") && <p className="text-xs text-ink-secondary">Package evidence: {plan.migration_evidence.manifests.length} manifests · {plan.migration_evidence.constraints.length} constraints · {plan.migration_evidence.import_sites.length} imports · {plan.migration_evidence.usage_sites.length} usage lines · {plan.migration_evidence.wrapper_sites.length} wrapper lines.</p>}
      </div>
      <PlanGraph steps={plan.steps} />
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3">
        <h3 className="text-sm font-semibold text-ink">Ordered plan steps</h3>
        {plan.steps.map((step) => <PlanStepCard key={step.id} step={step} onOpenSource={onOpenSource} onOpenImpact={onOpenImpact} onOpenGraph={onOpenGraph}
          onGeneratePatch={onCreatePatch && step.can_auto_preview && plan.plan_type === "rename_symbol" && step.id === "definition"
            ? (stepId) => onCreatePatch({ source: "planner", path: plan.target.split("::")[0], planTrigger: plannedTrigger || current(), stepId }) : undefined} />)}
      </div>
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3">
        <h3 className="text-sm font-semibold text-ink">Validation plan</h3>
        <p className="text-xs text-ink-secondary">This checklist never runs analyzed repository code.</p>
        {plan.validation.map((item) => <p key={item} className="text-xs text-ink-secondary">□ {item}</p>)}
        <button onClick={() => void validate(plannedTrigger || current())} className="text-xs font-semibold text-brand">Refresh validation checklist</button>
        {validationResult && <p className="text-xs text-ink-secondary">{validationResult.validation_state}: {validationResult.checks.length} checks; no code executed.</p>}
      </div>
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-card space-y-3">
        <h3 className="text-sm font-semibold text-ink">Optional AI explanation</h3>
        <p className="text-xs text-ink-secondary">Sends only the plan summary, risks, warnings, and steps after your explicit request. No source content is sent.</p>
        <label className="flex gap-2 text-xs text-ink-secondary"><input type="checkbox" checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} /> I explicitly request an AI explanation.</label>
        <button disabled={!aiConsent} onClick={() => { setAiConsent(false); void explain(plannedTrigger || current()) }} className="text-xs font-semibold text-brand disabled:opacity-40">Explain plan with AI</button>
        {explanation && <p className="whitespace-pre-wrap text-xs text-ink-secondary">{explanation.explanation}</p>}
      </div>
    </>}
  </section>
}
