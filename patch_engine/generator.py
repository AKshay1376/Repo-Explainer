"""Narrow patch producers. Unsupported planner work remains manual."""

import ast
import io
import keyword
import re
import tokenize
from pathlib import Path

from humanize.transforms import deterministic_candidates
from source_service import detect_language
from .diff_utils import digest, make_hunks
from .models import PatchFile, PatchHunk
from .validator import readable_text, safe_path, safe_target, syntax_check


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
    if any(isinstance(node, ast.Call) and (
        isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec", "globals", "locals", "getattr", "setattr", "__import__"} or
        isinstance(node.func, ast.Attribute) and node.func.attr in {"import_module", "getattr", "setattr"})
        for node in ast.walk(tree)):
        raise ValueError("Reflective or dynamic references need manual review.")
    # A global token rename would also change strings/comments. Tokenize confines it to identifiers.
    tokens = list(tokenize.generate_tokens(io.StringIO(before).readline))
    rewritten = [token._replace(string=new) if token.type == tokenize.NAME and token.string == old else token
                 for token in tokens]
    proposed = tokenize.untokenize(rewritten)
    if not any(token.type == tokenize.NAME and token.string == old for token in tokens):
        raise ValueError("No resolvable symbol references were found.")
    ast.parse(proposed)
    return proposed


def create_file(root: Path, path: str, content: str, reason: str) -> PatchFile:
    safe_path(root, path, must_exist=False)
    raw = content.encode("utf-8")
    readable_text(path, raw)
    if syntax_check(path, content)["state"] == "FAILED": raise ValueError("New file has invalid syntax.")
    return PatchFile(path, digest(b""), digest(raw), make_hunks("", content, reason),
                     risk_level="MEDIUM", original_bytes=b"", proposed_bytes=raw,
                     operation="create", destination_path=path)


def delete_file(root: Path, path: str, reason: str) -> PatchFile:
    raw = safe_target(root, path).read_bytes()
    before = readable_text(path, raw)
    return PatchFile(path, digest(raw), digest(b""), make_hunks(before, "", reason),
                     risk_level="HIGH", original_bytes=raw, proposed_bytes=b"",
                     operation="delete", source_path=path)


def _module_name(root: Path, path: str) -> str:
    parts = Path(path).with_suffix("").parts
    if not path.endswith(".py") or not parts or parts[-1] == "__init__":
        raise ValueError("Verified moves support ordinary Python modules only.")
    current = root
    for part in parts[:-1]:
        current /= part
        if not (current / "__init__.py").is_file():
            raise ValueError("Moved modules must remain inside explicit Python packages.")
    return ".".join(parts)


def move_python_file(root: Path, source: str, destination: str) -> list[PatchFile]:
    old_module = _module_name(root, source)
    new_module = _module_name(root, destination)
    target = safe_target(root, source)
    safe_path(root, destination, must_exist=False)
    raw = target.read_bytes()
    before = readable_text(source, raw)
    tree = ast.parse(before)
    if any(isinstance(node, ast.ImportFrom) and node.level for node in ast.walk(tree)):
        raise ValueError("Relative imports in the moved module need manual review.")
    # Scan all local Python files, including tests, for ambiguous references.
    rewrites = []
    candidates = [p for p in root.rglob("*.py") if not {".git", ".repo-explainer", "node_modules", ".venv", "venv", "build", "dist"}.intersection(p.relative_to(root).parts)]
    if len(candidates) > 2000: raise ValueError("Repository is too large for verified import coverage.")
    for candidate in candidates:
        if candidate.is_symlink() or not candidate.is_file(): raise ValueError("Symlinked Python source needs manual review.")
        relative = candidate.relative_to(root).as_posix()
        if relative == source: continue
        content = readable_text(relative, candidate.read_bytes())
        for candidate_line in content.splitlines():
            if source in candidate_line or (old_module in candidate_line and not re.match(
                r"^\s*from\s+" + re.escape(old_module) + r"\s+import\b", candidate_line)):
                raise ValueError("Path or dynamic module references need manual review.")
        parsed = ast.parse(content)
        edits = []
        for node in ast.walk(parsed):
            if isinstance(node, ast.ImportFrom) and node.module == old_module and node.level == 0:
                line = content.splitlines(keepends=True)[node.lineno - 1]
                match = re.match(r"(\s*from\s+)" + re.escape(old_module) + r"(\s+import\b)", line)
                if not match: raise ValueError("Complex import formatting needs manual review.")
                edits.append((node.lineno - 1, match.group(1) + new_module + match.group(2) + line[match.end():]))
            elif isinstance(node, ast.Import) and any(alias.name == old_module for alias in node.names):
                raise ValueError("Bare module imports need manual reference resolution.")
            elif isinstance(node, ast.ImportFrom) and node.module and node.module.startswith(old_module + "."):
                raise ValueError("Nested module imports need manual review.")
        if edits:
            lines = content.splitlines(keepends=True)
            for number, value in edits: lines[number] = value
            rewrites.append(build_file(root, relative, "".join(lines), "Rewrite resolved Python import after module move", "MEDIUM"))
    move = PatchFile(source, digest(raw), digest(raw),
        [PatchHunk("move", 1, 0, 1, 0, [], [], f"Move {source} to {destination}")],
        risk_level="HIGH", original_bytes=raw, proposed_bytes=raw, operation="move",
        source_path=source, destination_path=destination)
    return [move, *rewrites]


def move_python_module_group(root: Path, moves: list[dict]) -> list[PatchFile]:
    """One bounded, all-or-nothing group of ordinary Python modules."""
    if not isinstance(moves, list) or not 1 <= len(moves) <= 10 or any(
        not isinstance(item, dict) or not isinstance(item.get("source"), str) or
        not isinstance(item.get("destination"), str) for item in moves):
        raise ValueError("Choose 1 to 10 explicit Python file moves.")
    mapping = {}
    raw_sources = {}
    destinations = set()
    for item in moves:
        source, destination = item["source"], item["destination"]
        old_module, new_module = _module_name(root, source), _module_name(root, destination)
        safe_path(root, destination, must_exist=False)
        if source in raw_sources or destination in destinations or source == destination:
            raise ValueError("Module move paths must be unique and non-overlapping.")
        raw = safe_target(root, source).read_bytes()
        ast.parse(readable_text(source, raw))
        mapping[old_module] = new_module
        raw_sources[source] = raw
        destinations.add(destination)
    candidates = [p for p in root.rglob("*.py") if not {".git", ".repo-explainer", "node_modules", ".venv", "venv", "build", "dist"}.intersection(p.relative_to(root).parts)]
    if len(candidates) > 2000: raise ValueError("Repository is too large for verified import coverage.")
    proposals = {}
    for candidate in candidates:
        if candidate.is_symlink(): raise ValueError("Symlinked Python source needs manual review.")
        relative = candidate.relative_to(root).as_posix()
        before = readable_text(relative, candidate.read_bytes())
        tree = ast.parse(before)
        if relative in raw_sources and any(isinstance(node, ast.ImportFrom) and node.level for node in ast.walk(tree)):
            raise ValueError("Relative imports in moved modules need manual review.")
        lines = before.splitlines(keepends=True)
        for index, line in enumerate(lines):
            for old_module, new_module in mapping.items():
                if old_module not in line: continue
                match = re.match(r"(\s*from\s+)" + re.escape(old_module) + r"(\s+import\b)", line)
                if not match:
                    raise ValueError("Dynamic or non-import module references need manual review.")
                lines[index] = match.group(1) + new_module + match.group(2) + line[match.end():]
                line = lines[index]
            if any(item["source"] in line for item in moves):
                raise ValueError("Path references need manual review.")
        proposed = "".join(lines)
        if proposed != before: proposals[relative] = proposed
    files = []
    for item in moves:
        source, destination = item["source"], item["destination"]
        raw = raw_sources[source]
        after = proposals.pop(source, raw.decode("utf-8")).encode("utf-8")
        files.append(PatchFile(source, digest(raw), digest(after),
            [PatchHunk("move", 1, 0, 1, 0, [], [], f"Move {source} to {destination}")],
            risk_level="HIGH", original_bytes=raw, proposed_bytes=after, operation="move",
            source_path=source, destination_path=destination))
    files.extend(build_file(root, path, proposed, "Rewrite resolved Python imports for module group", "MEDIUM")
                 for path, proposed in sorted(proposals.items()))
    return files


def compatibility_reexport(root: Path, source: str, destination: str) -> list[PatchFile]:
    files = move_python_file(root, source, destination)
    before = files[0].original_bytes.decode("utf-8")
    tree = ast.parse(before)
    names = [node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
             and not node.name.startswith("_")]
    if not names or any(isinstance(node, (ast.ImportFrom, ast.Import)) for node in tree.body):
        raise ValueError("Compatibility re-export needs simple explicit public definitions.")
    new_module = _module_name(root, destination)
    shim = ("# Temporary compatibility re-export; remove after callers migrate.\n"
            f"from {new_module} import {', '.join(names)}\n")
    created = create_file(root, destination, before, "Move implementation with compatibility re-export")
    modified = build_file(root, source, shim, "Compatibility re-export from old module", "HIGH", True)
    modified.confidence = "MEDIUM"
    modified.patch_support = "Preview Only"
    return [created, modified, *files[1:]]


def import_consolidation(root: Path, path: str) -> PatchFile:
    before = readable_text(path, safe_target(root, path).read_bytes())
    tree = ast.parse(before) if path.endswith(".py") else None
    if tree is None: raise ValueError("Verified import consolidation currently supports Python only.")
    lines = before.splitlines(keepends=True)
    changes = {}
    previous = None
    for node in tree.body:
        if not isinstance(node, ast.ImportFrom) or node.level or node.module is None or node.lineno != node.end_lineno:
            previous = None
            continue
        line = lines[node.lineno - 1]
        if not re.fullmatch(r"from\s+[\w.]+\s+import\s+[\w, ]+\s*\n?", line) or any(alias.asname or alias.name == "*" for alias in node.names):
            previous = None
            continue
        if previous and previous.module == node.module and previous.end_lineno + 1 == node.lineno:
            names = [alias.name for alias in previous.names] + [alias.name for alias in node.names]
            if len(set(names)) != len(names): raise ValueError("Duplicate imported bindings need manual review.")
            changes[previous.lineno - 1] = f"from {node.module} import {', '.join(names)}\n"
            changes[node.lineno - 1] = ""
            previous = None
        else:
            previous = node
    if not changes: raise ValueError("No adjacent simple imports can be consolidated safely.")
    for index, value in changes.items(): lines[index] = value
    return build_file(root, path, "".join(lines), "Consolidate adjacent resolved imports")


def compatibility_wrapper(root: Path, path: str, old: str, new: str) -> PatchFile:
    if not old.isidentifier() or not new.isidentifier() or keyword.iskeyword(old) or old == new:
        raise ValueError("Wrapper names must be distinct Python identifiers.")
    before = readable_text(path, safe_target(root, path).read_bytes())
    tree = ast.parse(before)
    target = next((node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == new), None)
    if target is None or any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == old for node in tree.body):
        raise ValueError("Wrapper requires one existing target and an unused old name.")
    args = target.args
    if args.posonlyargs or args.kwonlyargs or args.vararg or args.kwarg or args.defaults or args.kw_defaults or target.decorator_list or target.returns or any(arg.annotation for arg in args.args):
        raise ValueError("Only undecorated simple signatures support a verified wrapper.")
    names = [arg.arg for arg in args.args]
    if any(not name.isidentifier() for name in names): raise ValueError("Wrapper signature is unsupported.")
    wrapper = f"\ndef {old}({', '.join(names)}):\n    return {new}({', '.join(names)})\n"
    return build_file(root, path, before.rstrip("\n") + "\n" + wrapper,
                      "Temporary compatibility wrapper delegating to known target", "HIGH", True)


def extract_pure_assignment(root: Path, path: str, function: str, line: int, helper: str) -> PatchFile:
    if not path.endswith(".py") or not helper.isidentifier() or not helper.startswith("_") or keyword.iskeyword(helper):
        raise ValueError("Helper extraction requires a private Python helper name.")
    before = readable_text(path, safe_target(root, path).read_bytes())
    tree = ast.parse(before)
    if any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == helper for node in ast.walk(tree)):
        raise ValueError("Helper name already exists.")
    owner = next((node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == function), None)
    if owner is None or owner.decorator_list or any(isinstance(node, (ast.Global, ast.Nonlocal)) for node in ast.walk(owner)):
        raise ValueError("Selected function has unsupported scope behavior.")
    stmt = next((node for node in owner.body if node.lineno == line), None)
    if not isinstance(stmt, ast.Assign) or stmt.end_lineno != line or len(stmt.targets) != 1 or not isinstance(stmt.targets[0], ast.Name):
        raise ValueError("Select one direct, single-line assignment for narrow extraction.")
    allowed = (ast.BinOp, ast.UnaryOp, ast.Name, ast.Load, ast.Constant, ast.Add, ast.Sub, ast.Mult,
               ast.Div, ast.FloorDiv, ast.Mod, ast.Pow, ast.UAdd, ast.USub)
    if any(not isinstance(node, allowed) for node in ast.walk(stmt.value)):
        raise ValueError("Expression has calls, control flow, or side effects; manual extraction required.")
    inputs = sorted({node.id for node in ast.walk(stmt.value) if isinstance(node, ast.Name)})
    if stmt.targets[0].id in inputs: raise ValueError("Self-referential assignments need manual review.")
    lines = before.splitlines(keepends=True)
    original = lines[line - 1]
    expression = ast.get_source_segment(before, stmt.value)
    if not expression or not original.startswith(" " * stmt.col_offset): raise ValueError("Assignment formatting is unsupported.")
    helper_code = f"def {helper}({', '.join(inputs)}):\n    return {expression}\n\n"
    lines[line - 1] = " " * stmt.col_offset + f"{stmt.targets[0].id} = {helper}({', '.join(inputs)})\n"
    lines.insert(owner.lineno - 1, helper_code)
    return build_file(root, path, "".join(lines), "Extract one pure assignment into a private helper", "MEDIUM")


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
    candidates = [candidate for candidate in root.rglob("*.py") if not {".git", ".repo-explainer", ".venv", "venv", "node_modules", "build", "dist"}.intersection(candidate.relative_to(root).parts)]
    if len(candidates) > 2000:
        raise ValueError("Repository is too large for verified private-reference coverage.")
    for candidate in candidates:
        if candidate.relative_to(root).as_posix() == path: continue
        if candidate.is_symlink(): raise ValueError("Symlinked Python sources need manual review.")
        content = readable_text(candidate.relative_to(root).as_posix(), candidate.read_bytes())
        if re.search(r"\b" + re.escape(symbol) + r"\b", content):
            raise ValueError("Cross-file private references need manual review.")
    proposed = _private_python_rename(before, symbol, destination)
    return build_file(root, path, proposed, f"Planner step {step_id}: private local rename", "MEDIUM")
