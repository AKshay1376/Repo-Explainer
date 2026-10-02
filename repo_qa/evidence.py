"""
repo_qa/evidence.py
Generates normalized, structured Evidence Packs from RepositoryModel and source excerpts.
Ensures answers are grounded in concrete repository facts.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from repo_qa.intents import QueryIntent, QueryIntentInfo
from repo_qa.retrieval import RankedCandidate


@dataclass
class EvidencePack:
    repo_name: str
    description: str
    primary_language: str
    tech_stack: List[str]
    intent: str
    scoped_file: Optional[str] = None
    scoped_edge: Optional[Dict[str, str]] = None
    candidate_files: List[Dict[str, Any]] = field(default_factory=list)
    relevant_routes: List[Dict[str, Any]] = field(default_factory=list)
    relevant_models: List[Dict[str, Any]] = field(default_factory=list)
    relevant_edges: List[Dict[str, Any]] = field(default_factory=list)
    source_excerpts: Dict[str, str] = field(default_factory=dict)
    verified_facts: List[str] = field(default_factory=list)

    def to_context_string(self) -> str:
        """Render the evidence pack into an evidence block for the LLM."""
        lines = []
        lines.append(f"=== REPOSITORY: {self.repo_name} ===")
        if self.description:
            lines.append(f"Description: {self.description}")
        lines.append(f"Primary Language: {self.primary_language}")
        if self.tech_stack:
            lines.append(f"Detected Stack: {', '.join(self.tech_stack)}")
        if self.scoped_file:
            lines.append(f"Developer Scoped File: {self.scoped_file}")
        if self.scoped_edge:
            lines.append(f"Developer Scoped Edge: {self.scoped_edge.get('source')} -> {self.scoped_edge.get('target')} ({self.scoped_edge.get('type')})")
        lines.append("")

        # 1. Verified Facts
        if self.verified_facts:
            lines.append("=== VERIFIED STRUCTURAL FACTS ===")
            for fact in self.verified_facts:
                lines.append(f"- {fact}")
            lines.append("")

        # 2. Key Candidate Files
        if self.candidate_files:
            lines.append("=== RELEVANT CODEBASE FILES ===")
            for c in self.candidate_files:
                p = c["path"]
                lines.append(f"File: `{p}`")
                lines.append(f"  Category: {c.get('category', 'unknown')} | Confidence: {c.get('confidence', 1.0)}")
                if c.get("purpose"):
                    lines.append(f"  Purpose: {c.get('purpose')}")
                if c.get("classes"):
                    lines.append(f"  Classes: {', '.join(c['classes'][:6])}")
                if c.get("functions"):
                    lines.append(f"  Functions: {', '.join(c['functions'][:8])}")
                if c.get("dependencies"):
                    lines.append(f"  Direct Imports: {', '.join(c['dependencies'][:8])}")
                if c.get("dependents"):
                    lines.append(f"  Depended On By: {', '.join(c['dependents'][:8])}")
                if c.get("match_reasons"):
                    lines.append(f"  Relevance: {'; '.join(c['match_reasons'])}")
                lines.append("")

        # 3. Relevant API Routes
        if self.relevant_routes:
            lines.append("=== VERIFIED API ROUTES ===")
            for r in self.relevant_routes[:12]:
                lines.append(f"- {r.get('method')} {r.get('path')} in `{r.get('file')}` (handler: {r.get('handler') or 'N/A'})")
            lines.append("")

        # 4. Relevant Database Models
        if self.relevant_models:
            lines.append("=== VERIFIED DATABASE MODELS ===")
            for m in self.relevant_models[:8]:
                field_names = [f.get("name") for f in m.get("fields", []) if isinstance(f, dict)]
                fields_str = f" [fields: {', '.join(field_names[:5])}]" if field_names else ""
                lines.append(f"- Model `{m.get('name')}` in `{m.get('file')}` ({m.get('framework')}){fields_str}")
            lines.append("")

        # 5. Verified Dependency Edges
        if self.relevant_edges:
            lines.append("=== VERIFIED DEPENDENCY EDGES ===")
            for e in self.relevant_edges[:10]:
                lines.append(f"- `{e.get('source')}` --[{e.get('type')}]--> `{e.get('target')}` (confidence: {e.get('confidence', 1.0)})")
            lines.append("")

        # 6. Source Code Excerpts
        if self.source_excerpts:
            lines.append("=== SOURCE CODE EXCERPTS ===")
            for path, code in self.source_excerpts.items():
                lines.append(f"--- Code from `{path}` ---")
                lines.append("```")
                lines.append(code.strip())
                lines.append("```")
                lines.append("")

        return "\n".join(lines)


def build_evidence_pack(
    repo_model: Dict[str, Any],
    ranked_candidates: List[RankedCandidate],
    source_excerpts: Dict[str, str],
    intent: QueryIntentInfo,
    scoped_file: Optional[str] = None,
    scoped_edge: Optional[Dict[str, str]] = None
) -> EvidencePack:
    """Build a consolidated EvidencePack from repository metadata and ranked files."""
    metadata = repo_model.get("metadata", {}) or {}
    files_map = repo_model.get("files", {}) or {}
    all_routes = repo_model.get("api_routes", []) or []
    all_models = repo_model.get("database_models", []) or []
    all_edges = repo_model.get("dependencies", []) or []
    all_entrypoints = repo_model.get("entry_points", []) or []
    technologies = repo_model.get("technologies", []) or []

    repo_name = f"{metadata.get('owner', '')}/{metadata.get('repo', '')}".strip("/") or metadata.get("repo", "repository")
    description = metadata.get("description") or ""
    primary_language = metadata.get("primary_language") or "Codebase"
    tech_stack = [t.get("name") for t in technologies if isinstance(t, dict)]

    candidate_files: List[Dict[str, Any]] = []
    candidate_paths = set(c.path for c in ranked_candidates)

    for rc in ranked_candidates:
        fmodel = files_map.get(rc.path, {})
        entry = {
            "path": rc.path,
            "category": fmodel.get("category", "unknown"),
            "purpose": fmodel.get("purpose", ""),
            "confidence": fmodel.get("confidence", 1.0),
            "classes": fmodel.get("classes", []),
            "functions": fmodel.get("functions", []),
            "dependencies": fmodel.get("dependencies", []),
            "dependents": fmodel.get("dependents", []),
            "match_reasons": rc.match_reasons,
        }
        candidate_files.append(entry)

    # Filter relevant routes
    relevant_routes = []
    for r in all_routes:
        rfile = (r.get("file") or "").replace("\\", "/")
        if rfile in candidate_paths or intent.intent == QueryIntent.API_ROUTE:
            relevant_routes.append(r)

    # Filter relevant database models
    relevant_models = []
    for m in all_models:
        mfile = (m.get("file") or "").replace("\\", "/")
        if mfile in candidate_paths or intent.intent == QueryIntent.DATABASE:
            relevant_models.append(m)

    # Filter relevant dependency edges
    relevant_edges = []
    for e in all_edges:
        src = (e.get("source") or "").replace("\\", "/")
        tgt = (e.get("target") or "").replace("\\", "/")
        if src in candidate_paths or tgt in candidate_paths:
            relevant_edges.append(e)

    # Compile verified structural facts
    verified_facts: List[str] = []
    if all_entrypoints:
        ep_strs = [f"`{ep.get('path')}` ({ep.get('type')})" for ep in all_entrypoints[:3]]
        verified_facts.append(f"Entry points identified: {', '.join(ep_strs)}.")

    if scoped_file and scoped_file in files_map:
        sf = files_map[scoped_file]
        deps_count = len(sf.get("dependencies", []))
        revs_count = len(sf.get("dependents", []))
        verified_facts.append(
            f"File `{scoped_file}` directly imports {deps_count} repository file(s) and is imported by {revs_count} file(s)."
        )

    return EvidencePack(
        repo_name=repo_name,
        description=description,
        primary_language=primary_language,
        tech_stack=tech_stack,
        intent=intent.intent,
        scoped_file=scoped_file,
        scoped_edge=scoped_edge,
        candidate_files=candidate_files,
        relevant_routes=relevant_routes,
        relevant_models=relevant_models,
        relevant_edges=relevant_edges,
        source_excerpts=source_excerpts,
        verified_facts=verified_facts
    )
