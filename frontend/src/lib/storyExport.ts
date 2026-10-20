import type { StorySequence } from "../types/story"
import { safeStoryLink } from "./storyBuilder"

const redact = (value: string) => value
  .replace(/(?:sk-|ghp_|github_pat_|AKIA)[A-Za-z0-9_\-]{12,}/g, "[redacted]")
  .replace(/(?:password|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "[redacted credential]")
  .replace(/([?&](?:token|key|secret|password)=)[^\s&]+/gi, "$1[redacted]")
  .replace(/(?:\.env(?:\.[\w.-]+)?|[\w.-]*(?:credential|secret|token|private[_-]?key)[\w.-]*)/gi, "[protected]")
  .slice(0, 1000)

export function exportableStory(story: StorySequence): StorySequence {
  return {
    ...story, id: story.source_type, title: redact(story.title), description: redact(story.description),
    steps: story.steps.map((step, index) => ({ ...step, id: `step-${index + 1}`, title: redact(step.title), description: redact(step.description),
      node_ids: [`node-${index + 1}`], edge_ids: index ? [`edge-${index}`] : [], evidence: [],
      source_links: step.source_links.map(link => safeStoryLink(link.file, link.line, link.symbol)).filter((link): link is NonNullable<typeof link> => !!link),
    })),
  }
}

export function storyMarkdown(story: StorySequence): string {
  const safe = exportableStory(story)
  const markdownText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\r\n]+/g, " ")
  const lines = [`# ${markdownText(safe.title)}`, "", markdownText(safe.description), "", "```mermaid", "flowchart LR"]
  safe.steps.forEach((step, index) => lines.push(`  s${index}["${step.title.replace(/[^\p{L}\p{N} .,._:/()-]/gu, " ").replace(/\s+/g, " ")}"]`))
  safe.steps.slice(1).forEach((_, index) => lines.push(`  s${index} --> s${index + 1}`))
  lines.push("```", "")
  safe.steps.forEach(step => {
    lines.push(`## ${step.order}. ${markdownText(step.title)}`, "", markdownText(step.description), "")
    step.source_links.forEach(link => lines.push(`- Source: ${link.file}${link.line ? `:${link.line}` : ""}`))
    lines.push("")
  })
  return lines.join("\n")
}

export function storyHtml(story: StorySequence): string {
  // JSON is data, never evaluated as code; '<' escaping prevents a script element breakout.
  const payload = JSON.stringify(exportableStory(story)).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Interactive story</title><style>body{font:16px system-ui;margin:0;background:#f8fafc;color:#172033}main{max-width:850px;margin:auto;padding:24px}button{padding:9px 14px;margin:3px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:inherit;cursor:pointer}.current{background:#ffedd5;border-color:#f97316}.previous{opacity:.6}.future{opacity:.3}li{margin:8px 0;padding:10px;border:1px solid #cbd5e1;border-radius:8px}nav{margin:20px 0}pre{white-space:pre-wrap}</style></head><body><main><h1 id="title"></h1><p id="description"></p><nav><button id="previous">Previous</button><button id="next">Next</button></nav><p id="progress" role="status" aria-live="polite"></p><ol id="steps"></ol><h2 id="step-title"></h2><p id="step-description"></p><pre id="source"></pre></main><script type="application/json" id="story-data">${payload}</script><script>const story=JSON.parse(document.getElementById('story-data').textContent);let index=0;const byId=id=>document.getElementById(id);byId('title').textContent=story.title;byId('description').textContent=story.description;function render(){const step=story.steps[index];byId('progress').textContent='Step '+(index+1)+' of '+story.steps.length;byId('step-title').textContent=step.title;byId('step-description').textContent=step.description;byId('source').textContent=step.source_links.map(link=>link.file+(link.line?':'+link.line:'')).join('\\n');const list=byId('steps');list.replaceChildren();story.steps.forEach((item,i)=>{const node=document.createElement('li');node.className=i===index?'current':i<index?'previous':'future';node.textContent=item.title;list.append(node)});byId('previous').disabled=index===0;byId('next').disabled=index===story.steps.length-1}byId('previous').onclick=()=>{index=Math.max(0,index-1);render()};byId('next').onclick=()=>{index=Math.min(story.steps.length-1,index+1);render()};if(story.steps.length)render();</script></body></html>`
}

export function downloadStory(story: StorySequence, format: "markdown" | "html") {
  const content = format === "html" ? storyHtml(story) : storyMarkdown(story)
  const blob = new Blob([content], { type: format === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url; anchor.download = `repo-story-${story.source_type}.${format === "html" ? "html" : "md"}`
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
