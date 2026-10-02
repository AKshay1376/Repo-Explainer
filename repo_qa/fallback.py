"""
repo_qa/fallback.py
Deterministic Q&A engine for structural questions and offline/LLM-fallback scenarios.
Provides immediate, 100% verified answers using the normalized RepositoryModel without hallucinations.
"""

from typing import Dict, Any, List, Optional
from repo_qa.intents import QueryIntent, QueryIntentInfo
from repo_qa.evidence import EvidencePack


def generate_deterministic_qa_response(
    query: str,
    repo_model: Dict[str, Any],
    intent: QueryIntentInfo,
    evidence: EvidencePack
) -> Dict[str, Any]:
    """
    Generate a grounded, deterministic answer directly from RepositoryModel evidence.
    Guarantees zero hallucinations and works reliably even if LLM is unavailable.
    """
    files_map = repo_model.get("files", {}) or {}
    all_routes = repo_model.get("api_routes", []) or []
    all_models = repo_model.get("database_models", []) or []
    all_entrypoints = repo_model.get("entry_points", []) or []
    all_tech = repo_model.get("technologies", []) or []
    layers = repo_model.get("architecture_layers", {}) or {}

    citations: List[Dict[str, Any]] = []
    related_files: List[str] = []
    evidence_summary: List[str] = []
    lines: List[str] = []

    # 1. Reverse Dependency Question: "What files depend on X?"
    if intent.intent == QueryIntent.REVERSE_DEPENDENCY and intent.target_files:
        target = intent.target_files[0]
        file_info = files_map.get(target, {})
        dependents = file_info.get("dependents", [])

        lines.append(f"### Reverse Dependencies for `{target}`")
        lines.append("")
        if dependents:
            lines.append(f"**FACT:** Exactly **{len(dependents)}** file(s) in the repository import or depend on `{target}`:")
            lines.append("")
            for dep in dependents:
                lines.append(f"- [`{dep}`](file://{dep})")
                citations.append({"file": dep})
                related_files.append(dep)
            evidence_summary.append(f"Identified {len(dependents)} reverse dependent(s) from AST/import analysis.")
        else:
            lines.append(f"**FACT:** No files in the analyzed repository import `{target}`.")
            lines.append("This file is either a top-level entry point, an isolated script, or a standalone component.")
            evidence_summary.append("0 reverse dependents detected.")

        citations.append({"file": target})
        related_files.append(target)

        return {
            "answer": "\n".join(lines),
            "citations": citations,
            "related_files": list(dict.fromkeys(related_files)),
            "confidence": "high",
            "evidence_summary": evidence_summary,
            "intent": intent.intent,
            "insufficient_evidence": False,
        }

    # 2. Forward Dependency Question: "What does X import?"
    if intent.intent == QueryIntent.DEPENDENCY and intent.target_files:
        target = intent.target_files[0]
        file_info = files_map.get(target, {})
        deps = file_info.get("dependencies", [])
        raw_imports = file_info.get("imports", [])

        lines.append(f"### Dependencies of `{target}`")
        lines.append("")
        if deps:
            lines.append(f"**FACT:** `{target}` directly imports **{len(deps)}** internal repository file(s):")
            lines.append("")
            for dep in deps:
                lines.append(f"- [`{dep}`](file://{dep})")
                citations.append({"file": dep})
                related_files.append(dep)
            evidence_summary.append(f"Resolved {len(deps)} internal dependency edge(s).")
        else:
            lines.append(f"`{target}` does not import any internal repository files.")

        if raw_imports:
            external = [imp for imp in raw_imports if imp not in deps]
            if external:
                lines.append("")
                lines.append(f"**External package imports ({len(external)}):**")
                lines.append(f"`{', '.join(external[:15])}`")

        citations.append({"file": target})
        related_files.append(target)

        return {
            "answer": "\n".join(lines),
            "citations": citations,
            "related_files": list(dict.fromkeys(related_files)),
            "confidence": "high",
            "evidence_summary": evidence_summary,
            "intent": intent.intent,
            "insufficient_evidence": False,
        }

    # 3. API Routes Question
    if intent.intent == QueryIntent.API_ROUTE:
        lines.append("### Verified API Endpoints & Routes")
        lines.append("")
        if all_routes:
            lines.append(f"**FACT:** Discovered **{len(all_routes)}** API endpoint(s) across the repository:")
            lines.append("")
            lines.append("| Method | Path | Handler | File |")
            lines.append("| :--- | :--- | :--- | :--- |")
            for r in all_routes:
                fpath = r.get("file", "")
                method = r.get("method", "GET")
                path = r.get("path", "/")
                handler = r.get("handler") or "inline"
                lines.append(f"| `{method}` | `{path}` | `{handler}` | [`{fpath}`](file://{fpath}) |")
                citations.append({"file": fpath})
                related_files.append(fpath)
            evidence_summary.append(f"Discovered {len(all_routes)} route(s) via web framework AST inspection.")
        else:
            lines.append("**FACT:** No HTTP API routes (Express, Flask, FastAPI, Django, Next.js) were detected in the analyzed files.")
            evidence_summary.append("No API route patterns found.")

        return {
            "answer": "\n".join(lines),
            "citations": citations,
            "related_files": list(dict.fromkeys(related_files)),
            "confidence": "high",
            "evidence_summary": evidence_summary,
            "intent": intent.intent,
            "insufficient_evidence": False,
        }

    # 4. Database Models Question
    if intent.intent == QueryIntent.DATABASE:
        lines.append("### Verified Database Models & Schemas")
        lines.append("")
        if all_models:
            lines.append(f"**FACT:** Discovered **{len(all_models)}** database model(s):")
            lines.append("")
            for m in all_models:
                mname = m.get("name", "Unknown")
                mfile = m.get("file", "")
                fw = m.get("framework", "ORM")
                fields = m.get("fields", [])
                field_names = [f.get("name") for f in fields if isinstance(f, dict)]
                field_text = f" (fields: `{', '.join(field_names[:8])}`)" if field_names else ""
                lines.append(f"- **`{mname}`** ({fw}) defined in [`{mfile}`](file://{mfile}){field_text}")
                citations.append({"file": mfile})
                related_files.append(mfile)
            evidence_summary.append(f"Found {len(all_models)} database model(s).")
        else:
            lines.append("**FACT:** No ORM or database model definitions (SQLAlchemy, Prisma, Mongoose, Django) were detected in the analyzed files.")
            evidence_summary.append("No database model definitions detected.")

        return {
            "answer": "\n".join(lines),
            "citations": citations,
            "related_files": list(dict.fromkeys(related_files)),
            "confidence": "high",
            "evidence_summary": evidence_summary,
            "intent": intent.intent,
            "insufficient_evidence": False,
        }

    # 5. Entry Points Question
    if intent.intent == QueryIntent.ENTRY_POINT:
        lines.append("### Application Entry Points & Execution Roots")
        lines.append("")
        if all_entrypoints:
            lines.append(f"**FACT:** Identified **{len(all_entrypoints)}** runnable entry point(s):")
            lines.append("")
            for ep in all_entrypoints:
                ep_path = ep.get("path", "")
                ep_type = ep.get("type", "entrypoint")
                evidence_text = f" — *{ep.get('evidence')}*" if ep.get("evidence") else ""
                lines.append(f"- [`{ep_path}`](file://{ep_path}) `[{ep_type}]`{evidence_text}")
                citations.append({"file": ep_path})
                related_files.append(ep_path)
            evidence_summary.append(f"Identified {len(all_entrypoints)} entrypoint(s).")
        else:
            lines.append("No canonical startup entry points (main.py, index.ts, server.js) were uniquely identified.")
            evidence_summary.append("0 entrypoints found.")

        return {
            "answer": "\n".join(lines),
            "citations": citations,
            "related_files": list(dict.fromkeys(related_files)),
            "confidence": "high",
            "evidence_summary": evidence_summary,
            "intent": intent.intent,
            "insufficient_evidence": False,
        }

    # 6. Tech Stack Question
    if intent.intent == QueryIntent.TECH_STACK:
        lines.append(f"### Detected Technology Stack for {evidence.repo_name}")
        lines.append("")
        lines.append(f"- **Primary Language:** `{evidence.primary_language}`")
        if all_tech:
            lines.append("")
            lines.append("**Detected Technologies & Frameworks:**")
            for t in all_tech:
                cat = t.get("category", "tooling")
                ev = t.get("evidence", "")
                lines.append(f"- **{t.get('name')}** `({cat})` — {ev}")
            evidence_summary.append(f"Identified {len(all_tech)} framework(s) and tooling dependencies.")
        return {
            "answer": "\n".join(lines),
            "citations": citations,
            "related_files": list(dict.fromkeys(related_files)),
            "confidence": "high",
            "evidence_summary": evidence_summary,
            "intent": intent.intent,
            "insufficient_evidence": False,
        }

    # 7. File Inquiry or General Architectural Fallback
    if intent.target_files:
        target = intent.target_files[0]
        fm = files_map.get(target, {})
        lines.append(f"### Analysis of [`{target}`](file://{target})")
        lines.append("")
        lines.append(f"- **Category:** `{fm.get('category', 'unknown')}` (confidence: {fm.get('confidence', 1.0)})")
        if fm.get("purpose"):
            lines.append(f"- **Purpose:** {fm.get('purpose')}")
        if fm.get("classes"):
            lines.append(f"- **Classes:** `{', '.join(fm.get('classes', []))}`")
        if fm.get("functions"):
            lines.append(f"- **Functions:** `{', '.join(fm.get('functions', []))}`")
        if fm.get("dependencies"):
            deps = fm.get("dependencies", [])
            lines.append(f"- **Internal Dependencies ({len(deps)}):** `{', '.join(deps[:6])}`")
        if fm.get("dependents"):
            revs = fm.get("dependents", [])
            lines.append(f"- **Depended on by ({len(revs)}):** `{', '.join(revs[:6])}`")

        citations.append({"file": target})
        related_files.append(target)
        evidence_summary.append(f"Extracted structural file model for {target}.")
    else:
        # High-level architecture summary
        lines.append(f"### Repository Architecture Overview ({evidence.repo_name})")
        lines.append("")
        lines.append(f"**Primary Language:** `{evidence.primary_language}`")
        if evidence.tech_stack:
            lines.append(f"**Tech Stack:** {', '.join(evidence.tech_stack)}")
        lines.append("")
        if layers:
            lines.append("**Architecture Layers:**")
            for l_name, l_files in layers.items():
                lines.append(f"- **{l_name.capitalize()} Layer** ({len(l_files)} file(s)):")
                for lf in l_files[:4]:
                    lines.append(f"  - [`{lf}`](file://{lf})")
                    citations.append({"file": lf})
                    related_files.append(lf)
            evidence_summary.append(f"Mapped {len(layers)} architectural layer(s).")

    return {
        "answer": "\n".join(lines),
        "citations": citations,
        "related_files": list(dict.fromkeys(related_files)),
        "confidence": "medium",
        "evidence_summary": evidence_summary,
        "intent": intent.intent,
        "insufficient_evidence": False,
    }
