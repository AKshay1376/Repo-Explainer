import Prism from "prismjs"

export type HighlightPiece = { text: string; tokenType?: string }

export async function loadSourceGrammar(language: string): Promise<Prism.Grammar | null> {
  switch (language) {
    case "python": await import("prismjs/components/prism-python"); break
    case "jsx": await import("prismjs/components/prism-jsx"); break
    case "typescript": await import("prismjs/components/prism-typescript"); break
    case "tsx":
      await import("prismjs/components/prism-jsx")
      await import("prismjs/components/prism-typescript")
      await import("prismjs/components/prism-tsx")
      break
    case "json": await import("prismjs/components/prism-json"); break
    case "yaml": await import("prismjs/components/prism-yaml"); break
    case "shell": await import("prismjs/components/prism-bash"); break
    case "sql": await import("prismjs/components/prism-sql"); break
    case "markdown": await import("prismjs/components/prism-markdown"); break
  }
  const grammarName: Record<string, string> = {
    html: "markup", shell: "bash", yaml: "yaml", jsx: "jsx", tsx: "tsx", typescript: "typescript",
  }
  return Prism.languages[grammarName[language] || language] || null
}

export function sourceLines(content: string, grammar: Prism.Grammar | null): HighlightPiece[][] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\n$/, "")
  if (!grammar) return normalized.split("\n").map((text) => [{ text }])
  type Node = string | { type: string; content: Node | Node[]; alias?: string | string[] }
  const rows: HighlightPiece[][] = [[]]
  const append = (text: string, tokenType?: string) => {
    text.replace(/\r\n/g, "\n").split("\n").forEach((part, index) => {
      if (index) rows.push([])
      if (part) rows[rows.length - 1].push({ text: part, tokenType })
    })
  }
  const visit = (node: Node | Node[], tokenType?: string): void => {
    if (typeof node === "string") return append(node, tokenType)
    if (Array.isArray(node)) return node.forEach((child) => visit(child, tokenType))
    visit(node.content, node.type)
  }
  visit(Prism.tokenize(normalized, grammar) as Node[])
  return rows
}
