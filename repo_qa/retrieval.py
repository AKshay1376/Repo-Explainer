"""
repo_qa/retrieval.py
Multi-stage evidence retrieval and candidate ranking over RepositoryModel.
Features candidate scoring, keyword/symbol matching, and dependency graph expansion.
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set
from repo_qa.intents import QueryIntent, QueryIntentInfo


@dataclass
class RankedCandidate:
    path: str
    score: float
    match_reasons: List[str] = field(default_factory=list)
    is_scoped: bool = False
    is_expansion: bool = False


def rank_relevant_files(
    query: str,
    repo_model: Dict[str, Any],
    intent: QueryIntentInfo,
    scoped_file: Optional[str] = None,
    scoped_edge: Optional[Dict[str, str]] = None,
    limit: int = 6
) -> List[RankedCandidate]:
    """
    Rank repository files according to query relevance, matched entities,
    and 1-hop dependency graph relationships.
    """
    files_map = repo_model.get("files", {}) or {}
    symbols_list = repo_model.get("symbols", []) or []
    routes_list = repo_model.get("api_routes", []) or []
    models_list = repo_model.get("database_models", []) or []
    entrypoints_list = repo_model.get("entry_points", []) or []

    clean_query = query.lower()
    query_tokens = set(re.findall(r"\w+", clean_query))

    scores: Dict[str, float] = {}
    reasons: Dict[str, List[str]] = {}

    for path in files_map.keys():
        scores[path] = 0.0
        reasons[path] = []

    # 1. Scoped File Prior Boost
    if scoped_file and scoped_file in scores:
        scores[scoped_file] += 120.0
        reasons[scoped_file].append("Explicitly scoped by developer")

    # 2. Scoped Edge Prior Boost
    if scoped_edge:
        src = scoped_edge.get("source", "").replace("layer-", "")
        tgt = scoped_edge.get("target", "").replace("layer-", "")
        if src in scores:
            scores[src] += 90.0
            reasons[src].append("Edge source in active graph selection")
        if tgt in scores:
            scores[tgt] += 90.0
            reasons[tgt].append("Edge target in active graph selection")

    # 3. Intent Target Entities
    for target_path in intent.target_files:
        if target_path in scores:
            scores[target_path] += 80.0
            reasons[target_path].append("Directly mentioned in question")

    # 4. Filename / Path Token Matches
    for path in files_map.keys():
        fname = path.split("/")[-1].lower()
        base_name = fname.rsplit(".", 1)[0]
        if base_name in query_tokens and len(base_name) > 2:
            scores[path] += 60.0
            reasons[path].append(f"Filename '{fname}' matched query keyword")

    # 5. Symbol Matches
    for sym in symbols_list:
        sname = sym.get("name", "")
        spath = (sym.get("file") or "").replace("\\", "/")
        if sname and spath in scores:
            slower = sname.lower()
            if slower in query_tokens or (len(sname) >= 4 and slower in clean_query):
                scores[spath] += 50.0
                reasons[spath].append(f"Contains matched symbol `{sname}` ({sym.get('type')})")

    # 6. Route Matches
    for r in routes_list:
        rpath = (r.get("path") or "").lower()
        rfile = (r.get("file") or "").replace("\\", "/")
        if rfile in scores and rpath:
            if rpath in clean_query or any(token in rpath for token in query_tokens if len(token) > 3):
                scores[rfile] += 50.0
                reasons[rfile].append(f"Contains route `{r.get('method')} {r.get('path')}`")

    # 7. Database Model Matches
    for m in models_list:
        mname = (m.get("name") or "").lower()
        mfile = (m.get("file") or "").replace("\\", "/")
        if mfile in scores and mname:
            if mname in query_tokens or mname in clean_query:
                scores[mfile] += 50.0
                reasons[mfile].append(f"Defines database model `{m.get('name')}`")

    # 8. Category & Intent Alignment
    for path, fmodel in files_map.items():
        category = fmodel.get("category", "")
        if intent.intent == QueryIntent.API_ROUTE and "route" in category:
            scores[path] += 40.0
            reasons[path].append("Architectural API route module")
        elif intent.intent == QueryIntent.DATABASE and ("model" in category or "database" in category):
            scores[path] += 40.0
            reasons[path].append("Database/ORM schema module")
        elif intent.intent == QueryIntent.ENTRY_POINT and "entrypoint" in category:
            scores[path] += 40.0
            reasons[path].append("Identified entrypoint module")

    # 9. Top-Tier Candidates for Dependency Expansion
    sorted_paths = sorted([p for p in scores if scores[p] > 0], key=lambda p: scores[p], reverse=True)
    primary_seeds = sorted_paths[:3]

    # 1-Hop Graph Expansion: Direct Dependencies & Direct Dependents
    for seed in primary_seeds:
        seed_model = files_map.get(seed, {})
        # Forward dependencies
        for dep in seed_model.get("dependencies", []):
            clean_dep = dep.replace("\\", "/")
            if clean_dep in scores and clean_dep != seed:
                bonus = 35.0
                scores[clean_dep] += bonus
                reasons[clean_dep].append(f"1-hop direct dependency of `{seed}`")

        # Reverse dependents
        for dependent in seed_model.get("dependents", []):
            clean_dependent = dependent.replace("\\", "/")
            if clean_dependent in scores and clean_dependent != seed:
                bonus = 30.0
                scores[clean_dependent] += bonus
                reasons[clean_dependent].append(f"1-hop reverse dependent of `{seed}`")

    # Fallback to key files or entrypoints if no positive scores
    if not any(s > 0 for s in scores.values()):
        for ep in entrypoints_list:
            eppath = ep.get("path", "").replace("\\", "/")
            if eppath in scores:
                scores[eppath] = 20.0
                reasons[eppath].append("Default entrypoint candidate")
        if not any(s > 0 for s in scores.values()):
            # Take first few files in repository
            for p in list(files_map.keys())[:limit]:
                scores[p] = 10.0
                reasons[p].append("Repository core file")

    # Build ranked results
    ranked = []
    final_sorted = sorted([p for p in scores if scores[p] > 0], key=lambda p: scores[p], reverse=True)

    for p in final_sorted[:limit]:
        is_sc = (p == scoped_file)
        ranked.append(
            RankedCandidate(
                path=p,
                score=scores[p],
                match_reasons=reasons[p],
                is_scoped=is_sc,
                is_expansion=any("1-hop" in r for r in reasons[p]) and not is_sc
            )
        )

    return ranked
