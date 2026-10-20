import React from "react"
import type { StorySequence, StorySourceLink } from "../../types/story"
import type { StoryModeState } from "../../hooks/useStoryMode"
import { downloadStory } from "../../lib/storyExport"

interface Props {
  sequence: StorySequence | null
  mode: StoryModeState
  launchLabel: string
  onSource?: (link: StorySourceLink) => void
  onAsk?: (stepTitle: string, link?: StorySourceLink) => void
  onDocument?: () => void
}

export const StoryController: React.FC<Props> = ({ sequence, mode, launchLabel, onSource, onAsk, onDocument }) => {
  if (!sequence?.steps.length) return null
  const step = sequence.steps[mode.index] || sequence.steps[0]
  if (!mode.active) return <button type="button" onClick={mode.open} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">{launchLabel}</button>
  const link = step.source_links[0]
  return <section aria-label="Story mode" className="rounded-xl border border-brand-border bg-surface p-3 text-ink shadow-card space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <strong className="mr-auto text-sm">{sequence.title}</strong>
      <button type="button" onClick={mode.close} className="text-xs font-semibold text-brand">Exit story</button>
      <button type="button" onClick={() => mode.setPresentation(!mode.presentation)} className="text-xs font-semibold text-brand">{mode.presentation ? "Exit presentation" : "Presentation Mode"}</button>
    </div>
    <div role="status" aria-live="polite" className="text-sm font-semibold">Step {mode.index + 1} of {sequence.steps.length}: {step.title}</div>
    <p className="text-xs text-ink-secondary">{step.description}</p>
    {!!step.evidence.length && <details className="text-xs text-ink-secondary"><summary className="cursor-pointer">Evidence</summary><ul>{step.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <button type="button" onClick={mode.previous} disabled={mode.index === 0} className="rounded border border-line px-2 py-1 disabled:opacity-40">Previous</button>
      <button type="button" onClick={mode.togglePlay} className="rounded border border-line px-2 py-1">{mode.playing ? "Pause" : "Play"}</button>
      <button type="button" onClick={mode.next} disabled={mode.index >= sequence.steps.length - 1} className="rounded border border-line px-2 py-1 disabled:opacity-40">Next</button>
      <button type="button" onClick={mode.restart} className="rounded border border-line px-2 py-1">Restart</button>
      <label className="ml-1"><input type="checkbox" checked={mode.follow} onChange={event => mode.setFollow(event.target.checked)} /> Follow Story</label>
      <label className="ml-1">Speed <select aria-label="Story speed" value={mode.speed} onChange={event => mode.setSpeed(Number(event.target.value))} className="rounded border border-line bg-surface px-1 py-1"><option value={4000}>Slow</option><option value={2500}>Normal</option><option value={1200}>Fast</option></select></label>
    </div>
    <div className="flex flex-wrap gap-3 text-xs text-brand">
      {link && onSource && <button type="button" onClick={() => onSource(link)}>View Source{link.line ? `:${link.line}` : ""}</button>}
      {onAsk && (link || sequence.source_type === "execution" || sequence.source_type === "impact") &&
        <button type="button" onClick={() => onAsk(step.title, link)}>Ask About This Step</button>}
      {onDocument && <button type="button" onClick={onDocument}>Generate Documentation</button>}
      <button type="button" onClick={() => downloadStory(sequence, "markdown")}>Export Story .md</button>
      <button type="button" onClick={() => downloadStory(sequence, "html")}>Interactive HTML Story</button>
    </div>
  </section>
}
