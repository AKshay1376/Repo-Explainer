"""
execution_trace/matcher.py
Entity matching and static HTTP client call detection for Execution Path Tracing.
Bridges frontend client requests (fetch/axios) with backend routes (Express/Flask/FastAPI/Next.js).
"""

import re
from typing import Dict, Any, List, Optional, Tuple, Set
from execution_trace.models import StepType, ConfidenceLevel, ExecutionStep


# Regex patterns for detecting static HTTP client invocations in JS/TS/Python code
HTTP_PATTERNS = [
    # fetch('/api/login', { method: 'POST' })
    re.compile(r"fetch\s*\(\s*['\"`]?([^'\"`\s,]+)['\"`]?(?:\s*,\s*\{[^}]*method:\s*['\"]([a-zA-Z]+)['\"])?", re.IGNORECASE),
    # axios.post('/api/login') or axios.get('/api/users')
    re.compile(r"axios\.(get|post|put|delete|patch)\s*\(\s*['\"`]?([^'\"`\s,)]+)['\"`]?", re.IGNORECASE),
    # apiClient.post('/api/login') or api.get(...)
    re.compile(r"(?:apiClient|api|http|request|client)\.(get|post|put|delete|patch)\s*\(\s*['\"`]?([^'\"`\s,)]+)['\"`]?", re.IGNORECASE),
    # requests.post('/api/login') (Python)
    re.compile(r"requests\.(get|post|put|delete|patch)\s*\(\s*['\"`]?([^'\"`\s,)]+)['\"`]?", re.IGNORECASE),
]


def extract_http_client_calls(
    file_path: str,
    content: str
) -> List[Dict[str, Any]]:
    """
    Extract statically evident outgoing HTTP client requests from file source code.
    Returns: list of dicts with {method, path, line, file, evidence}.
    """
    if not content:
        return []

    calls = []
    lines = content.splitlines()

    for line_idx, line in enumerate(lines):
        line_num = line_idx + 1

        # 1. Pattern matching
        for pattern in HTTP_PATTERNS:
            for match in pattern.finditer(line):
                groups = match.groups()
                method = "GET"
                path = ""

                # Distinguish groups order
                if len(groups) == 2:
                    if groups[0] and groups[0].upper() in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                        method = groups[0].upper()
                        path = groups[1] or ""
                    else:
                        path = groups[0] or ""
                        if groups[1]:
                            method = groups[1].upper()

                # Clean up extracted path (e.g. strip query params, template strings)
                clean_path = path.strip()
                if clean_path and (clean_path.startswith("/") or clean_path.startswith("http")):
                    # Normalize /api/v1/users/${id} -> /api/v1/users
                    clean_path = re.sub(r"\$\{[^}]+\}", ":param", clean_path)
                    calls.append({
                        "file": file_path,
                        "line": line_num,
                        "method": method,
                        "path": clean_path,
                        "raw_line": line.strip()[:100],
                        "evidence": f"`{file_path}:{line_num}` calls `{method} {clean_path}`",
                    })

    return calls


def normalize_route_path(path: str) -> str:
    """Normalize route paths for matching: strips trailing slashes, handles params."""
    if not path:
        return "/"
    p = path.strip()
    if p.startswith("http://") or p.startswith("https://"):
        # Strip domain if present
        p = re.sub(r"^https?://[^/]+", "", p)
    # Replace express /:param or flask /<param> or template /${param} with standard placeholder
    p = re.sub(r"/:[a-zA-Z0-9_]+", "/:param", p)
    p = re.sub(r"/<[a-zA-Z0-9_:]+>", "/:param", p)
    p = re.sub(r"\$\{[^}]+\}", ":param", p)
    p = p.rstrip("/")
    return p if p else "/"


def match_http_client_to_routes(
    client_call: Dict[str, Any],
    api_routes: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """
    Match an extracted frontend HTTP client call to a backend API route.
    Returns the matching RouteModel dict if confirmed by evidence.
    """
    call_method = client_call.get("method", "GET").upper()
    call_path = normalize_route_path(client_call.get("path", ""))

    for route in api_routes:
        route_method = route.get("method", "GET").upper()
        route_path = normalize_route_path(route.get("path", ""))

        method_match = (call_method == route_method) or (route_method == "ALL")
        if not method_match:
            continue

        # Exact path match
        if call_path == route_path:
            return route

        # Prefix or parameterized match
        if call_path.startswith(route_path) and (len(route_path) > 4 or route_path != "/"):
            return route
        if route_path.startswith(call_path) and len(call_path) > 4:
            return route

    return None


def infer_step_type(
    file_path: str,
    symbol_name: Optional[str] = None,
    category: str = "unknown",
    is_route: bool = False,
    is_entrypoint: bool = False
) -> str:
    """
    Determine the StepType of a node based on AST classifications and symbols.
    """
    if is_route:
        return StepType.API_ROUTE
    if is_entrypoint:
        return StepType.ENTRY_POINT

    path_lower = file_path.lower()
    symbol_lower = (symbol_name or "").lower()

    if "middleware" in path_lower or "guard" in path_lower:
        return StepType.MIDDLEWARE

    if "controller" in path_lower or (symbol_name and "controller" in symbol_lower):
        return StepType.CONTROLLER

    if category in ("frontend-component", "frontend-page") or path_lower.endswith(".tsx") or path_lower.endswith(".jsx"):
        if symbol_name and (symbol_name.startswith("handle") or symbol_name.startswith("on") or "click" in symbol_lower or "submit" in symbol_lower):
            return StepType.EVENT_HANDLER
        return StepType.UI_COMPONENT

    if category == "backend-route" or "route" in path_lower:
        return StepType.API_ROUTE

    if category == "model" or "model" in path_lower or "schema" in path_lower or "entity" in path_lower:
        return StepType.MODEL

    if category == "database" or "db" in path_lower or "prisma" in path_lower or "repository" in path_lower:
        return StepType.DATABASE

    if category == "service" or "service" in path_lower or "manager" in path_lower:
        if "api" in path_lower or "client" in path_lower:
            return StepType.API_CLIENT
        return StepType.SERVICE

    if category == "utility" or "util" in path_lower or "helper" in path_lower:
        return StepType.UTILITY

    return StepType.SERVICE if "src" in path_lower else StepType.UNKNOWN


def resolve_trace_start_points(
    repo_model: Dict[str, Any],
    query: Optional[str] = None,
    start_file: Optional[str] = None,
    start_symbol: Optional[str] = None,
    route: Optional[str] = None,
    ask_repo_context: Optional[Dict[str, Any]] = None,
    file_contents: Optional[Dict[str, str]] = None
) -> List[ExecutionStep]:
    """
    Determine the most appropriate starting step(s) based on user specification or feature query.
    """
    files_map = repo_model.get("files", {}) or {}
    symbols_list = repo_model.get("symbols", []) or []
    api_routes = repo_model.get("api_routes", []) or []
    entry_points = repo_model.get("entry_points", []) or []

    candidates: List[ExecutionStep] = []

    # 1. Direct API Route starting point
    if route:
        clean_route = route.strip()
        parts = clean_route.split(maxsplit=1)
        req_method = parts[0].upper() if len(parts) > 1 else None
        req_path = parts[1] if len(parts) > 1 else parts[0]

        for r in api_routes:
            r_path = r.get("path", "")
            r_method = r.get("method", "GET")
            if (not req_method or r_method == req_method) and normalize_route_path(r_path) == normalize_route_path(req_path):
                r_file = r.get("file", "").replace("\\", "/")
                step = ExecutionStep(
                    id=f"step-route-{r_method}-{normalize_route_path(r_path)}",
                    file=r_file,
                    symbol=r.get("handler"),
                    type=StepType.API_ROUTE,
                    label=f"{r_method} {r_path}",
                    architecture_layer="api",
                    evidence=f"Declared {r_method} route in `{r_file}`",
                    confidence=ConfidenceLevel.HIGH,
                )
                candidates.append(step)
                return candidates

    # 2. Direct File & Symbol starting point
    if start_file and start_symbol:
        clean_file = start_file.replace("\\", "/")
        f_info = files_map.get(clean_file, {})
        step_type = infer_step_type(clean_file, start_symbol, f_info.get("category", "unknown"))
        candidates.append(
            ExecutionStep(
                id=f"step-{clean_file}-{start_symbol}",
                file=clean_file,
                symbol=start_symbol,
                type=step_type,
                label=f"{start_symbol}()" if not start_symbol.endswith(")") else start_symbol,
                architecture_layer=f_info.get("category", "service"),
                evidence=f"Selected symbol `{start_symbol}` in `{clean_file}`",
                confidence=ConfidenceLevel.HIGH,
            )
        )
        return candidates

    # 3. Direct File starting point
    if start_file:
        clean_file = start_file.replace("\\", "/")
        f_info = files_map.get(clean_file, {})
        # Look for prominent functions or components in this file
        symbols_in_file = [s for s in symbols_list if s.get("file", "").replace("\\", "/") == clean_file]
        primary_sym = symbols_in_file[0].get("name") if symbols_in_file else None
        step_type = infer_step_type(clean_file, primary_sym, f_info.get("category", "unknown"))

        label = f"{primary_sym}()" if primary_sym else clean_file.split("/")[-1]
        candidates.append(
            ExecutionStep(
                id=f"step-{clean_file}" + (f"-{primary_sym}" if primary_sym else ""),
                file=clean_file,
                symbol=primary_sym,
                type=step_type,
                label=label,
                architecture_layer=f_info.get("category", "general"),
                evidence=f"Target file `{clean_file}`",
                confidence=ConfidenceLevel.HIGH,
            )
        )
        return candidates

    # 4. Context from Ask Repo answer
    if ask_repo_context:
        candidate_files = ask_repo_context.get("candidate_files") or ask_repo_context.get("related_files") or []
        for cf in candidate_files[:3]:
            clean_cf = cf.replace("\\", "/")
            if clean_cf in files_map:
                f_info = files_map[clean_cf]
                stype = infer_step_type(clean_cf, None, f_info.get("category", "unknown"))
                candidates.append(
                    ExecutionStep(
                        id=f"step-{clean_cf}",
                        file=clean_cf,
                        symbol=None,
                        type=stype,
                        label=clean_cf.split("/")[-1],
                        architecture_layer=f_info.get("category", "general"),
                        evidence=f"Highlighted in Ask Repo context as relevant evidence",
                        confidence=ConfidenceLevel.HIGH,
                    )
                )
        if candidates:
            return candidates

    # 5. Natural-Language Feature Query (e.g. "login", "checkout", "registration", "startup")
    clean_query = (query or "").lower().strip()
    if clean_query:
        tokens = set(re.findall(r"\w+", clean_query))

        # Check for startup / entrypoint queries
        if any(t in tokens for t in ("start", "startup", "entry", "launch", "bootstrap")):
            for ep in entry_points:
                ep_path = ep.get("path", "").replace("\\", "/")
                candidates.append(
                    ExecutionStep(
                        id=f"step-{ep_path}",
                        file=ep_path,
                        symbol="main",
                        type=StepType.ENTRY_POINT,
                        label=f"{ep_path.split('/')[-1]} [Entry]",
                        architecture_layer="entry",
                        evidence=ep.get("evidence", "Application startup entrypoint"),
                        confidence=ConfidenceLevel.HIGH,
                    )
                )
            if candidates:
                return candidates

        # Check matching UI components first (so traces flow UI -> backend)
        for path, f_info in files_map.items():
            fname = path.split("/")[-1].lower()
            category = f_info.get("category", "")
            if any(t in fname for t in tokens):
                if category in ("frontend-component", "frontend-page") or path.endswith(".tsx") or path.endswith(".jsx"):
                    candidates.append(
                        ExecutionStep(
                            id=f"step-{path}",
                            file=path,
                            symbol=None,
                            type=StepType.UI_COMPONENT,
                            label=path.split("/")[-1].rsplit(".", 1)[0],
                            architecture_layer="presentation",
                            evidence=f"UI Component matching '{query}'",
                            confidence=ConfidenceLevel.HIGH,
                        )
                    )

        # Check matching API routes
        for r in api_routes:
            r_path = r.get("path", "").lower()
            r_method = r.get("method", "GET")
            if any(t in r_path for t in tokens if len(t) >= 3):
                r_file = r.get("file", "").replace("\\", "/")
                candidates.append(
                    ExecutionStep(
                        id=f"step-route-{r_method}-{normalize_route_path(r.get('path', ''))}",
                        file=r_file,
                        symbol=r.get("handler"),
                        type=StepType.API_ROUTE,
                        label=f"{r_method} {r.get('path')}",
                        architecture_layer="api",
                        evidence=f"API Route matching '{query}'",
                        confidence=ConfidenceLevel.HIGH,
                    )
                )

        # Check matching services / files
        if not candidates:
            for path, f_info in files_map.items():
                fname = path.split("/")[-1].lower()
                if any(t in fname for t in tokens if len(t) >= 3):
                    stype = infer_step_type(path, None, f_info.get("category", "unknown"))
                    candidates.append(
                        ExecutionStep(
                            id=f"step-{path}",
                            file=path,
                            symbol=None,
                            type=stype,
                            label=path.split("/")[-1],
                            architecture_layer=f_info.get("category", "general"),
                            evidence=f"File name matched keyword '{query}'",
                            confidence=ConfidenceLevel.MEDIUM,
                        )
                    )

    # Fallback to entrypoint or first key file
    if not candidates:
        if entry_points:
            ep_path = entry_points[0].get("path", "").replace("\\", "/")
            candidates.append(
                ExecutionStep(
                    id=f"step-{ep_path}",
                    file=ep_path,
                    symbol=None,
                    type=StepType.ENTRY_POINT,
                    label=ep_path.split("/")[-1],
                    architecture_layer="entry",
                    evidence="Default root entry point",
                    confidence=ConfidenceLevel.HIGH,
                )
            )
        elif files_map:
            first_path = list(files_map.keys())[0]
            candidates.append(
                ExecutionStep(
                    id=f"step-{first_path}",
                    file=first_path,
                    symbol=None,
                    type=StepType.SERVICE,
                    label=first_path.split("/")[-1],
                    architecture_layer="general",
                    evidence="Repository initial module",
                    confidence=ConfidenceLevel.LOW,
                )
            )

    return candidates
