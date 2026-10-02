"""
repo_intelligence/resolver.py
Dependency graph resolution, relative path matching, TypeScript alias resolution,
and reverse dependent computation.
"""

import json
import os
import posixpath
import re
from typing import Dict, List, Optional, Tuple, Set
from repo_intelligence.models import DependencyEdge, FileModel

# Extensions to probe when resolving extensionless imports
CODE_EXTENSIONS = [
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py",
    "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/__init__.py"
]


def parse_tsconfig_paths(tsconfig_content: str) -> Dict[str, List[str]]:
    """Parse tsconfig.json compilerOptions.paths aliases."""
    if not tsconfig_content:
        return {}
    try:
        # Strip simple comments before JSON parsing
        clean_json = re.sub(r"//.*?\n|/\*.*?\*/", "", tsconfig_content, flags=re.S)
        data = json.loads(clean_json)
        paths = data.get("compilerOptions", {}).get("paths", {})
        return paths
    except Exception:
        return {}


def resolve_import_path(
    import_specifier: str,
    source_path: str,
    file_tree_set: Set[str],
    ts_paths: Optional[Dict[str, List[str]]] = None
) -> Optional[str]:
    """
    Resolve an import specifier (relative, alias, or python module)
    to a concrete file path in file_tree_set.
    """
    spec = import_specifier.strip().strip("'\"")
    if not spec:
        return None

    norm_source = source_path.replace("\\", "/")
    source_dir = posixpath.dirname(norm_source)

    # 1. Relative imports: starts with ./ or ../
    if spec.startswith("./") or spec.startswith("../"):
        candidate_base = posixpath.normpath(posixpath.join(source_dir, spec))
        # Direct match (e.g. './style.css')
        if candidate_base in file_tree_set:
            return candidate_base
        # Probe code extensions
        for ext in CODE_EXTENSIONS:
            cand = candidate_base + ext
            if cand in file_tree_set:
                return cand
        return None

    # 2. TypeScript Path Aliases (e.g. @/* -> src/*)
    if ts_paths:
        for alias_pattern, target_patterns in ts_paths.items():
            if alias_pattern.endswith("/*") and spec.startswith(alias_pattern[:-2]):
                sub_path = spec[len(alias_pattern) - 2:]  # the '*' part
                for target_pat in target_patterns:
                    clean_target = target_pat.replace("/*", "")
                    candidate_base = posixpath.normpath(posixpath.join(clean_target, sub_path.lstrip("/")))
                    if candidate_base in file_tree_set:
                        return candidate_base
                    for ext in CODE_EXTENSIONS:
                        cand = candidate_base + ext
                        if cand in file_tree_set:
                            return cand
            elif alias_pattern == spec:
                for target_pat in target_patterns:
                    candidate_base = posixpath.normpath(target_pat)
                    if candidate_base in file_tree_set:
                        return candidate_base
                    for ext in CODE_EXTENSIONS:
                        cand = candidate_base + ext
                        if cand in file_tree_set:
                            return cand

    # 3. Python-style module imports: 'job_posting.crew' -> 'job_posting/crew.py'
    if "." in spec and not spec.startswith("."):
        as_path = spec.replace(".", "/")
        # check direct as_path.py
        if f"{as_path}.py" in file_tree_set:
            return f"{as_path}.py"
        # check src/as_path.py
        if f"src/{as_path}.py" in file_tree_set:
            return f"src/{as_path}.py"
        # check as_path/__init__.py
        if f"{as_path}/__init__.py" in file_tree_set:
            return f"{as_path}/__init__.py"

    # 4. Check if spec matches top-level source path directly (e.g. 'src/utils')
    for ext in CODE_EXTENSIONS:
        cand = spec + ext
        if cand in file_tree_set:
            return cand
        cand_src = f"src/{spec}{ext}"
        if cand_src in file_tree_set:
            return cand_src

    return None


def determine_edge_relationship(source_file: FileModel, target_file: FileModel) -> str:
    """Infer architectural relationship between source and target files."""
    s_cat = source_file.category
    t_cat = target_file.category

    if s_cat in ("frontend-component", "frontend-page") and t_cat == "service":
        return "component -> service"
    if s_cat == "backend-route" and t_cat == "controller":
        return "route -> controller"
    if s_cat == "controller" and t_cat == "service":
        return "controller -> service"
    if s_cat == "service" and t_cat == "model":
        return "service -> model"
    if s_cat in ("frontend-component", "frontend-page") and t_cat == "frontend-component":
        return "renders"

    return "imports"


def resolve_repository_dependencies(
    files: Dict[str, FileModel],
    file_tree: List[str],
    tsconfig_content: Optional[str] = None
) -> List[DependencyEdge]:
    """
    Resolve imports for all files, populate dependencies & reverse dependents (used_by),
    and construct validated DependencyEdge records.
    """
    file_tree_set = set(f.replace("\\", "/") for f in file_tree)
    ts_paths = parse_tsconfig_paths(tsconfig_content or "")

    edges: List[DependencyEdge] = []
    seen_edges: Set[Tuple[str, str]] = set()

    # Pass 1: Resolve dependencies
    for source_path, file_model in files.items():
        norm_source = source_path.replace("\\", "/")
        resolved_deps = []

        for imp in file_model.imports:
            target_path = resolve_import_path(imp, norm_source, file_tree_set, ts_paths)
            if target_path and target_path != norm_source:
                if target_path not in resolved_deps:
                    resolved_deps.append(target_path)

                edge_key = (norm_source, target_path)
                if edge_key not in seen_edges:
                    seen_edges.add(edge_key)

                    target_file = files.get(target_path)
                    rel_type = "imports"
                    if target_file is not None:
                        rel_type = determine_edge_relationship(file_model, target_file)

                    edges.append(DependencyEdge(
                        source=norm_source,
                        target=target_path,
                        type=rel_type,
                        confidence=0.95 if target_path in files else 0.85,
                        evidence=f"Import statement: '{imp}'"
                    ))

        file_model.dependencies = resolved_deps

    # Pass 2: Compute reverse dependents (used_by)
    for source_path, file_model in files.items():
        norm_source = source_path.replace("\\", "/")
        for dep in file_model.dependencies:
            target_model = files.get(dep)
            if target_model is not None:
                if norm_source not in target_model.dependents:
                    target_model.dependents.append(norm_source)

    return edges
