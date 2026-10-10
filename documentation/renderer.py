"""Escaped Markdown and self-contained script-free HTML export."""

import html
from urllib.parse import quote


def _reference(item):
    line = item.get("start_line")
    return f"{item['file']}:{line}" if line else item["file"]


def markdown(document):
    lines = [f"# {document['title']}", "", f"Revision: `{document['repo_revision']}`", "",
             "## Contents", ""]
    for part in document["sections"]:
        lines.append(f"- [{part['title']}](#{part['id']})")
    for part in document["sections"]:
        lines += ["", f"## {part['title']}", ""]
        for label, key in (("FACT", "facts"), ("INFERENCE", "inferences"), ("UNKNOWN", "unknowns")):
            lines += [f"- **{label}:** {value}" for value in part[key]]
        if part.get("diagram"):
            lines += ["", "```mermaid", part["diagram"], "```"]
        if part["citations"]:
            lines += ["", "Sources:"] + [f"- `{_reference(ref)}`" for ref in part["citations"]]
    if document["warnings"]:
        lines += ["", "## Limits", ""] + [f"- {warning}" for warning in document["warnings"]]
    return "\n".join(lines) + "\n"


def _source_url(document, reference):
    metadata = document.get("repository") or {}
    owner, repo, revision = metadata.get("owner"), metadata.get("repo"), document.get("repo_revision")
    if not owner or not repo or not revision or revision == "unknown":
        return None
    path = quote(reference["file"], safe="/")
    suffix = f"#L{reference['start_line']}" if reference.get("start_line") else ""
    return f"https://github.com/{quote(owner)}/{quote(repo)}/blob/{quote(revision)}/{path}{suffix}"


def html_document(document):
    esc = html.escape
    items = []
    for part in document["sections"]:
        items.append(f'<section id="{esc(part["id"], quote=True)}"><h2>{esc(part["title"])}</h2>')
        for label, key in (("FACT", "facts"), ("INFERENCE", "inferences"), ("UNKNOWN", "unknowns")):
            for value in part[key]:
                items.append(f'<p><strong>{label}</strong> {esc(value)}</p>')
        if part.get("diagram"):
            items.append(f'<pre aria-label="Mermaid diagram source">{esc(part["diagram"])}</pre>')
        if part["citations"]:
            items.append("<h3>Sources</h3><ul>")
            for ref in part["citations"]:
                url = _source_url(document, ref)
                label = esc(_reference(ref))
                items.append(f'<li><a href="{esc(url, quote=True)}" rel="noopener noreferrer">{label}</a></li>' if url else f"<li>{label}</li>")
            items.append("</ul>")
        items.append("</section>")
    toc = "".join(f'<li><a href="#{esc(part["id"], quote=True)}">{esc(part["title"])}</a></li>' for part in document["sections"])
    css = "body{font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:auto;padding:2rem;color:#17202a}section{padding:1rem 0;border-top:1px solid #ddd}pre{overflow:auto;padding:1rem;background:#f4f4f4}a{color:#174c92}@media(max-width:600px){body{padding:1rem}}"
    return ("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" "
            f'content="width=device-width,initial-scale=1"><title>{esc(document["title"])}</title><style>{css}</style></head><body>'
            f'<h1>{esc(document["title"])}</h1><p>Revision: {esc(document["repo_revision"])}</p><nav aria-label="Contents"><h2>Contents</h2><ul>{toc}</ul></nav>'
            + "".join(items) + "</body></html>")
