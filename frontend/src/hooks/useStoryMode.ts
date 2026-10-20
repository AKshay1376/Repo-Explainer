import { useCallback, useEffect, useState } from "react"
import type { StorySequence } from "../types/story"
import { nextStoryIndex, previousStoryIndex } from "../lib/storyPlayback"

export interface StoryModeState {
  active: boolean
  index: number
  playing: boolean
  follow: boolean
  presentation: boolean
  speed: number
  reducedMotion: boolean
  open: () => void
  close: () => void
  previous: () => void
  next: () => void
  restart: () => void
  togglePlay: () => void
  setFollow: (value: boolean) => void
  setPresentation: (value: boolean) => void
  setSpeed: (value: number) => void
}

export function useStoryMode(sequence: StorySequence | null, initial?: { step?: number | null; active?: boolean; presentation?: boolean },
  visible = true, navigationKey = "",
  onNavigate?: (state: { story: string | null; step: number | null; presentation: boolean }) => void): StoryModeState {
  const [active, setActive] = useState(!!initial?.active)
  const [index, setIndex] = useState(Math.max(0, (initial?.step || 1) - 1))
  const [playing, setPlaying] = useState(false)
  const [follow, setFollow] = useState(true)
  const [presentation, setPresentation] = useState(!!initial?.presentation)
  const [speed, setSpeed] = useState(2500)
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(media.matches)
    update(); media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  useEffect(() => { if (!visible) { setActive(false); setPlaying(false); setPresentation(false) } }, [visible])
  useEffect(() => { setPlaying(false); setIndex(Math.min(Math.max(0, (initial?.step || 1) - 1), Math.max(0, (sequence?.steps.length || 1) - 1))) }, [sequence?.id])
  useEffect(() => {
    if (!playing || !active || !sequence?.steps.length) return
    const timer = window.setTimeout(() => {
      setIndex(current => {
        if (current >= sequence.steps.length - 1) { setPlaying(false); return current }
        return nextStoryIndex(current, sequence.steps.length)
      })
    }, speed)
    return () => clearTimeout(timer)
  }, [playing, active, index, speed, sequence])
  useEffect(() => {
    if (!presentation) return
    const onKey = (event: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) return
      if (event.key === "Escape") { setPresentation(false); return }
      if (event.key === "ArrowRight") { event.preventDefault(); setIndex(current => nextStoryIndex(current, sequence?.steps.length || 0)) }
      if (event.key === "ArrowLeft") { event.preventDefault(); setIndex(previousStoryIndex) }
      if (event.code === "Space") { event.preventDefault(); setPlaying(value => !value) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [presentation, sequence?.steps.length])
  useEffect(() => {
    if (sequence) onNavigate?.({ story: active ? sequence.id : null, step: active ? index + 1 : null, presentation: active && presentation })
  }, [active, sequence?.id, index, presentation, navigationKey])
  const close = useCallback(() => { setActive(false); setPlaying(false); setPresentation(false) }, [])
  return {
    active, index, playing, follow, presentation, speed, reducedMotion,
    open: () => { if (sequence?.steps.length) { setActive(true); setIndex(0) } }, close,
    previous: () => setIndex(previousStoryIndex),
    next: () => setIndex(current => nextStoryIndex(current, sequence?.steps.length || 0)),
    restart: () => { setIndex(0); setPlaying(false) }, togglePlay: () => setPlaying(value => !value),
    setFollow, setPresentation, setSpeed,
  }
}
