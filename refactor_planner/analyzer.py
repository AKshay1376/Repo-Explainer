"""Collect only repository-backed evidence, reusing Change Impact and trace engines."""

import re
from typing import Any, Dict

from cache_manager import get_cached_file_contents, get_cached_source_file
from change_impact.service import ChangeImpactService
from execution_trace.service import ExecutionTraceService
from humanize.analysis import analyze_content
from security import is_binary_file, is_sensitive_file, sanitize_content
from source_service import detect_language
from .ordering import dependency_cycles


def safe_cached_content(owner: str, repo: str, revision: str, path: str):
    if is_sensitive_file(path) or is_binary_file(path):
        return None
    item = get_cached_source_file(owner, repo, revision, path)
    if item and not item.get("redacted") and not item.get("is_sensitive"):
        return item.get("content")
    raw = (get_cached_file_contents(owner, repo) or {}).get(path)
    if raw is None:
        return None
    cleaned = sanitize_content(path, raw)
    return cleaned if cleaned is not None and "[REDACTED SECRET]" not in cleaned else None


def _references(symbol: str, contents: Dict[str, str]):
    if not symbol:
        return [], []
    pattern = re.compile(r"\b" + re.escape(symbol) + r"\b")
    confirmed, possible_strings = [], []
    for path, content in sorted(contents.items()):
        for line, text in enumerate(content.splitlines(), 1):
            if not pattern.search(text):
                continue
            entry = {"path": path, "line": line, "evidence": text.strip()[:160], "confidence": "MEDIUM"}
            if re.search(r"['\"][^'\"]*" + re.escape(symbol) + r"[^'\"]*['\"]", text):
                possible_strings.append(entry)
            else:
                confirmed.append(entry)
            if len(confirmed) + len(possible_strings) >= 100:
                return confirmed, possible_strings
    return confirmed, possible_strings


def _move_references(path: str, contents: Dict[str, str]):
    """Collect visible path/config/barrel clues without claiming a safe rewrite."""
    import os
    basename = os.path.basename(path)
    result = {"relative_imports": [], "config_references": [],
              "barrel_exports": [], "path_references": []}
    for source, content in sorted(contents.items()):
        for line, text in enumerate(content.splitlines(), 1):
            stripped = text.strip()
            if source == path and (re.search(r"\bfrom\s+\.+[A-Za-z_]", stripped) or
                                   re.search(r"(?:import|require)\b.*(?:\.\./|\./)", stripped)):
                category = "relative_imports"
            elif source.endswith(("tsconfig.json", "jsconfig.json", "vite.config.ts", "webpack.config.js", "package.json")) and (path in text or basename in text):
                category = "config_references"
            elif re.search(r"(?:^|/)index\.[jt]sx?$", source) and "export" in text and (basename.rsplit(".", 1)[0] in text or path in text):
                category = "barrel_exports"
            elif source != path and path in text:
                category = "path_references"
            else:
                continue
            result[category].append({"path": source, "line": line,
                                     "evidence": stripped[:160], "confidence": "MEDIUM"})
            if sum(len(values) for values in result.values()) >= 100:
                return result
    return result


def gather_evidence(model: Dict[str, Any], resolved: Dict[str, Any], plan_type: str,
                    owner: str, repo: str, revision: str, cache_fingerprint: str = "",
                    impact_service=None, trace_service=None) -> Dict[str, Any]:
    path = resolved["path"]
    index = resolved["index"]
    impact_service = impact_service or ChangeImpactService()
    trace_service = trace_service or ExecutionTraceService()
    safe_files = set(path for path in (model.get("files") or {})
                     if not is_sensitive_file(path) and not is_binary_file(path))
    direct = sorted(set(index.reverse_deps.get(path, ())) & safe_files)
    outbound = sorted(set(index.forward_deps.get(path, ())) & safe_files)
    target_content = safe_cached_content(owner, repo, revision, path)
    file_contents = {}
    candidates = (sorted(safe_files)[:2000] if plan_type in {"rename_symbol", "move_file", "move_module"}
                  else [path] + direct + outbound)
    for candidate in candidates:
        if candidate in safe_files:
            content = safe_cached_content(owner, repo, revision, candidate)
            if content is not None:
                file_contents[candidate] = content
    impact_result = impact_service.analyze_impact(
        repo_model=model, target_file=path,
        target_symbol=resolved["symbol"],
        change_type="PUBLIC_API" if plan_type in {"rename_symbol", "api_migration"} else "GENERAL",
        depth=3, file_contents=file_contents,
        repo_cache_key=f"{owner}/{repo}:{revision}:{cache_fingerprint}",
    )
    analysis = impact_result.get("analysis") if impact_result.get("success") else {}
    nodes = [node for node in (analysis.get("nodes") or []) if node.get("file") in safe_files]
    references, string_references = _references(resolved["symbol"], file_contents)
    move_references = (_move_references(path, file_contents)
                       if plan_type in {"move_file", "move_module"} else {})
    affected = sorted({path, *direct, *(node["file"] for node in nodes),
                       *(item["path"] for item in references),
                       *(item["path"] for group in move_references.values() for item in group)} & safe_files)
    routes = [route for route in (analysis.get("affected_routes") or [])
              if route.get("file") in safe_files]
    models = [item for item in (analysis.get("affected_models") or [])
              if item.get("file") in safe_files]
    tests = [item for item in (analysis.get("affected_tests") or [])
             if item.get("file") in safe_files]
    definitions = [item for item in index.file_to_symbols.get(path, [])
                   if not resolved["symbol"] or item.get("name") == resolved["symbol"]]
    humanize = None
    if target_content is not None and plan_type in {
            "extract_function", "extract_module", "split_large_file", "merge_duplicate_helpers"}:
        humanize = analyze_content(path, target_content, detect_language(path), "Balanced")
    execution_paths = []
    for route in routes[:3]:
        route_file = route.get("file")
        if route_file not in affected:
            continue
        traced = trace_service.trace_execution(model, route=route.get("path"))
        if traced.get("success"):
            for flow in traced.get("flows", [])[:2]:
                steps = [step for step in flow.get("steps", []) if step.get("file") in safe_files]
                if steps and any(step.get("file") in affected for step in steps):
                    execution_paths.append({"route": route.get("path"), "flow_id": flow.get("id"),
                                            "steps": [{"file": step.get("file"), "line": step.get("line"),
                                                       "label": step.get("label")} for step in steps[:12]]})
    return {
        "path": path, "target_content_available": target_content is not None,
        "target_content": target_content, "contents": file_contents,
        "direct": direct, "outbound": outbound, "affected_files": affected,
        "definitions": definitions, "references": references,
        "string_references": string_references, "humanize": humanize,
        "move_references": move_references,
        "coverage_warning": ("Reference search was limited to 2,000 modeled files." if len(safe_files) > 2000 else None),
        "routes": routes, "models": models, "tests": tests,
        "impact": {"available": bool(analysis), "summary": analysis.get("summary"),
                   "risk_level": analysis.get("risk_level"),
                   "blast_radius": analysis.get("blast_radius"),
                   "direct": [node for node in nodes if node.get("impact_type") == "DIRECT"],
                   "transitive": [node for node in nodes if node.get("impact_type") == "TRANSITIVE"]},
        "execution_paths": execution_paths[:6],
        "cycles": dependency_cycles(index.forward_deps, affected),
        "exports": (model.get("files") or {}).get(path, {}).get("exports") or [],
    }
