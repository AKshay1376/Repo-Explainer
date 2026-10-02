"""Narrow patch producers. Unsupported planner work remains manual."""

import ast
import io
import keyword
import tokenize
from pathlib import Path

from humanize.transforms import deterministic_candidates
from source_service import detect_language
from .diff_utils import digest, make_hunks
from .models import PatchFile
from .validator import readable_text, safe_target, syntax_check


def build_file(root: Path, path: str, proposed: str, reason: str,
               risk: str = "LOW", public_api_change: bool = False) -> PatchFile:
    target = safe_target(root, path)
    before_bytes = target.read_bytes()
    before = readable_text(path, before_bytes)
    if not isinstance(proposed, str) or len(proposed.encode("utf-8")) > 1_000_000:
        raise ValueError("Proposed source must be bounded UTF-8 text.")
    if before == proposed:
        raise ValueError("The selected transformation makes no change.")
    check = syntax_check(path, proposed)
    if check["state"] == "FAILED":
        raise ValueError(check["output_summary"])
    proposed_bytes = proposed.encode("utf-8")
    readable_text(path, proposed_bytes)
    hunks = make_hunks(before, proposed, reason)
    if not hunks:
        raise ValueError("No reviewable line change was produced.")
    return PatchFile(path, digest(before_bytes), digest(proposed_bytes), hunks,
                     risk_level=risk, public_api_change=public_api_change,
                     original_bytes=before_bytes, proposed_bytes=proposed_bytes)


def humanize_file(root: Path, path: str, suggestion_id: str) -> PatchFile:
    before = readable_text(path, safe_target(root, path).read_bytes())
    candidates = deterministic_candidates(before, detect_language(path))
    candidate = next((item for item in candidates if item["id"] == suggestion_id), None)
    if candidate is None:
        raise ValueError("This Humanize suggestion is unavailable for the current local source.")
    return build_file(root, path, candidate["proposed"], candidate["description"])


def selected_range(root: Path, path: str, start: int, end: int,
                   transformation: str, replacement: str = "") -> PatchFile:
    before = readable_text(path, safe_target(root, path).read_bytes())
    lines = before.splitlines(keepends=True)
    if not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start or end > len(lines):
        raise ValueError("Select a valid source line range.")
    proposed_lines = list(lines)
    risk = "LOW"
    if transformation == "trim_trailing_whitespace":
        # Delegate the Python string and AST safety checks to Humanize.
        candidate = next((item for item in deterministic_candidates(before, detect_language(path))
                          if item["id"] == "trailing_whitespace"), None)
        if candidate is None:
            raise ValueError("Safe whitespace cleanup is unavailable for this file.")
        cleaned = candidate["proposed"].splitlines(keepends=True)
        proposed_lines[start - 1:end] = cleaned[start - 1:end]
    elif transformation == "replace_range":
        if not isinstance(replacement, str) or len(replacement) > 20_000:
            raise ValueError("Replacement text is too large.")
        proposed_lines[start - 1:end] = replacement.splitlines(keepends=True)
        risk = "HIGH"
    else:
        raise ValueError("Unsupported selected-range transformation.")
    return build_file(root, path, "".join(proposed_lines), f"Selected lines {start}-{end}: {transformation}", risk,
                      public_api_change=(transformation == "replace_range"))


def _private_python_rename(before: str, old: str, new: str) -> str:
    if not old.isidentifier() or not new.isidentifier() or keyword.iskeyword(new) or not old.startswith("_"):
        raise ValueError("Only private Python identifiers can be previewed automatically.")
    tree = ast.parse(before)
    definitions = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == old]
    if len(definitions) != 1:
        raise ValueError("Planner rename requires one module-level private function definition.")
    if any(node is not definitions[0] and isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
           and node.name == old for node in ast.walk(tree)):
        raise ValueError("Shadowed definitions need manual review.")
    if any(isinstance(node, (ast.Name, ast.arg, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and
           (getattr(node, "id", None) == new or getattr(node, "arg", None) == new or getattr(node, "name", None) == new)
           for node in ast.walk(tree)):
        raise ValueError("Destination identifier already exists in the module.")
    if any(isinstance(node, (ast.Attribute, ast.Global, ast.Nonlocal)) and
           (getattr(node, "attr", None) == old or old in getattr(node, "names", [])) for node in ast.walk(tree)):
        raise ValueError("Dynamic or external references need manual review.")
    if any(isinstance(node, ast.Name) and node.id == old and not isinstance(node.ctx, ast.Load)
           for node in ast.walk(tree)) or any(isinstance(node, ast.arg) and node.arg == old for node in ast.walk(tree)):
        raise ValueError("Shadowed or rebound symbols need manual review.")
    if any(isinstance(node, (ast.Import, ast.ImportFrom)) and any(
           alias.asname == old or alias.name == old for alias in node.names) for node in ast.walk(tree)):
        raise ValueError("Imported names need manual review.")
    if any(isinstance(node, ast.keyword) and node.arg == old for node in ast.walk(tree)):
        raise ValueError("Keyword references need manual review.")
    if any(isinstance(node, ast.Constant) and isinstance(node.value, str) and old in node.value
           for node in ast.walk(tree)):
        raise ValueError("String-based references need manual review.")
    # A global token rename would also change strings/comments. Tokenize confines it to identifiers.
    tokens = list(tokenize.generate_tokens(io.StringIO(before).readline))
    rewritten = [token._replace(string=new) if token.type == tokenize.NAME and token.string == old else token
                 for token in tokens]
    proposed = tokenize.untokenize(rewritten)
    if not any(token.type == tokenize.NAME and token.string == old for token in tokens):
        raise ValueError("No resolvable symbol references were found.")
    ast.parse(proposed)
    return proposed


def planner_file(root: Path, plan: dict, step_id: str) -> PatchFile:
    if not isinstance(plan, dict) or plan.get("plan_type") != "rename_symbol" or step_id != "definition":
        raise ValueError("This plan step requires manual implementation.")
    path = str(plan.get("target", "")).split("::", 1)[0]
    symbol = str(plan.get("target", "")).split("::", 1)[-1]
    destination = plan.get("destination")
    if not isinstance(destination, str) or not destination.isidentifier():
        raise ValueError("A valid destination symbol is required.")
    if len(plan.get("affected_files") or []) > 1 or plan.get("affected_routes") or plan.get("affected_models"):
        raise ValueError("Cross-file or public contract changes require manual implementation.")
    before = readable_text(path, safe_target(root, path).read_bytes())
    proposed = _private_python_rename(before, symbol, destination)
    return build_file(root, path, proposed, f"Planner step {step_id}: private local rename", "MEDIUM")
