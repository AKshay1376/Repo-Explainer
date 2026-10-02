"""Preview-only deterministic edits; no repository write or code execution."""

import ast
import difflib
import io
import tokenize
from typing import Any, Dict, List, Optional, Set


def make_patch(path: str, before: str, after: str) -> str:
    if before == after:
        return ""
    return "".join(difflib.unified_diff(
        before.splitlines(keepends=True), after.splitlines(keepends=True),
        fromfile=f"a/{path}", tofile=f"b/{path}", n=3,
    ))


def _ast_equivalent(before: str, after: str) -> bool:
    try:
        return ast.dump(ast.parse(before, type_comments=True)) == ast.dump(ast.parse(after, type_comments=True))
    except SyntaxError:
        return False


def _multiline_string_lines(content: str) -> Optional[Set[int]]:
    protected: Set[int] = set()
    try:
        for token in tokenize.generate_tokens(io.StringIO(content).readline):
            if token.type == tokenize.STRING and token.start[0] < token.end[0]:
                protected.update(range(token.start[0], token.end[0] + 1))
    except (tokenize.TokenError, IndentationError):
        return None
    return protected


def _trim_python_whitespace(content: str) -> Optional[str]:
    protected = _multiline_string_lines(content)
    if protected is None:
        return None
    changed = []
    for index, raw in enumerate(content.splitlines(keepends=True), 1):
        body = raw.rstrip("\r\n")
        ending = raw[len(body):]
        changed.append((body if index in protected else body.rstrip(" \t")) + ending)
    result = "".join(changed)
    return result if result != content and _ast_equivalent(content, result) else None


def _collapse_python_blank_lines(content: str) -> Optional[str]:
    protected = _multiline_string_lines(content)
    if protected is None:
        return None
    result: List[str] = []
    consecutive = 0
    for index, raw in enumerate(content.splitlines(keepends=True), 1):
        blank = not raw.strip()
        if blank and index not in protected:
            consecutive += 1
            if consecutive > 2:
                continue
        else:
            consecutive = 0
        result.append(raw)
    proposed = "".join(result)
    return proposed if proposed != content and _ast_equivalent(content, proposed) else None


def deterministic_candidates(content: str, language: str) -> List[Dict[str, Any]]:
    """Return verified proposed content for the central patch engine and previews."""
    candidates = []
    if content and not content.endswith("\n"):
        proposed = content + "\n"
        if language != "python" or _ast_equivalent(content, proposed):
            candidates.append(("final_newline", "Add final newline", "Normalize end of file.", proposed))
    if language == "python":
        trimmed = _trim_python_whitespace(content)
        if trimmed is not None:
            candidates.append(("trailing_whitespace", "Trim trailing whitespace", "Remove whitespace outside multiline strings; Python AST remains identical.", trimmed))
        collapsed = _collapse_python_blank_lines(content)
        if collapsed is not None:
            candidates.append(("blank_lines", "Limit consecutive blank lines", "Keep at most two blank lines outside multiline strings; Python AST remains identical.", collapsed))
    return [{
        "id": identifier, "title": title, "description": description,
        "proposed": proposed, "risk_level": "LOW",
        "preserves_public_api": True, "preview_only": True,
    } for identifier, title, description, proposed in candidates if proposed != content]


def deterministic_previews(path: str, content: str, language: str) -> List[Dict[str, Any]]:
    """Compatibility preview; patch generation uses the same candidate source."""
    return [{**{key: value for key, value in candidate.items() if key != "proposed"},
             "patch": make_patch(path, content, candidate["proposed"])}
            for candidate in deterministic_candidates(content, language)]
