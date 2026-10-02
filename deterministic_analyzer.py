import ast
import os
import re
from typing import Dict, Any, List, Optional, Set, Tuple


def analyze_python_source(code: str) -> Dict[str, Any]:
    """Parse Python source into AST and extract imports, classes, functions, calls, and docstrings."""
    result = {
        "classes": [],
        "functions": [],
        "imports": [],
        "internal_imports": [],
        "external_imports": [],
        "instantiations": [],
        "calls": [],
        "docstring": None,
        "has_main_block": False,
        "syntax_valid": True,
    }

    try:
        tree = ast.parse(code)
        doc = ast.get_docstring(tree)
        if doc:
            result["docstring"] = doc.split("\n\n")[0].strip().replace("\n", " ")

        instantiations_set = set()
        calls_set = set()

        for node in ast.walk(tree):
            # Check for if __name__ == '__main__':
            if isinstance(node, ast.If):
                if isinstance(node.test, ast.Compare):
                    left = node.test.left
                    if isinstance(left, ast.Name) and left.id == "__name__":
                        result["has_main_block"] = True

            # Check calls & instantiations
            elif isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name):
                    # Convention: TitleCase is likely a class construction, lowercase is function call
                    if func.id and func.id[0].isupper():
                        instantiations_set.add(func.id)
                    else:
                        calls_set.add(func.id)
                elif isinstance(func, ast.Attribute):
                    if func.attr and func.attr[0].isupper():
                        instantiations_set.add(func.attr)
                    else:
                        calls_set.add(func.attr)

        result["instantiations"] = sorted(list(instantiations_set))
        result["calls"] = sorted(list(calls_set))

        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.ClassDef):
                methods = [m.name for m in node.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))]
                bases = []
                for b in node.bases:
                    if hasattr(ast, "unparse"):
                        bases.append(ast.unparse(b))
                    elif isinstance(b, ast.Name):
                        bases.append(b.id)
                    elif isinstance(b, ast.Attribute):
                        bases.append(b.attr)
                
                class_doc = ast.get_docstring(node)
                result["classes"].append({
                    "name": node.name,
                    "methods": methods[:10],
                    "bases": bases,
                    "docstring": class_doc.split("\n\n")[0].strip().replace("\n", " ") if class_doc else None,
                })

            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                args = [a.arg for a in node.args.args if a.arg != "self"]
                fn_doc = ast.get_docstring(node)
                is_entry = node.name in ("main", "run", "start", "cli", "execute", "train")
                result["functions"].append({
                    "name": node.name,
                    "args": args[:6],
                    "is_entry": is_entry,
                    "docstring": fn_doc.split("\n\n")[0].strip().replace("\n", " ") if fn_doc else None,
                })

            elif isinstance(node, ast.Import):
                for alias in node.names:
                    mod = alias.name
                    result["imports"].append(mod)
                    result["external_imports"].append(mod)

            elif isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                level = node.level or 0
                for alias in node.names:
                    full_name = f"{mod}.{alias.name}" if mod else alias.name
                    result["imports"].append(full_name)
                    if level > 0 or mod.startswith("."):
                        result["internal_imports"].append({
                            "module": mod,
                            "name": alias.name,
                            "level": level,
                            "symbol": alias.name
                        })
                    else:
                        result["external_imports"].append(full_name)

    except Exception:
        result["syntax_valid"] = False
        # Regex fallback
        result["classes"] = [{"name": c, "methods": [], "bases": []} for c in re.findall(r"^class\s+([A-Za-z0-9_]+)", code, re.M)]
        result["functions"] = [{"name": f, "args": [], "is_entry": f in ("main", "run", "cli")} for f in re.findall(r"^def\s+([A-Za-z0-9_]+)", code, re.M)]
        imports = re.findall(r"^(?:from|import)\s+([A-Za-z0-9_\.]+)", code, re.M)
        result["imports"] = list(dict.fromkeys(imports))
        result["has_main_block"] = "if __name__" in code

    return result


def analyze_js_source(code: str) -> Dict[str, Any]:
    """Extract exports, functions, classes, and require/import statements using regex for JS/TS."""
    result = {
        "classes": [],
        "functions": [],
        "imports": [],
        "internal_imports": [],
        "external_imports": [],
        "exports": [],
        "instantiations": [],
        "calls": [],
        "has_main_block": False,
    }

    # Imports / requires
    import_matches = re.findall(r"(?:import\s+(?:\{([^}]+)\}|\*\s+as\s+([A-Za-z0-9_$]+)|([A-Za-z0-9_$]+))?\s*from\s*['\"]([^'\"]+)['\"]|const\s+(?:\{([^}]+)\}|([A-Za-z0-9_$]+))\s*=\s*require\(\s*['\"]([^'\"]+)['\"]\s*\))", code)
    for m in import_matches:
        symbols_raw = m[0] or m[4] or m[1] or m[2] or m[5] or ""
        mod_path = m[3] or m[6] or ""
        symbols = [s.strip().split(" as ")[0] for s in symbols_raw.split(",") if s.strip()]
        result["imports"].append(mod_path)
        if mod_path.startswith("."):
            result["internal_imports"].append({
                "module": mod_path,
                "symbols": symbols
            })
        else:
            result["external_imports"].append(mod_path)

    # Classes
    classes = re.findall(r"class\s+([A-Za-z0-9_$]+)(?:\s+extends\s+([A-Za-z0-9_$]+))?", code)
    for c in classes:
        name = c[0]
        base = [c[1]] if c[1] else []
        result["classes"].append({"name": name, "methods": [], "bases": base})

    # Functions / methods
    funcs = re.findall(r"(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:function|\([^)]*\)\s*=>))", code)
    for m in funcs:
        fn = m[0] or m[1]
        if fn and fn not in [c["name"] for c in result["classes"]]:
            result["functions"].append({"name": fn, "is_entry": fn in ("main", "run", "start", "bootstrap")})

    # Exports
    exports = re.findall(r"(?:exports\.([A-Za-z0-9_$]+)\s*=|module\.exports\s*=\s*([A-Za-z0-9_$]+)|export\s+(?:default\s+)?(?:class|function)?\s*([A-Za-z0-9_$]+))", code)
    for m in exports:
        exp = m[0] or m[1] or m[2]
        if exp:
            result["exports"].append(exp)

    # Instantiations: new Foo(...)
    new_instances = re.findall(r"new\s+([A-Za-z0-9_$]+)\s*\(", code)
    result["instantiations"] = list(dict.fromkeys(new_instances))

    return result


def analyze_manifest_source(filename: str, content: str) -> Dict[str, Any]:
    """Extract declared dependencies, build backends, and package metadata from manifests."""
    meta = {
        "dependencies": [],
        "devDependencies": [],
        "build_system": None,
        "name": None,
        "version": None,
        "scripts": [],
    }
    name_lower = filename.lower()

    if name_lower.endswith("pyproject.toml"):
        deps = re.findall(r'["\']([a-zA-Z0-9_\-\.\<\>\=\~\!]+)["\']', content)
        meta["dependencies"] = [d for d in deps if any(c in d for c in (">=", "==", "~=", "<=")) or d in ("urllib3", "certifi", "idna", "charset_normalizer", "pytest", "ruff", "crewai", "pydantic", "fastapi", "flask")][:16]
        backend = re.search(r'build-backend\s*=\s*["\']([^"\']+)["\']', content)
        if backend:
            meta["build_system"] = backend.group(1)

    elif name_lower.endswith("package.json"):
        import json
        try:
            parsed = json.loads(content)
            meta["name"] = parsed.get("name")
            meta["version"] = parsed.get("version")
            meta["dependencies"] = list(parsed.get("dependencies", {}).keys())[:16]
            meta["devDependencies"] = list(parsed.get("devDependencies", {}).keys())[:10]
            meta["scripts"] = list(parsed.get("scripts", {}).keys())[:8]
        except Exception:
            pass

    return meta


def inspect_code_file(filename: str, content: str) -> Dict[str, Any]:
    """Inspect any file type and return structured evidence."""
    ext = "." + filename.split(".")[-1].lower() if "." in filename else ""
    info = {
        "filename": filename.replace("\\", "/"),
        "lines": len(content.splitlines()),
        "size_chars": len(content),
        "analysis": {},
    }

    if ext == ".py":
        info["analysis"] = analyze_python_source(content)
    elif ext in (".js", ".jsx", ".ts", ".tsx"):
        info["analysis"] = analyze_js_source(content)
    elif ext in (".toml", ".json") or "requirements" in filename.lower():
        info["analysis"] = analyze_manifest_source(filename, content)

    return info


def build_relationship_model(inspected_files_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build a lightweight, deterministic relationship model between inspected files.
    
    Guarantees:
      - ONLY creates arrows when actual verifiable evidence exists (import, construction, call).
      - NEVER invents relationships just because files exist together.
      - Recognizes multi-module / independent example repositories and prevents false merges.
    """
    relationships: List[Dict[str, str]] = []
    
    # 1. Build index of files and their defined symbols
    file_symbols: Dict[str, Dict[str, Any]] = {}
    normalized_files = {}

    for original_path, data in inspected_files_data.items():
        norm_path = original_path.replace("\\", "/")
        normalized_files[norm_path] = data
        
        analysis = data.get("analysis", {})
        classes = [c["name"] for c in analysis.get("classes", [])]
        functions = [f["name"] for f in analysis.get("functions", [])]
        exports = analysis.get("exports", [])
        
        # Module stem & parts for matching imports
        fname = os.path.basename(norm_path)
        stem, _ = os.path.splitext(fname)
        dir_name = os.path.dirname(norm_path)
        
        file_symbols[norm_path] = {
            "classes": classes,
            "functions": functions,
            "exports": exports,
            "stem": stem,
            "dir": dir_name,
            "filename": fname,
            "analysis": analysis,
        }

    # 2. Check for multi-module organization among the inspected files
    clusters: Dict[str, List[str]] = {}
    for path in file_symbols.keys():
        parts = path.split("/")
        if len(parts) >= 2 and parts[0] in ("crews", "flows", "examples", "packages", "apps", "integrations"):
            cluster_name = f"{parts[0]}/{parts[1]}"
        else:
            cluster_name = "default"
        clusters.setdefault(cluster_name, []).append(path)

    is_multi_module = len([c for c, f in clusters.items() if c != "default" and len(f) > 0]) >= 2

    # 3. Detect evidence-backed relationships between pairs of files
    for source_path, source_meta in file_symbols.items():
        source_analysis = source_meta["analysis"]
        source_imports = source_analysis.get("imports", [])
        source_internal = source_analysis.get("internal_imports", [])
        source_instantiations = set(source_analysis.get("instantiations", []))
        source_calls = set(source_analysis.get("calls", []))
        
        source_cluster = "default"
        for c_name, c_files in clusters.items():
            if source_path in c_files:
                source_cluster = c_name
                break

        for target_path, target_meta in file_symbols.items():
            if source_path == target_path:
                continue

            target_cluster = "default"
            for c_name, c_files in clusters.items():
                if target_path in c_files:
                    target_cluster = c_name
                    break

            # In multi-module repos, isolated examples should NOT form relationships
            # unless there is an explicit cross-cluster import reference
            if is_multi_module and source_cluster != target_cluster:
                # Must have explicit mention of target's cluster name or exact module in imports
                target_cluster_key = target_cluster.split("/")[-1].replace("-", "_")
                has_explicit_cross_ref = any(target_cluster_key in str(imp) for imp in source_imports)
                if not has_explicit_cross_ref:
                    continue

            rel_type = None
            rel_evidence = None

            # Evidence Check A: Target class instantiated by source (constructs)
            target_classes = target_meta["classes"]
            matched_instantiations = [c for c in target_classes if c in source_instantiations]
            
            # Check if source also imports from target (either relative or matching module path)
            target_stem = target_meta["stem"]
            target_path_norm = target_path.replace("\\", "/")
            
            has_import_evidence = False
            import_reason = ""
            
            # Check relative imports
            for item in source_internal:
                if isinstance(item, dict):
                    mod = item.get("module", "")
                    sym = item.get("symbol", "")
                    if mod == f".{target_stem}" or mod == target_stem or (sym and sym in target_classes):
                        has_import_evidence = True
                        import_reason = f"`{source_meta['filename']}` imports `{sym or target_stem}` from `{target_meta['filename']}`"
                        break

            # Check absolute imports with path verification
            if not has_import_evidence:
                for imp in source_imports:
                    imp_str = str(imp)
                    imp_as_path = imp_str.replace(".", "/")
                    # Check if the import path matches a suffix of target path
                    if imp_as_path in target_path_norm or target_path_norm.endswith(imp_as_path + ".py"):
                        has_import_evidence = True
                        import_reason = f"`{source_meta['filename']}` imports `{imp_str}` from `{target_meta['filename']}`"
                        break
                    elif any(c in imp_str for c in target_classes) and (source_cluster == target_cluster):
                        has_import_evidence = True
                        import_reason = f"`{source_meta['filename']}` imports `{imp_str}` from `{target_meta['filename']}`"
                        break

            if matched_instantiations and (has_import_evidence or source_meta["dir"] == target_meta["dir"]):
                rel_type = "constructs"
                rel_evidence = f"`{source_meta['filename']}` constructs `{', '.join(matched_instantiations)}` defined in `{target_meta['filename']}`"
            elif has_import_evidence:
                # Check if calling a function from target
                called_fns = [fn for fn in target_meta["functions"] if fn in source_calls and fn not in ("main", "run")]
                if called_fns:
                    rel_type = "executes"
                    rel_evidence = f"`{source_meta['filename']}` calls `{', '.join(called_fns)}()` from `{target_meta['filename']}`"
                else:
                    rel_type = "imports"
                    rel_evidence = import_reason
            elif source_meta["dir"] == target_meta["dir"] and target_classes and any(c in source_instantiations for c in target_classes):
                rel_type = "constructs"
                rel_evidence = f"`{source_meta['filename']}` constructs `{', '.join(matched_instantiations)}` defined in `{target_meta['filename']}`"

            if rel_type and rel_evidence:
                relationships.append({
                    "source": source_path,
                    "target": target_path,
                    "relationship": rel_type,
                    "evidence": rel_evidence,
                })

    return {
        "is_multi_module": is_multi_module,
        "clusters": clusters,
        "relationships": relationships,
        "has_relationships": len(relationships) > 0,
    }
