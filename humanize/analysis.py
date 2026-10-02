"""Deterministic, evidence-grounded code quality heuristics. Never executes source."""

import ast
import hashlib
import re
from collections import defaultdict
from typing import Any, Dict, List, Tuple

THRESHOLDS = {
    "Conservative": {"line": 120, "function": 80, "complexity": 15, "nesting": 5, "duplicate": 6},
    "Balanced": {"line": 100, "function": 50, "complexity": 10, "nesting": 4, "duplicate": 4},
    "Aggressive": {"line": 88, "function": 35, "complexity": 7, "nesting": 3, "duplicate": 3},
}
CODE_LANGUAGES = {"python", "javascript", "typescript", "jsx", "tsx"}
_CONTROL = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.Try, ast.With, ast.AsyncWith, ast.IfExp, ast.Match)
_BRANCH = (ast.If, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler, ast.IfExp, ast.Match)
_JS_FUNCTION = re.compile(r"\b(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)")
_BAD_NAMES = {"foo", "bar", "baz", "temp", "tmp", "stuff", "thing", "data1", "var1"}


def _finding(category: str, rule: str, line: int, message: str, lines: List[str],
             severity: str = "MEDIUM", confidence: str = "HIGH", end_line: int = None,
             suggestion: str = "") -> Dict[str, Any]:
    evidence = lines[line - 1].strip()[:160] if 0 < line <= len(lines) else ""
    return {
        "id": f"{rule}:{line}", "category": category, "rule": rule,
        "line": line, "end_line": end_line or line, "message": message,
        "evidence": evidence, "confidence": confidence, "severity": severity,
        "suggestion": suggestion, "auto_fixable": False,
    }


def _complexity(node: ast.AST) -> int:
    score = 1

    def visit(current: ast.AST) -> None:
        nonlocal score
        if current is not node and isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            return
        if isinstance(current, _BRANCH):
            score += 1
        elif isinstance(current, ast.BoolOp):
            score += max(0, len(current.values) - 1)
        elif isinstance(current, ast.comprehension):
            score += len(current.ifs)
        for child in ast.iter_child_nodes(current):
            visit(child)

    for child in ast.iter_child_nodes(node):
        visit(child)
    return score


def _nesting(node: ast.AST, depth: int = 0) -> int:
    maximum = depth
    for child in ast.iter_child_nodes(node):
        if child is not node and isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            continue
        next_depth = depth + 1 if isinstance(child, _CONTROL) else depth
        maximum = max(maximum, _nesting(child, next_depth))
    return maximum


def _python_functions(content: str, lines: List[str], limits: Dict[str, int]) -> Tuple[List[Dict[str, Any]], Dict[str, int], bool]:
    findings: List[Dict[str, Any]] = []
    metrics = {"function_count": 0, "max_function_lines": 0, "max_complexity": 0, "max_nesting": 0}
    try:
        tree = ast.parse(content, type_comments=True)
    except SyntaxError:
        return findings, metrics, False
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            metrics["function_count"] += 1
            span = (node.end_lineno or node.lineno) - node.lineno + 1
            complexity = _complexity(node)
            nesting = _nesting(node)
            metrics["max_function_lines"] = max(metrics["max_function_lines"], span)
            metrics["max_complexity"] = max(metrics["max_complexity"], complexity)
            metrics["max_nesting"] = max(metrics["max_nesting"], nesting)
            if span > limits["function"]:
                findings.append(_finding("complexity", "long_function", node.lineno,
                    f"Function {node.name} spans {span} lines (threshold {limits['function']}).", lines,
                    end_line=node.end_lineno, suggestion="Split cohesive responsibilities without changing the signature."))
            if complexity > limits["complexity"]:
                findings.append(_finding("complexity", "branch_complexity", node.lineno,
                    f"Function {node.name} has estimated cyclomatic complexity {complexity}.", lines,
                    end_line=node.end_lineno, suggestion="Extract independent branches or simplify conditions."))
            if nesting > limits["nesting"]:
                findings.append(_finding("control-flow", "deep_nesting", node.lineno,
                    f"Function {node.name} reaches {nesting} nested control levels.", lines,
                    end_line=node.end_lineno, suggestion="Use guard clauses where behavior permits."))
            if node.name in _BAD_NAMES or (len(node.name) == 1 and node.name not in {"i", "j", "k"}):
                findings.append(_finding("naming", "vague_name", node.lineno,
                    f"Function name {node.name!r} does not describe its role.", lines, "LOW",
                    suggestion="Choose a name that describes the function's effect."))
            if not node.name.startswith("_") and not re.fullmatch(r"[a-z][a-z0-9_]*", node.name):
                findings.append(_finding("naming", "nonstandard_function_name", node.lineno,
                    f"Public function {node.name!r} differs from Python snake_case convention.", lines,
                    "LOW", suggestion="Consider renaming only after checking callers and public API impact."))
        elif isinstance(node, ast.ClassDef):
            method_count = sum(isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) for child in node.body)
            if method_count > 12:
                findings.append(_finding("abstraction", "large_class", node.lineno,
                    f"Class {node.name} has {method_count} methods.", lines, "MEDIUM",
                    suggestion="Review whether the class has separable responsibilities."))
            if not re.fullmatch(r"[A-Z][A-Za-z0-9]*", node.name):
                findings.append(_finding("naming", "nonstandard_class_name", node.lineno,
                    f"Class {node.name!r} differs from Python CapWords convention.", lines, "LOW",
                    suggestion="Review callers before any rename."))
    if metrics["function_count"] > 25:
        findings.append(_finding("abstraction", "crowded_module", 1,
            f"Module defines {metrics['function_count']} functions or methods.", lines, "LOW", "MEDIUM",
            suggestion="Review whether responsibilities should be split."))
    return findings, metrics, True


def _js_functions(content: str, lines: List[str], limits: Dict[str, int]) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    findings: List[Dict[str, Any]] = []
    metrics = {"function_count": 0, "max_function_lines": 0, "max_complexity": 0, "max_nesting": 0}
    for match in _JS_FUNCTION.finditer(content):
        name = match.group(1) or match.group(2)
        line = content.count("\n", 0, match.start()) + 1
        metrics["function_count"] += 1
        if name in _BAD_NAMES:
            findings.append(_finding("naming", "vague_name", line,
                f"Function name {name!r} does not describe its role.", lines, "LOW", "MEDIUM",
                suggestion="Choose a more descriptive name after checking callers."))
    # Braces and keywords are only estimates for JS/TS; do not claim parser precision.
    depth = 0
    for index, text in enumerate(lines, 1):
        depth = max(0, depth + text.count("{") - text.count("}"))
        metrics["max_nesting"] = max(metrics["max_nesting"], depth)
        if depth > limits["nesting"] + 2 and len(findings) < 30:
            findings.append(_finding("control-flow", "deep_brace_nesting", index,
                f"Brace nesting reaches approximately {depth} levels.", lines, "LOW", "LOW",
                suggestion="Review nested control flow; this is a lexical estimate."))
            break
    return findings, metrics


def _duplicates(lines: List[str], minimum: int) -> List[Tuple[int, int, int]]:
    normalized = [re.sub(r"\s+", " ", line.strip()) for line in lines]
    seen: Dict[Tuple[str, ...], int] = {}
    duplicates = []
    for start in range(len(lines) - minimum + 1):
        block = tuple(normalized[start:start + minimum])
        if any(not part or part in {"{", "}", "else:", "return"} for part in block):
            continue
        prior = seen.get(block)
        if prior is not None and start - prior >= minimum:
            duplicates.append((prior + 1, start + 1, minimum))
            if len(duplicates) >= 10:
                break
        else:
            seen[block] = start
    return duplicates


def analyze_content(path: str, content: str, language: str, mode: str = "Balanced") -> Dict[str, Any]:
    if mode not in THRESHOLDS:
        raise ValueError("Mode must be Conservative, Balanced, or Aggressive.")
    limits = THRESHOLDS[mode]
    lines = content.replace("\r\n", "\n").splitlines()
    findings: List[Dict[str, Any]] = []
    comment_prefix = "#" if language == "python" else "//"
    blank_count = sum(not line.strip() for line in lines)
    comment_count = sum(line.lstrip().startswith(comment_prefix) for line in lines)
    long_lines = [i for i, line in enumerate(lines, 1) if len(line.expandtabs(4)) > limits["line"]]
    for line in long_lines[:10]:
        findings.append(_finding("readability", "long_line", line,
            f"Line is {len(lines[line - 1].expandtabs(4))} characters (threshold {limits['line']}).", lines,
            "LOW", suggestion="Wrap the expression without changing behavior."))
    for index, line in enumerate(lines, 1):
        if re.search(r"\b(?:TODO|FIXME|HACK)\b", line, re.IGNORECASE) and line.lstrip().startswith(comment_prefix):
            findings.append(_finding("comments", "unresolved_comment", index,
                "Comment marks unfinished or fragile work.", lines, "LOW", "MEDIUM",
                suggestion="Resolve the issue or add a tracked explanation."))
            if sum(f["rule"] == "unresolved_comment" for f in findings) >= 10:
                break
    code_lines = max(0, len(lines) - blank_count - comment_count)
    if code_lines > 80 and comment_count / max(code_lines, 1) < 0.02:
        findings.append(_finding("comments", "sparse_comments", 1,
            "Large file has few explanatory comments; review non-obvious decisions.", lines,
            "LOW", "LOW", suggestion="Document intent where behavior is not obvious."))
    if language == "python":
        semantic, semantic_metrics, parsed = _python_functions(content, lines, limits)
        findings.extend(semantic)
    elif language in {"javascript", "typescript", "jsx", "tsx"}:
        semantic, semantic_metrics = _js_functions(content, lines, limits)
        parsed = False
        findings.extend(semantic)
    else:
        semantic_metrics = {"function_count": 0, "max_function_lines": 0, "max_complexity": 0, "max_nesting": 0}
        parsed = False
    duplicate_blocks = _duplicates(lines, limits["duplicate"]) if language in CODE_LANGUAGES else []
    for first, second, span in duplicate_blocks:
        findings.append(_finding("duplication", "repeated_block", second,
            f"{span}-line block repeats content near line {first}.", lines,
            "MEDIUM", "MEDIUM", second + span - 1,
            "Review whether a shared helper would reduce repetition without obscuring intent."))
    if not parsed and language == "python":
        findings.append(_finding("readability", "parse_unavailable", 1,
            "Python syntax could not be parsed; structural metrics are unavailable.", lines,
            "LOW", "HIGH", suggestion="Check syntax before refactoring."))
    findings.sort(key=lambda item: (item["line"], item["rule"]))
    penalty = sum({"LOW": 2, "MEDIUM": 5, "HIGH": 9}[item["severity"]] for item in findings)
    metrics = {
        "total_lines": len(lines), "code_lines": code_lines, "blank_lines": blank_count,
        "comment_lines": comment_count, "comment_ratio": round(comment_count / max(code_lines, 1), 3),
        "average_line_length": round(sum(len(line) for line in lines) / max(len(lines), 1), 1),
        "max_line_length": max((len(line) for line in lines), default=0),
        "long_line_count": len(long_lines), "duplicate_block_count": len(duplicate_blocks),
        "maintainability_score": max(0, 100 - penalty), "parser_verified": parsed,
        **semantic_metrics,
    }
    return {"path": path, "language": language, "mode": mode,
            "source_sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
            "metrics": metrics, "findings": findings[:100], "finding_count": len(findings)}
