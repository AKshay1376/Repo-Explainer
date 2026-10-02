"""
repo_qa/intents.py
Lightweight query intent classifier and entity extractor for Ask Repo.
Identifies developer intents such as file inquiries, symbol lookup,
dependency/reverse-dependency traversal, route discovery, and database schema questions.
"""

import re
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set


class QueryIntent:
    FILE_LOOKUP = "file_lookup"
    SYMBOL_LOOKUP = "symbol_lookup"
    DEPENDENCY = "dependency"
    REVERSE_DEPENDENCY = "reverse_dependency"
    API_ROUTE = "api_route"
    DATABASE = "database"
    ENTRY_POINT = "entry_point"
    ARCHITECTURE = "architecture"
    FLOW = "flow"
    TECH_STACK = "tech_stack"
    GENERAL_REPO = "general_repo"


@dataclass
class QueryIntentInfo:
    intent: str
    target_files: List[str] = field(default_factory=list)
    target_symbols: List[str] = field(default_factory=list)
    target_routes: List[str] = field(default_factory=list)
    target_models: List[str] = field(default_factory=list)
    is_structural_only: bool = False
    confidence: float = 0.8
    reasoning: str = ""


# Common intent pattern matchers
RE_REVERSE_DEP = re.compile(
    r"\b(who uses|what uses|what files? depend(s)? on|what imports|where is .+ imported|dependents? of|used by)\b",
    re.IGNORECASE
)
RE_FORWARD_DEP = re.compile(
    r"\b(what does .+ import|dependencies of|what does .+ depend on|what does .+ call|imports of)\b",
    re.IGNORECASE
)
RE_API_ROUTE = re.compile(
    r"\b(api routes?|endpoints?|http routes?|rest api|url paths?|controllers?|handlers?|get /|post /|put /|delete /)\b",
    re.IGNORECASE
)
RE_DATABASE = re.compile(
    r"\b(database|database models?|db models?|tables?|schema|entities|models?|orm|migrations?|sql|collections?)\b",
    re.IGNORECASE
)
RE_ENTRY = re.compile(
    r"\b(entry\s*points?|how to run|how does .+ start|startup|entrypoint|main entry|bootstrap|launch)\b",
    re.IGNORECASE
)
RE_ARCHITECTURE = re.compile(
    r"\b(architecture|layers?|component flow|system design|high level|structure|overview|design pattern)\b",
    re.IGNORECASE
)
RE_FLOW = re.compile(
    r"\b(flow|data flow|execution flow|how does a request|request lifecycle|pipeline|lifecycle)\b",
    re.IGNORECASE
)
RE_TECH_STACK = re.compile(
    r"\b(tech stack|technologies|frameworks?|libraries|dependencies|built with|languages?)\b",
    re.IGNORECASE
)


def classify_query_intent(
    query: str,
    repo_model: Optional[Dict[str, Any]] = None,
    scoped_file: Optional[str] = None
) -> QueryIntentInfo:
    """
    Classify developer query intent and extract grounded entities
    (files, symbols, routes, models) from repository metadata.
    """
    clean_query = query.strip()
    lower_query = clean_query.lower()

    target_files: Set[str] = set()
    target_symbols: Set[str] = set()
    target_routes: Set[str] = set()
    target_models: Set[str] = set()

    # Pre-populate scoped file if provided
    if scoped_file:
        target_files.add(scoped_file)

    known_files: Dict[str, Any] = {}
    known_symbols: List[Dict[str, Any]] = []
    known_routes: List[Dict[str, Any]] = []
    known_models: List[Dict[str, Any]] = []

    if repo_model and isinstance(repo_model, dict):
        known_files = repo_model.get("files", {}) or {}
        known_symbols = repo_model.get("symbols", []) or []
        known_routes = repo_model.get("api_routes", []) or []
        known_models = repo_model.get("database_models", []) or []

    # 1. Match known files mentioned in query
    for path in known_files.keys():
        fname = path.split("/")[-1]
        # Match either exact path or file name (with word boundary)
        pattern = r"(?:^|[^\w./\\])" + re.escape(fname) + r"(?:[^\w./\\]|$)"
        if re.search(pattern, clean_query, re.IGNORECASE) or (path in clean_query):
            target_files.add(path)

    # 2. Match known symbols mentioned in query
    for sym in known_symbols:
        sname = sym.get("name", "")
        if len(sname) >= 3:
            sym_pattern = r"\b" + re.escape(sname) + r"\b"
            if re.search(sym_pattern, clean_query):
                target_symbols.add(sname)
                # Link symbol's file to candidate files
                if sym.get("file"):
                    target_files.add(sym["file"].replace("\\", "/"))

    # 3. Match known routes
    for r in known_routes:
        rpath = r.get("path", "")
        if rpath and len(rpath) > 1 and rpath.lower() in lower_query:
            target_routes.add(f"{r.get('method', 'GET')} {rpath}")
            if r.get("file"):
                target_files.add(r["file"].replace("\\", "/"))

    # 4. Match known database models
    for m in known_models:
        mname = m.get("name", "")
        if mname and len(mname) >= 3 and re.search(r"\b" + re.escape(mname) + r"\b", clean_query, re.IGNORECASE):
            target_models.add(mname)
            if m.get("file"):
                target_files.add(m["file"].replace("\\", "/"))

    # Intent determination
    if RE_REVERSE_DEP.search(clean_query):
        return QueryIntentInfo(
            intent=QueryIntent.REVERSE_DEPENDENCY,
            target_files=list(target_files),
            target_symbols=list(target_symbols),
            is_structural_only=bool(target_files),
            confidence=0.95,
            reasoning="Matched reverse-dependency pattern."
        )

    if RE_FORWARD_DEP.search(clean_query):
        return QueryIntentInfo(
            intent=QueryIntent.DEPENDENCY,
            target_files=list(target_files),
            target_symbols=list(target_symbols),
            is_structural_only=bool(target_files),
            confidence=0.95,
            reasoning="Matched forward-dependency pattern."
        )

    if RE_API_ROUTE.search(clean_query) or target_routes:
        return QueryIntentInfo(
            intent=QueryIntent.API_ROUTE,
            target_files=list(target_files),
            target_routes=list(target_routes),
            is_structural_only=not target_files and "all" in lower_query or "list" in lower_query,
            confidence=0.9,
            reasoning="Matched API route pattern."
        )

    if RE_DATABASE.search(clean_query) or target_models:
        return QueryIntentInfo(
            intent=QueryIntent.DATABASE,
            target_files=list(target_files),
            target_models=list(target_models),
            is_structural_only="list" in lower_query or "show all" in lower_query,
            confidence=0.9,
            reasoning="Matched database model pattern."
        )

    if RE_ENTRY.search(clean_query):
        return QueryIntentInfo(
            intent=QueryIntent.ENTRY_POINT,
            target_files=list(target_files),
            is_structural_only="what are" in lower_query or "list" in lower_query,
            confidence=0.9,
            reasoning="Matched entry point pattern."
        )

    if RE_FLOW.search(clean_query):
        return QueryIntentInfo(
            intent=QueryIntent.FLOW,
            target_files=list(target_files),
            target_symbols=list(target_symbols),
            is_structural_only=False,
            confidence=0.85,
            reasoning="Matched execution flow pattern."
        )

    if RE_ARCHITECTURE.search(clean_query):
        return QueryIntentInfo(
            intent=QueryIntent.ARCHITECTURE,
            target_files=list(target_files),
            is_structural_only=False,
            confidence=0.85,
            reasoning="Matched architecture pattern."
        )

    if RE_TECH_STACK.search(clean_query):
        return QueryIntentInfo(
            intent=QueryIntent.TECH_STACK,
            target_files=list(target_files),
            is_structural_only="what is" in lower_query or "list" in lower_query,
            confidence=0.85,
            reasoning="Matched tech stack inquiry."
        )

    if target_symbols and not target_files:
        return QueryIntentInfo(
            intent=QueryIntent.SYMBOL_LOOKUP,
            target_files=list(target_files),
            target_symbols=list(target_symbols),
            is_structural_only=False,
            confidence=0.85,
            reasoning="Matched symbol inquiry."
        )

    if target_files:
        return QueryIntentInfo(
            intent=QueryIntent.FILE_LOOKUP,
            target_files=list(target_files),
            target_symbols=list(target_symbols),
            is_structural_only=False,
            confidence=0.85,
            reasoning="Matched target file inquiry."
        )

    return QueryIntentInfo(
        intent=QueryIntent.GENERAL_REPO,
        target_files=list(target_files),
        target_symbols=list(target_symbols),
        is_structural_only=False,
        confidence=0.7,
        reasoning="General repository question."
    )
