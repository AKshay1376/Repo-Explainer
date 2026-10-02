"""
change_impact/analyzer.py
Deterministic direct impact detection, target resolution, and entity detection
(tests, routes, models, features, env vars) using repository evidence.
0 LLM calls.
"""

import os
import re
from typing import Dict, Any, List, Optional, Set
from change_impact.models import (
    ImpactTarget,
    ImpactNode,
    ImpactType,
    ImpactConfidence,
    ChangeType,
)
from change_impact.precomputed import RepositoryIndex, is_test_file
from execution_trace.matcher import normalize_route_path


def resolve_impact_target(
    repo_model: Dict[str, Any],
    index: RepositoryIndex,
    target_file: Optional[str] = None,
    target_symbol: Optional[str] = None,
    target_route: Optional[str] = None,
    target_model: Optional[str] = None,
    target_env_var: Optional[str] = None,
    line: Optional[int] = None,
) -> Optional[ImpactTarget]:
    """
    Resolve and validate an ImpactTarget from file, symbol, route, model, or env var.
    """
    files_map = repo_model.get("files", {}) or {}

    # 1. Direct file target
    if target_file and target_file in files_map:
        target_type = "file"
        if target_symbol:
            target_type = "symbol"
        elif target_route:
            target_type = "route"
        elif target_model:
            target_type = "database_model"
        elif target_env_var:
            target_type = "environment_variable"

        return ImpactTarget(
            file=target_file,
            symbol=target_symbol,
            type=target_type,
            line=line,
            route=target_route,
            model_name=target_model,
            env_var=target_env_var,
        )

    # 2. File fallback if target_file given but not exact match (case insensitive or partial)
    if target_file:
        clean = target_file.strip().replace("\\", "/").lstrip("/")
        for fpath in files_map:
            if fpath.lower().endswith(clean.lower()) or clean.lower() in fpath.lower():
                target_type = "symbol" if target_symbol else "file"
                return ImpactTarget(
                    file=fpath,
                    symbol=target_symbol,
                    type=target_type,
                    line=line,
                    route=target_route,
                    model_name=target_model,
                    env_var=target_env_var,
                )

    # 3. Route target without file
    if target_route:
        norm_target = normalize_route_path(target_route)
        for r in repo_model.get("api_routes", []) or []:
            if normalize_route_path(r.get("path", "")) == norm_target:
                return ImpactTarget(
                    file=r.get("file", ""),
                    symbol=r.get("handler"),
                    type="route",
                    route=target_route,
                    line=r.get("line"),
                )

    # 4. Model target without file
    if target_model:
        for m in repo_model.get("database_models", []) or []:
            if m.get("name", "").lower() == target_model.lower():
                return ImpactTarget(
                    file=m.get("file", ""),
                    symbol=target_model,
                    type="database_model",
                    model_name=target_model,
                    line=m.get("line"),
                )

    # 5. Symbol target without file
    if target_symbol and target_symbol in index.symbol_to_files:
        matching_files = list(index.symbol_to_files[target_symbol])
        return ImpactTarget(
            file=matching_files[0],
            symbol=target_symbol,
            type="symbol",
            line=line,
        )

    # 6. Environment variable target
    if target_env_var and target_env_var in index.env_var_to_files:
        matching_files = list(index.env_var_to_files[target_env_var])
        return ImpactTarget(
            file=matching_files[0],
            symbol=target_env_var,
            type="environment_variable",
            env_var=target_env_var,
        )

    # If target_file was given even if not in files_map, create minimal target
    if target_file:
        return ImpactTarget(
            file=target_file,
            symbol=target_symbol,
            type="file",
            line=line,
            route=target_route,
            model_name=target_model,
            env_var=target_env_var,
        )

    return None


def analyze_direct_impacts(
    target: ImpactTarget,
    repo_model: Dict[str, Any],
    index: RepositoryIndex,
    file_contents: Optional[Dict[str, str]] = None,
    change_type: str = "GENERAL",
) -> List[ImpactNode]:
    """
    Detect all direct (depth=1) dependents grounded in repository evidence.
    """
    direct_nodes: List[ImpactNode] = []
    seen_files: Set[str] = {target.file}

    # 1. Reverse dependency lookup from precomputed index
    dep_files = index.reverse_deps.get(target.file, set())

    for dep_file in sorted(dep_files):
        if dep_file in seen_files:
            continue
        seen_files.add(dep_file)

        confidence = ImpactConfidence.CONFIRMED.value
        evidence = f"Directly imports or depends on `{target.file}`"
        symbol_name = None

        content = (file_contents or {}).get(dep_file, "")

        # Target is a specific symbol (function, method, class)
        if target.symbol and target.type in ("symbol", "function", "method", "component"):
            pattern = re.compile(r"\b" + re.escape(target.symbol) + r"\b")
            if content and pattern.search(content):
                confidence = ImpactConfidence.CONFIRMED.value
                evidence = f"Direct call/reference to `{target.symbol}` found in `{dep_file}`"
                symbol_name = target.symbol
            else:
                confidence = ImpactConfidence.LIKELY.value
                evidence = f"Imports `{target.file}` (which defines `{target.symbol}`)"

        # Target is an API route
        elif target.route:
            norm_route = normalize_route_path(target.route)
            # Check if dep_file makes HTTP call to this route
            has_http_call = False
            for call in index.route_to_callers.get(norm_route, []):
                if call.get("file") == dep_file:
                    has_http_call = True
                    break
            if has_http_call:
                confidence = ImpactConfidence.CONFIRMED.value
                evidence = f"Client makes HTTP call to route `{target.route}`"
            else:
                confidence = ImpactConfidence.LIKELY.value
                evidence = f"Module depends on `{target.file}` containing route `{target.route}`"

        # Target is a database model
        elif target.model_name:
            if content and re.search(r"\b" + re.escape(target.model_name) + r"\b", content):
                confidence = ImpactConfidence.CONFIRMED.value
                evidence = f"Direct ORM/model reference to `{target.model_name}` in `{dep_file}`"
            else:
                confidence = ImpactConfidence.LIKELY.value
                evidence = f"Imports `{target.file}` containing model `{target.model_name}`"

        # Change type adjustments
        if change_type == ChangeType.FUNCTION_SIGNATURE.value and target.symbol:
            if not (content and re.search(r"\b" + re.escape(target.symbol) + r"\b", content)):
                confidence = ImpactConfidence.INFERRED.value
                evidence = f"Imports `{target.file}`; signature impact unverified in text"

        node_id = f"node_{dep_file.replace('/', '_').replace('.', '_')}"
        direct_nodes.append(
            ImpactNode(
                id=node_id,
                file=dep_file,
                symbol=symbol_name,
                category=index.file_categories.get(dep_file, "unknown"),
                architecture_layer=index.file_to_layer.get(dep_file, "Unassigned"),
                impact_type=ImpactType.DIRECT.value,
                depth=1,
                confidence=confidence,
                evidence=evidence,
                path_from_target=[target.file, dep_file],
            )
        )

    # 2. If target is an API route, also search frontend HTTP client callers
    if target.route:
        norm_route = normalize_route_path(target.route)
        callers = index.route_to_callers.get(norm_route, [])
        for caller in callers:
            cfile = caller.get("file")
            if cfile and cfile not in seen_files:
                seen_files.add(cfile)
                node_id = f"node_{cfile.replace('/', '_').replace('.', '_')}"
                direct_nodes.append(
                    ImpactNode(
                        id=node_id,
                        file=cfile,
                        category=index.file_categories.get(cfile, "ui"),
                        architecture_layer=index.file_to_layer.get(cfile, "Frontend"),
                        impact_type=ImpactType.DIRECT.value,
                        depth=1,
                        confidence=ImpactConfidence.CONFIRMED.value,
                        evidence=f"HTTP caller: {caller.get('method', 'GET')} {target.route} (line {caller.get('line', '?')})",
                        path_from_target=[target.file, cfile],
                        line=caller.get("line"),
                    )
                )

    # 3. If target is an Environment Variable, add all direct readers
    if target.env_var or (target.type == "environment_variable"):
        evar = target.env_var or target.symbol
        if evar:
            readers = index.env_var_to_files.get(evar, set())
            for rfile in sorted(readers):
                if rfile not in seen_files:
                    seen_files.add(rfile)
                    node_id = f"node_{rfile.replace('/', '_').replace('.', '_')}"
                    direct_nodes.append(
                        ImpactNode(
                            id=node_id,
                            file=rfile,
                            category=index.file_categories.get(rfile, "unknown"),
                            architecture_layer=index.file_to_layer.get(rfile, "Unassigned"),
                            impact_type=ImpactType.DIRECT.value,
                            depth=1,
                            confidence=ImpactConfidence.CONFIRMED.value,
                            evidence=f"Directly reads environment variable `{evar}`",
                            path_from_target=[target.file, rfile],
                        )
                    )

    return direct_nodes


def detect_affected_tests(
    target: ImpactTarget,
    direct_nodes: List[ImpactNode],
    repo_model: Dict[str, Any],
    index: RepositoryIndex,
    file_contents: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Detect potentially affected test files using imports, naming conventions, and references.
    """
    affected_tests = []
    seen_tests = set()

    # Base filename without extension or folder for naming convention matching
    base_name = os.path.splitext(os.path.basename(target.file))[0].lower()

    # 1. Check all test files in the repository
    for tfile in sorted(index.test_files):
        tname = os.path.splitext(os.path.basename(tfile))[0].lower()
        tcontent = (file_contents or {}).get(tfile, "")

        is_direct_dep = tfile in index.reverse_deps.get(target.file, set())
        has_name_pairing = (
            base_name in tname
            or tname in (f"test_{base_name}", f"{base_name}.test", f"{base_name}.spec", f"{base_name}_test")
        )
        has_symbol_ref = bool(target.symbol and tcontent and re.search(r"\b" + re.escape(target.symbol) + r"\b", tcontent))

        if is_direct_dep or has_name_pairing or has_symbol_ref:
            confidence = ImpactConfidence.CONFIRMED.value if (is_direct_dep or has_symbol_ref) else ImpactConfidence.LIKELY.value
            reasons = []
            if is_direct_dep:
                reasons.append(f"Imports `{target.file}` directly")
            if has_symbol_ref:
                reasons.append(f"Tests symbol `{target.symbol}`")
            if has_name_pairing:
                reasons.append(f"Filename paired with `{os.path.basename(target.file)}`")

            seen_tests.add(tfile)
            affected_tests.append({
                "file": tfile,
                "confidence": confidence,
                "evidence": "; ".join(reasons) or "Associated test suite",
                "naming_convention": has_name_pairing,
            })

    # 2. Check tests among direct nodes
    for node in direct_nodes:
        if node.file in index.test_files and node.file not in seen_tests:
            seen_tests.add(node.file)
            affected_tests.append({
                "file": node.file,
                "confidence": node.confidence,
                "evidence": f"Direct dependency test: {node.evidence}",
                "naming_convention": False,
            })

    return affected_tests


def detect_affected_routes(
    target: ImpactTarget,
    direct_nodes: List[ImpactNode],
    repo_model: Dict[str, Any],
    index: RepositoryIndex,
) -> List[Dict[str, Any]]:
    """
    Detect affected API routes where route handler or route file is in target or direct dependents.
    """
    affected_routes = []
    seen_routes = set()

    relevant_files = {target.file} | {n.file for n in direct_nodes}

    raw_routes = repo_model.get("api_routes", []) or []
    for r in raw_routes:
        rfile = r.get("file", "")
        rpath = r.get("path", "")
        rmethod = r.get("method", "GET").upper()
        route_key = f"{rmethod} {rpath}"

        if route_key in seen_routes:
            continue

        if rfile in relevant_files or (target.route and normalize_route_path(rpath) == normalize_route_path(target.route)):
            seen_routes.add(route_key)
            is_target = rfile == target.file
            affected_routes.append({
                "method": rmethod,
                "path": rpath,
                "file": rfile,
                "handler": r.get("handler", "unknown"),
                "confidence": ImpactConfidence.CONFIRMED.value if is_target else ImpactConfidence.LIKELY.value,
                "evidence": f"Defined in `{rfile}`" if is_target else f"Connected via dependent file `{rfile}`",
            })

    return affected_routes


def detect_affected_models(
    target: ImpactTarget,
    direct_nodes: List[ImpactNode],
    repo_model: Dict[str, Any],
    index: RepositoryIndex,
) -> List[Dict[str, Any]]:
    """
    Detect database models defined in or directly consumed by target or dependents.
    """
    affected_models = []
    seen_models = set()

    relevant_files = {target.file} | {n.file for n in direct_nodes}

    raw_models = repo_model.get("database_models", []) or []
    for m in raw_models:
        mname = m.get("name", "")
        mfile = m.get("file", "")

        if not mname or mname in seen_models:
            continue

        if mfile in relevant_files or (target.model_name and mname.lower() == target.model_name.lower()):
            seen_models.add(mname)
            is_target = mfile == target.file
            affected_models.append({
                "name": mname,
                "framework": m.get("framework", "ORM"),
                "file": mfile,
                "confidence": ImpactConfidence.CONFIRMED.value if is_target else ImpactConfidence.LIKELY.value,
                "evidence": f"Defined in `{mfile}`" if is_target else f"Referenced by dependent `{mfile}`",
            })

    return affected_models


def detect_affected_features(
    nodes: List[ImpactNode],
    affected_routes: List[Dict[str, Any]],
    repo_model: Dict[str, Any],
) -> List[str]:
    """
    Derive domain features deterministically from affected paths, routes, and layers.
    """
    features = set()

    # Extract from routes
    for r in affected_routes:
        path = r.get("path", "").strip("/").split("/")
        if path and path[0]:
            seg = path[1] if (path[0] in ("api", "v1", "v2") and len(path) > 1) else path[0]
            if seg and not seg.startswith(":"):
                features.add(seg.replace("-", " ").replace("_", " ").title())

    # Extract from node categories and directory namespaces
    for n in nodes:
        parts = n.file.replace("\\", "/").split("/")
        if len(parts) > 1:
            for p in parts[:-1]:
                if p.lower() in ("auth", "users", "billing", "checkout", "dashboard", "analytics", "notifications", "settings"):
                    features.add(p.capitalize())

    return sorted(list(features))
