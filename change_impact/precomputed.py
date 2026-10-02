"""
change_impact/precomputed.py
Precomputes and caches fast graph, symbol, route, model, and env-var lookups
for a given RepositoryModel so impact analysis operates via O(1) lookups
and bounded graph traversals with 0 LLM calls.
"""

import re
import threading
from collections import defaultdict
from typing import Dict, Any, List, Set, Optional, Tuple
from execution_trace.matcher import extract_http_client_calls, normalize_route_path

_INDEX_CACHE: Dict[str, Any] = {}
_INDEX_LOCK = threading.Lock()


class RepositoryIndex:
    """Precomputed lookup index for a RepositoryModel."""

    def __init__(
        self,
        reverse_deps: Dict[str, Set[str]],
        forward_deps: Dict[str, Set[str]],
        dependency_edges: Dict[Tuple[str, str], Dict[str, Any]],
        symbol_to_files: Dict[str, Set[str]],
        symbol_definitions: Dict[str, List[Dict[str, Any]]],
        file_to_symbols: Dict[str, List[Dict[str, Any]]],
        file_to_routes: Dict[str, List[Dict[str, Any]]],
        route_to_callers: Dict[str, List[Dict[str, Any]]],
        file_to_models: Dict[str, List[Dict[str, Any]]],
        model_to_consumers: Dict[str, Set[str]],
        env_var_to_files: Dict[str, Set[str]],
        test_files: Set[str],
        file_to_layer: Dict[str, str],
        file_categories: Dict[str, str],
        in_degrees: Dict[str, int],
        out_degrees: Dict[str, int],
    ):
        self.reverse_deps = reverse_deps
        self.forward_deps = forward_deps
        self.dependency_edges = dependency_edges
        self.symbol_to_files = symbol_to_files
        self.symbol_definitions = symbol_definitions
        self.file_to_symbols = file_to_symbols
        self.file_to_routes = file_to_routes
        self.route_to_callers = route_to_callers
        self.file_to_models = file_to_models
        self.model_to_consumers = model_to_consumers
        self.env_var_to_files = env_var_to_files
        self.test_files = test_files
        self.file_to_layer = file_to_layer
        self.file_categories = file_categories
        self.in_degrees = in_degrees
        self.out_degrees = out_degrees


TEST_FILE_PATTERNS = [
    re.compile(r"(?:^|/)(?:test_|tests/|spec/|__tests__/)", re.IGNORECASE),
    re.compile(r"(?:\.test|\.spec|_test)\.[a-zA-Z0-9]+$", re.IGNORECASE),
]


def is_test_file(path: str) -> bool:
    """Check if file is a test/spec file based on naming conventions and path."""
    clean = path.replace("\\", "/")
    return any(p.search(clean) for p in TEST_FILE_PATTERNS)


def build_repository_index(
    repo_model: Dict[str, Any],
    file_contents: Optional[Dict[str, str]] = None,
    cache_key: Optional[str] = None
) -> RepositoryIndex:
    """
    Construct precomputed repository lookups once per repository model.
    Thread-safe and cached by cache_key.
    """
    if cache_key:
        with _INDEX_LOCK:
            if cache_key in _INDEX_CACHE:
                return _INDEX_CACHE[cache_key]

    reverse_deps = defaultdict(set)
    forward_deps = defaultdict(set)
    dependency_edges = {}
    in_degrees = defaultdict(int)
    out_degrees = defaultdict(int)

    # 1. Dependency graph indexes
    raw_deps = repo_model.get("dependencies", []) or []
    for edge in raw_deps:
        src = edge.get("source")
        tgt = edge.get("target")
        if src and tgt and src != tgt:
            reverse_deps[tgt].add(src)
            forward_deps[src].add(tgt)
            dependency_edges[(src, tgt)] = edge
            in_degrees[tgt] += 1
            out_degrees[src] += 1

    # Also check file-level reverse dependents if declared
    files_map = repo_model.get("files", {}) or {}
    for fpath, fmodel in files_map.items():
        if isinstance(fmodel, dict):
            deps = fmodel.get("dependencies") or []
            dependents = fmodel.get("dependents") or []
            for d in deps:
                if d and d != fpath:
                    forward_deps[fpath].add(d)
                    reverse_deps[d].add(fpath)
            for d in dependents:
                if d and d != fpath:
                    reverse_deps[fpath].add(d)
                    forward_deps[d].add(fpath)

    # 2. File classifications & layers
    file_categories = {}
    file_to_layer = {}
    test_files = set()

    for fpath, fmodel in files_map.items():
        cat = "unknown"
        if isinstance(fmodel, dict):
            cat = fmodel.get("category", "unknown")
        file_categories[fpath] = cat
        if cat == "test" or is_test_file(fpath):
            test_files.add(fpath)

    arch_layers = repo_model.get("architecture_layers", {}) or {}
    for layer_name, layer_files in arch_layers.items():
        if isinstance(layer_files, list):
            for lf in layer_files:
                file_to_layer[lf] = layer_name

    # 3. Symbols index
    symbol_to_files = defaultdict(set)
    symbol_definitions = defaultdict(list)
    file_to_symbols = defaultdict(list)

    raw_symbols = repo_model.get("symbols", []) or []
    for sym in raw_symbols:
        sname = sym.get("name")
        sfile = sym.get("file")
        if sname and sfile:
            symbol_to_files[sname].add(sfile)
            symbol_definitions[sname].append(sym)
            file_to_symbols[sfile].append(sym)

    # Also extract symbols from file models if any
    for fpath, fmodel in files_map.items():
        if isinstance(fmodel, dict):
            for fn in fmodel.get("functions") or []:
                fn_name = fn if isinstance(fn, str) else fn.get("name", "")
                if fn_name:
                    symbol_to_files[fn_name].add(fpath)
                    entry = {"name": fn_name, "file": fpath, "type": "function"}
                    symbol_definitions[fn_name].append(entry)
                    file_to_symbols[fpath].append(entry)
            for cls in fmodel.get("classes") or []:
                cls_name = cls if isinstance(cls, str) else cls.get("name", "")
                if cls_name:
                    symbol_to_files[cls_name].add(fpath)
                    entry = {"name": cls_name, "file": fpath, "type": "class"}
                    symbol_definitions[cls_name].append(entry)
                    file_to_symbols[fpath].append(entry)

    # 4. API Routes index
    file_to_routes = defaultdict(list)
    raw_routes = repo_model.get("api_routes", []) or []
    for r in raw_routes:
        rfile = r.get("file")
        if rfile:
            file_to_routes[rfile].append(r)

    # 5. Route to Callers (frontend HTTP client calls)
    route_to_callers = defaultdict(list)
    if file_contents:
        for fpath, content in file_contents.items():
            if not content:
                continue
            cat = file_categories.get(fpath, "")
            # Only scan frontend or utility files for HTTP calls
            if cat in ("ui", "service", "utility", "unknown") or fpath.endswith((".ts", ".tsx", ".js", ".jsx", ".py")):
                calls = extract_http_client_calls(fpath, content)
                for call in calls:
                    norm = normalize_route_path(call.get("path", ""))
                    if norm:
                        route_to_callers[norm].append(call)

    # 6. Database Models index
    file_to_models = defaultdict(list)
    model_to_consumers = defaultdict(set)
    raw_models = repo_model.get("database_models", []) or []
    for m in raw_models:
        mfile = m.get("file")
        mname = m.get("name")
        if mfile and mname:
            file_to_models[mfile].append(m)
            model_to_consumers[mname].add(mfile)

    # 7. Environment Variables index
    env_var_to_files = defaultdict(set)
    for fpath, fmodel in files_map.items():
        if isinstance(fmodel, dict):
            evs = fmodel.get("env_vars") or []
            for ev in evs:
                if isinstance(ev, str) and ev:
                    env_var_to_files[ev].add(fpath)

    # If file_contents is present, also look for env var usages
    if file_contents:
        env_pattern = re.compile(r"(?:process\.env\.([A-Z0-9_]+)|os\.getenv\(['\"]([A-Z0-9_]+)['\"]|os\.environ(?:\.get)?\[?['\"]([A-Z0-9_]+)['\"]?)")
        for fpath, content in file_contents.items():
            if content:
                for match in env_pattern.finditer(content):
                    for g in match.groups():
                        if g:
                            env_var_to_files[g].add(fpath)

    index = RepositoryIndex(
        reverse_deps=reverse_deps,
        forward_deps=forward_deps,
        dependency_edges=dependency_edges,
        symbol_to_files=symbol_to_files,
        symbol_definitions=symbol_definitions,
        file_to_symbols=file_to_symbols,
        file_to_routes=file_to_routes,
        route_to_callers=route_to_callers,
        file_to_models=file_to_models,
        model_to_consumers=model_to_consumers,
        env_var_to_files=env_var_to_files,
        test_files=test_files,
        file_to_layer=file_to_layer,
        file_categories=file_categories,
        in_degrees=in_degrees,
        out_degrees=out_degrees,
    )

    if cache_key:
        with _INDEX_LOCK:
            _INDEX_CACHE[cache_key] = index

    return index
