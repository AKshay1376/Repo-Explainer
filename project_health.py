"""Read-only, evidence-backed repository health from the existing model and caches."""

import hashlib
import json
import re
from collections import Counter, defaultdict

from cache_manager import get_cached_file_contents, get_cached_source_file
from humanize.service import HumanizeService
from humanize.transforms import deterministic_candidates
from security import is_binary_file, is_sensitive_file, sanitize_content
from source_service import is_generated_file


CATEGORIES = ("Architecture", "Security", "Performance", "Code Quality")
PENALTIES = {"HIGH": 12, "MEDIUM": 6, "LOW": 2}
WEIGHTS = {"HIGH": 1.0, "MEDIUM": 0.6, "LOW": 0.3}


def _label(score):
    if score >= 90:
        return "Excellent"
    if score >= 80:
        return "Strong"
    if score >= 70:
        return "Good"
    if score >= 60:
        return "Needs Attention"
    if score >= 40:
        return "Weak"
    return "Critical"


def _finding(category, rule, severity, confidence, title, summary, why, evidence,
             path=None, line=None, symbol=None, actions=None, impact=None):
    identity = f"{category}:{rule}:{path or ''}:{line or ''}:{symbol or ''}"
    return {
        "id": hashlib.sha256(identity.encode()).hexdigest()[:16],
        "category": category, "rule": rule, "severity": severity,
        "confidence": confidence, "title": title, "summary": summary,
        "why_it_matters": why, "file": path, "symbol": symbol,
        "start_line": line, "end_line": line, "evidence": evidence,
        "impact_summary": impact, "source": "Humanize" if category == "Code Quality" else "Architecture Graph" if category == "Architecture" else "Security Heuristic" if category == "Security" else "Performance Heuristic",
        "suggested_actions": actions if actions is not None else (["View Source", "Analyze Impact", "View References"] if path and not is_sensitive_file(path) else []),
    }


def _cycles(graph):
    """Iterative SCCs, with one finding per actual dependency cycle."""
    visited = set()
    order = []
    reverse = {node: set() for node in graph}
    for node, targets in graph.items():
        for target in targets:
            reverse[target].add(node)
    for start in sorted(graph):
        if start in visited:
            continue
        visited.add(start)
        stack = [(start, iter(sorted(graph[start])))]
        while stack:
            node, neighbors = stack[-1]
            target = next(neighbors, None)
            if target is None:
                order.append(node)
                stack.pop()
            elif target not in visited:
                visited.add(target)
                stack.append((target, iter(sorted(graph[target]))))
    components = []
    visited.clear()
    for start in reversed(order):
        if start in visited:
            continue
        members = []
        stack = [start]
        visited.add(start)
        while stack:
            node = stack.pop()
            members.append(node)
            for parent in reverse[node]:
                if parent not in visited:
                    visited.add(parent)
                    stack.append(parent)
        if len(members) > 1 or start in graph[start]:
            components.append(sorted(members))
    return components


class ProjectHealthService:
    def __init__(self, humanize=None):
        self.humanize = humanize or HumanizeService()
        self._cache = {}

    def analyze(self, owner, repo, model):
        if not isinstance(model, dict) or not isinstance(model.get("files"), dict) or not model["files"]:
            raise ValueError("Analyze a repository before requesting Project Health.")
        metadata = model.get("metadata") or {}
        revision = metadata.get("latest_commit_sha") or metadata.get("default_branch") or "default"
        files = model["files"]
        bulk = get_cached_file_contents(owner, repo) or {}
        contents = {}
        credential_candidates = defaultdict(list)
        safe_previews = defaultdict(list)
        fingerprints = []
        for path in sorted(files):
            if is_sensitive_file(path) or is_binary_file(path) or is_generated_file(path):
                continue
            source = get_cached_source_file(owner, repo, revision, path)
            raw = source.get("content") if isinstance(source, dict) and not source.get("is_sensitive") else None
            if not isinstance(raw, str):
                raw = bulk.get(path)
            if isinstance(raw, str):
                for number, line in enumerate(raw.splitlines(), 1):
                    if re.search(r"(?i)\b(?:password|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*['\"][^'\"]{4,}['\"]", line):
                        credential_candidates[path].append(number)
                safe = sanitize_content(path, raw)
                if safe is not None:
                    contents[path] = safe
                    fingerprints.append((path, hashlib.sha256(raw.encode()).hexdigest()))
                    if safe == raw and path.endswith((".py", ".js", ".jsx", ".ts", ".tsx")):
                        language = "python" if path.endswith(".py") else "typescript" if path.endswith((".ts", ".tsx")) else "javascript"
                        safe_previews[path] = deterministic_candidates(raw, language)
        snapshot = hashlib.sha256(json.dumps({"model": model, "contents": fingerprints}, sort_keys=True, default=str).encode()).hexdigest()
        key = (owner.lower(), repo.lower(), revision, snapshot)
        if key in self._cache:
            return {**self._cache[key], "cached": True}

        findings = []
        def add(*args, **kwargs):
            finding = _finding(*args, **kwargs)
            if len(findings) < 500:
                findings.append(finding)
            return finding

        # Architecture: only resolved internal edges count. Model evidence is an edge,
        # never a claim about runtime behavior.
        graph = {path: set() for path in files if not is_sensitive_file(path)}
        reverse = defaultdict(set)
        for edge in model.get("dependencies") or []:
            source, target = edge.get("source"), edge.get("target")
            if source in graph and target in graph:
                graph[source].add(target)
                reverse[target].add(source)
        for component in _cycles(graph):
            path = component[0]
            add("Architecture", "dependency_cycle", "MEDIUM", "HIGH", "Dependency cycle",
                f"{len(component)} modeled files form a dependency cycle.",
                "Cycles can make changes harder to isolate.",
                {"type": "dependency_cycle", "files": component}, path, actions=["View Source", "Analyze Impact", "View References", "Trace Flow", "Plan Refactor"])
        for path, targets in graph.items():
            if len(targets) >= 12:
                add("Architecture", "high_fan_out", "LOW", "HIGH", "Many outgoing dependencies",
                    f"This file depends on {len(targets)} modeled files.", "A broad dependency surface can complicate maintenance.",
                    {"type": "resolved_dependencies", "count": len(targets)}, path)
            if len(reverse[path]) >= 12:
                add("Architecture", "high_fan_in", "MEDIUM", "HIGH", "Widely depended-on file",
                    f"{len(reverse[path])} modeled files depend on this file.", "Changes here may affect many callers.",
                    {"type": "resolved_dependents", "count": len(reverse[path])}, path)
        for path, meta in files.items():
            if is_sensitive_file(path):
                add("Security", "sensitive_file", "HIGH", "HIGH", "Sensitive file in repository model",
                    "A sensitive filename was discovered in the analyzed repository.",
                    "Review whether this file should be present in the remote repository; content was not read or returned.",
                    {"type": "sensitive_filename", "path": path}, path, actions=[])
                continue
            if not isinstance(meta, dict):
                continue
            size = meta.get("size") or 0
            if isinstance(size, (int, float)) and size >= 100_000 and not is_binary_file(path) and not is_generated_file(path):
                add("Architecture", "large_module", "LOW", "HIGH", "Large modeled file",
                    f"Model reports {int(size):,} bytes for this file.", "Large modules may contain multiple responsibilities.",
                    {"type": "file_size_bytes", "value": int(size)}, path, actions=["View Source", "Analyze Impact", "View References", "Humanize", "Plan Refactor"])
            if isinstance(size, (int, float)) and size >= 500_000 and (path.endswith((".js", ".css", ".html")) or "/dist/" in path):
                add("Performance", "large_asset", "LOW", "MEDIUM", "Large web asset",
                    f"Model reports {int(size):,} bytes for this asset.", "Large assets may increase transfer size; inspect the build before attributing load time.",
                    {"type": "file_size_bytes", "value": int(size)}, path)

        # Cached source indicators are deliberately phrased as review candidates.
        code_paths = 0
        for path, content in contents.items():
            if not path.endswith((".py", ".js", ".jsx", ".ts", ".tsx")):
                continue
            code_paths += 1
            for number in credential_candidates[path]:
                add("Security", "literal_secret_candidate", "MEDIUM", "MEDIUM", "Possible embedded credential literal",
                    "A credential-named assignment has a literal value.", "Check whether the value is a real credential and move it to secure configuration if so.",
                    {"type": "redacted_assignment", "line": number}, path, number)
            for number, line in enumerate(content.splitlines(), 1):
                if re.search(r"\b(?:eval|exec)\s*\(", line) and not line.lstrip().startswith(("#", "//", "*")):
                    add("Security", "dynamic_execution", "MEDIUM", "MEDIUM", "Dynamic code execution call",
                        "A call to eval or exec appears in cached source.", "Review the input source and whether execution is necessary.",
                        {"type": "call_pattern", "pattern": "eval/exec", "line": number}, path, number)
            calls = defaultdict(list)
            for number, line in enumerate(content.splitlines(), 1):
                for match in re.finditer(r"\bfetch\s*\(\s*['\"]([^'\"]{1,100})['\"]", line):
                    calls[match.group(1)].append(number)
            for endpoint, lines in calls.items():
                if len(lines) >= 3:
                    endpoint_evidence = endpoint if re.fullmatch(r"/[A-Za-z0-9_./-]+", endpoint) else f"sha256:{hashlib.sha256(endpoint.encode()).hexdigest()[:12]}"
                    add("Performance", "repeated_fetch", "LOW", "MEDIUM", "Repeated fetch target",
                        f"The same literal fetch target appears {len(lines)} times in this file.",
                        "Review whether these calls repeat at runtime before adding caching or batching.",
                        {"type": "literal_fetch_calls", "target": endpoint_evidence, "count": len(lines), "lines": lines}, path, lines[0])

        audit = self.humanize.audit_repository(owner, repo, model, "Balanced")
        coverage = audit.get("coverage") or {}
        if audit.get("success"):
            for item in audit.get("top_files") or []:
                path = item.get("path")
                if not path or is_sensitive_file(path):
                    continue
                for issue in item.get("top_findings") or []:
                    line = issue.get("line")
                    rule = issue.get("rule") or "humanize"
                    add("Code Quality", rule, issue.get("severity", "LOW"), issue.get("confidence", "LOW"),
                        issue.get("message") or "Code quality finding", issue.get("suggestion") or "Review this code.",
                        "Humanize identified a deterministic maintainability indicator.",
                        {"type": "humanize_rule", "rule": rule, "line": line}, path, line,
                        actions=["View Source", "Analyze Impact", "Humanize", "View References"])
        for path, previews in safe_previews.items():
            for preview in previews:
                if preview["id"] not in {"final_newline", "trailing_whitespace", "blank_lines"}:
                    continue
                finding = add("Code Quality", f"safe_preview_{preview['id']}", "LOW", "HIGH", preview["title"],
                    preview["description"], "A verified deterministic transformation is available for preview; review the diff before any apply.",
                    {"type": "deterministic_preview", "suggestion_id": preview["id"]}, path,
                    actions=["View Source", "Humanize", "Generate Patch"])
                finding["patch_suggestion_id"] = preview["id"]

        for finding in findings:
            path = finding["file"]
            if path in reverse and not is_sensitive_file(path):
                finding["impact_summary"] = f"{len(reverse[path])} modeled direct dependents; open Change Impact for a wider view."
        findings.sort(key=lambda f: (-PENALTIES.get(f["severity"], 0) * WEIGHTS.get(f["confidence"], 0), f["category"], f["file"] or "", f["start_line"] or 0))
        dimensions = {}
        for category in CATEGORIES:
            subset = [f for f in findings if f["category"] == category]
            penalty = min(60, sum(PENALTIES[f["severity"]] * WEIGHTS[f["confidence"]] for f in subset))
            score = round(100 - penalty)
            counts = Counter(f["severity"] for f in subset)
            evidence_confidence = "HIGH" if category == "Architecture" else "MEDIUM" if code_paths else "LOW"
            dimensions[category] = {"score": score, "label": _label(score), "finding_count": len(subset),
                                    "high": counts["HIGH"], "medium": counts["MEDIUM"], "low": counts["LOW"],
                                    "factors": [{"finding_id": f["id"], "penalty": PENALTIES[f["severity"]] * WEIGHTS[f["confidence"]]} for f in subset[:20]],
                                    "confidence": evidence_confidence}
        overall = round(sum(item["score"] for item in dimensions.values()) / len(dimensions))
        result = {"success": True, "analysis_only": True, "llm_calls": 0, "cached": False,
                  "revision": revision, "snapshot": snapshot[:16], "overall": {"score": overall, "label": _label(overall)},
                  "overall_score": overall,
                  "dimensions": dimensions, "findings": findings,
                  "top_issues": findings[:10],
                  "summary": {"finding_count": len(findings), "high_count": sum(f["severity"] == "HIGH" for f in findings),
                              "medium_count": sum(f["severity"] == "MEDIUM" for f in findings),
                              "low_count": sum(f["severity"] == "LOW" for f in findings)},
                  "coverage": {**coverage, "cached_code_files": code_paths, "resolved_edges": sum(map(len, graph.values()))},
                  "scoring": {"start": 100, "severity_penalties": PENALTIES, "confidence_weights": WEIGHTS,
                              "category_penalty_cap": 60, "overall": "Arithmetic mean of four dimension scores; each dimension is rounded to an integer.",
                              "labels": {"90": "Excellent", "80": "Strong", "70": "Good", "60": "Needs Attention", "40": "Weak", "0": "Critical"}},
                  "warnings": (audit.get("warnings") or []) + (["Security and performance checks cover cached code only; absence of a finding is not proof of safety or speed."] if coverage.get("metadata_only") else []),
                  "no_repository_changes": True}
        if len(self._cache) >= 32:
            self._cache.pop(next(iter(self._cache)))
        self._cache[key] = result
        return result
