"""
execution_trace/traversal.py
Static, evidence-constrained path traversal engine for Execution Path Tracing.
Traverses component -> client service -> HTTP call -> backend route -> middleware -> controller -> service -> model -> database.
Includes cycle detection, max depth bounding, and symbol-level call resolution.
"""

import re
from typing import Dict, Any, List, Optional, Set, Tuple
from execution_trace.models import (
    StepType,
    ConfidenceLevel,
    ExecutionStep,
    ExecutionEdge,
)
from execution_trace.matcher import (
    extract_http_client_calls,
    match_http_client_to_routes,
    infer_step_type,
    normalize_route_path,
)


MAX_DEPTH = 10
MAX_BRANCHING = 8
MAX_CANDIDATE_PATHS = 10


def find_called_symbols_in_content(
    source_content: str,
    target_symbols: List[Dict[str, Any]],
    current_symbol: Optional[str] = None
) -> List[str]:
    """
    Search source file content for explicit calls/references to target symbols.
    """
    if not source_content or not target_symbols:
        return []

    called = []
    # If current_symbol provided, try to restrict search to that function body
    inspect_text = source_content
    if current_symbol:
        # Simple extraction of function body
        fn_pattern = re.compile(
            rf"(?:function\s+|def\s+|const\s+|let\s+){re.escape(current_symbol)}\b[^{{:]*([{{:][\s\S]*?(?=\n(?:def|function|class|export|const)\s|\Z))"
        )
        match = fn_pattern.search(source_content)
        if match:
            inspect_text = match.group(0)

    for sym in target_symbols:
        s_name = sym.get("name", "")
        if len(s_name) >= 3:
            # Look for s_name( or .s_name(
            call_pattern = re.compile(rf"(?:\.|\b){re.escape(s_name)}\s*\(")
            if call_pattern.search(inspect_text):
                called.append(s_name)

    return called


def traverse_execution_paths(
    start_step: ExecutionStep,
    repo_model: Dict[str, Any],
    file_contents: Optional[Dict[str, str]] = None
) -> List[Tuple[List[ExecutionStep], List[ExecutionEdge], bool, List[str]]]:
    """
    Explore candidate execution traces originating from start_step.
    Returns: List of (steps, edges, cycle_detected, warnings).
    """
    files_map = repo_model.get("files", {}) or {}
    symbols_list = repo_model.get("symbols", []) or []
    api_routes = repo_model.get("api_routes", []) or []
    db_models = repo_model.get("database_models", []) or []
    contents = file_contents or {}

    completed_paths: List[Tuple[List[ExecutionStep], List[ExecutionEdge], bool, List[str]]] = []

    # Map file to symbols
    file_to_symbols: Dict[str, List[Dict[str, Any]]] = {}
    for s in symbols_list:
        s_file = s.get("file", "").replace("\\", "/")
        file_to_symbols.setdefault(s_file, []).append(s)

    # Pre-extract HTTP client calls from frontend contents
    http_calls_by_file: Dict[str, List[Dict[str, Any]]] = {}
    for f_path, f_text in contents.items():
        calls = extract_http_client_calls(f_path.replace("\\", "/"), f_text)
        if calls:
            http_calls_by_file[f_path.replace("\\", "/")] = calls

    # Stack entry: (current_step, current_steps_list, current_edges_list, visited_step_ids, warnings)
    initial_steps = [start_step]
    initial_edges: List[ExecutionEdge] = []
    initial_visited = {start_step.id, start_step.file}

    queue = [(start_step, initial_steps, initial_edges, initial_visited, [])]

    while queue and len(completed_paths) < MAX_CANDIDATE_PATHS:
        curr_step, steps_so_far, edges_so_far, visited_set, warnings = queue.pop(0)

        # Depth bounding
        if len(steps_so_far) >= MAX_DEPTH:
            warn = f"Trace reached maximum depth limit ({MAX_DEPTH} steps)."
            completed_paths.append((steps_so_far, edges_so_far, False, warnings + [warn]))
            continue

        curr_file = curr_step.file.replace("\\", "/")
        f_info = files_map.get(curr_file, {})
        curr_type = curr_step.type

        next_branches: List[Tuple[ExecutionStep, ExecutionEdge]] = []

        # -------------------------------------------------------------
        # BRANCH 1: Frontend HTTP Call -> Backend API Route Bridge
        # -------------------------------------------------------------
        if curr_type in (StepType.UI_COMPONENT, StepType.EVENT_HANDLER, StepType.CLIENT_SERVICE, StepType.SERVICE):
            outgoing_http = http_calls_by_file.get(curr_file, [])
            for call in outgoing_http:
                matched_route = match_http_client_to_routes(call, api_routes)
                if matched_route:
                    r_file = matched_route.get("file", "").replace("\\", "/")
                    r_method = matched_route.get("method", "GET")
                    r_path = matched_route.get("path", "")
                    r_handler = matched_route.get("handler")

                    route_step_id = f"step-route-{r_method}-{normalize_route_path(r_path)}"
                    route_step = ExecutionStep(
                        id=route_step_id,
                        file=r_file,
                        symbol=r_handler,
                        type=StepType.API_ROUTE,
                        label=f"{r_method} {r_path}",
                        architecture_layer="api",
                        evidence=f"Static HTTP request from `{curr_file}` to `{r_method} {r_path}` in `{r_file}`",
                        confidence=ConfidenceLevel.HIGH,
                        line=call.get("line"),
                    )

                    edge_id = f"edge-{curr_step.id}-{route_step_id}"
                    edge = ExecutionEdge(
                        id=edge_id,
                        source_step=curr_step.id,
                        target_step=route_step_id,
                        relationship="HTTP Request",
                        evidence=call.get("evidence", f"Calls `{r_method} {r_path}`"),
                        confidence=ConfidenceLevel.HIGH,
                    )
                    next_branches.append((route_step, edge))

        # -------------------------------------------------------------
        # BRANCH 2: API Route -> Middleware / Controller / Handler
        # -------------------------------------------------------------
        if curr_type == StepType.API_ROUTE:
            # If route has a known handler function in the same file or controller
            handler_name = curr_step.symbol
            if handler_name:
                handler_file = curr_file
                # Check if handler_name is defined in an imported controller/file
                for dep in f_info.get("dependencies", []):
                    dep_clean = dep.replace("\\", "/")
                    dep_syms = file_to_symbols.get(dep_clean, [])
                    if any(s.get("name") == handler_name for s in dep_syms):
                        handler_file = dep_clean
                        break
                if handler_file == curr_file:
                    for s in symbols_list:
                        if s.get("name") == handler_name:
                            handler_file = s.get("file", curr_file).replace("\\", "/")
                            break

                handler_step_id = f"step-{handler_file}-{handler_name}"
                if handler_step_id != curr_step.id:
                    h_info = files_map.get(handler_file, {})
                    h_cat = h_info.get("category", "unknown")
                    h_type = StepType.CONTROLLER if "controller" in handler_file.lower() or "controller" in h_cat else StepType.SERVICE
                    handler_step = ExecutionStep(
                        id=handler_step_id,
                        file=handler_file,
                        symbol=handler_name,
                        type=h_type,
                        label=f"{handler_name}()",
                        architecture_layer="controller" if h_type == StepType.CONTROLLER else "service",
                        evidence=f"Route handler `{handler_name}` declared for `{curr_step.label}` in `{handler_file}`",
                        confidence=ConfidenceLevel.HIGH,
                    )
                    edge = ExecutionEdge(
                        id=f"edge-{curr_step.id}-{handler_step_id}",
                        source_step=curr_step.id,
                        target_step=handler_step_id,
                        relationship="dispatches to",
                        evidence=f"Route `{curr_step.label}` dispatches to handler `{handler_name}()`",
                        confidence=ConfidenceLevel.HIGH,
                    )
                    next_branches.append((handler_step, edge))

        # -------------------------------------------------------------
        # BRANCH 3: Forward File Dependencies & Calls
        # -------------------------------------------------------------
        dependencies = f_info.get("dependencies", [])
        curr_content = contents.get(curr_file, "")

        for dep in dependencies[:MAX_BRANCHING]:
            dep_clean = dep.replace("\\", "/")
            dep_info = files_map.get(dep_clean, {})
            dep_category = dep_info.get("category", "unknown")
            dep_symbols = file_to_symbols.get(dep_clean, [])

            # Check if current file explicitly calls any symbol in target file
            called_syms = find_called_symbols_in_content(curr_content, dep_symbols, curr_step.symbol)

            if called_syms:
                # High-confidence symbol-level call!
                for sym_name in called_syms[:2]:
                    next_step_id = f"step-{dep_clean}-{sym_name}"
                    next_step_type = infer_step_type(dep_clean, sym_name, dep_category)
                    next_step = ExecutionStep(
                        id=next_step_id,
                        file=dep_clean,
                        symbol=sym_name,
                        type=next_step_type,
                        label=f"{sym_name}()",
                        architecture_layer=dep_category,
                        evidence=f"`{curr_file}` calls `{sym_name}()` defined in `{dep_clean}`",
                        confidence=ConfidenceLevel.HIGH,
                    )
                    edge = ExecutionEdge(
                        id=f"edge-{curr_step.id}-{next_step_id}",
                        source_step=curr_step.id,
                        target_step=next_step_id,
                        relationship="calls",
                        evidence=f"`{curr_step.label}` calls `{sym_name}()`",
                        confidence=ConfidenceLevel.HIGH,
                    )
                    next_branches.append((next_step, edge))
            else:
                # File-level dependency
                # Filter out pure utility/config noise if we already have business layers
                if dep_category in ("config", "build", "deployment") and len(steps_so_far) > 1:
                    continue

                next_step_id = f"step-{dep_clean}"
                next_step_type = infer_step_type(dep_clean, None, dep_category)

                # Check if target is a database model
                matched_model = next((m for m in db_models if m.get("file", "").replace("\\", "/") == dep_clean), None)
                if matched_model:
                    next_step_type = StepType.MODEL
                    m_label = f"{matched_model.get('name')} Model"
                else:
                    m_label = dep_clean.split("/")[-1]

                next_step = ExecutionStep(
                    id=next_step_id,
                    file=dep_clean,
                    symbol=None,
                    type=next_step_type,
                    label=m_label,
                    architecture_layer=dep_category,
                    evidence=f"`{curr_file}` imports `{dep_clean}` ({dep_category})",
                    confidence=ConfidenceLevel.MEDIUM,
                )

                rel = "queries" if next_step_type in (StepType.MODEL, StepType.DATABASE) else "imports"
                edge = ExecutionEdge(
                    id=f"edge-{curr_step.id}-{next_step_id}",
                    source_step=curr_step.id,
                    target_step=next_step_id,
                    relationship=rel,
                    evidence=f"File import dependency: `{curr_file}` -> `{dep_clean}`",
                    confidence=ConfidenceLevel.MEDIUM,
                )
                next_branches.append((next_step, edge))

        # Check for termination or cycle detection
        if not next_branches:
            # Path finished naturally
            completed_paths.append((steps_so_far, edges_so_far, False, warnings))
        else:
            for next_step, edge in next_branches[:MAX_BRANCHING]:
                # Cycle Detection
                if next_step.id in visited_set or (next_step.file in visited_set and next_step.file == curr_file and next_step.symbol == curr_step.symbol):
                    warn = f"Dependency cycle detected: re-entered `{next_step.label}`."
                    # Mark cycle and finish path
                    cycle_edge = ExecutionEdge(
                        id=f"cycle-{edge.id}",
                        source_step=curr_step.id,
                        target_step=next_step.id,
                        relationship="cycle to",
                        evidence="Looping transition detected",
                        confidence=ConfidenceLevel.HIGH,
                    )
                    completed_paths.append(
                        (steps_so_far, edges_so_far + [cycle_edge], True, warnings + [warn])
                    )
                else:
                    new_visited = set(visited_set)
                    new_visited.add(next_step.id)
                    new_visited.add(next_step.file)

                    queue.append((
                        next_step,
                        steps_so_far + [next_step],
                        edges_so_far + [edge],
                        new_visited,
                        warnings
                    ))

    # If no paths completed (e.g. single node), package single node
    if not completed_paths:
        completed_paths.append(([start_step], [], False, []))

    return completed_paths
