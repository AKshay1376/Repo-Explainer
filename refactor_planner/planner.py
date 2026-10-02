"""Construct advisory steps from evidence and topologically order them."""

import ast
import re
from typing import Any, Dict, List

from .models import PlanStep, RefactorPlan
from .ordering import order_steps


def extraction_details(content: str, symbol: str) -> Dict[str, Any]:
    """Python AST inputs and locals; side effects remain an explicit review item."""
    result = {"inputs": [], "outputs": [], "locals": [], "calls": [],
              "side_effects": "unknown", "confidence": "LOW"}
    if not content:
        return result
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return result
    functions = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
    node = next((item for item in functions if item.name == symbol), None)
    if node is None:
        return result
    result["inputs"] = [arg.arg for arg in (*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs)]
    result["locals"] = sorted({target.id for item in ast.walk(node)
                              if isinstance(item, (ast.Assign, ast.AnnAssign, ast.NamedExpr))
                              for target in (item.targets if isinstance(item, ast.Assign) else [item.target])
                              if isinstance(target, ast.Name)})
    result["outputs"] = sorted({name.id for item in ast.walk(node) if isinstance(item, ast.Return) and item.value
                                for name in ast.walk(item.value) if isinstance(name, ast.Name)})
    result["calls"] = sorted({item.func.id if isinstance(item.func, ast.Name) else item.func.attr
                              for item in ast.walk(node) if isinstance(item, ast.Call)
                              and isinstance(item.func, (ast.Name, ast.Attribute))})[:20]
    result["confidence"] = "MEDIUM"
    return result


def _locations(path: str, evidence: Dict[str, Any]) -> List[Dict[str, Any]]:
    result = [{"path": path, "line": item.get("line"), "kind": "definition"}
              for item in evidence["definitions"] if item.get("line")]
    result.extend({"path": item["path"], "line": item["line"], "kind": "reference"}
                  for item in evidence["references"][:30])
    return result or [{"path": path, "line": None, "kind": "file"}]


def _partitions(evidence: Dict[str, Any]):
    groups = {}
    for item in evidence["definitions"]:
        name = item.get("name")
        if not name:
            continue
        category = ("types" if item.get("type") in {"type", "interface"} else
                    "models" if any(model.get("name") == name for model in evidence["models"]) else
                    "routes" if any(route.get("handler") == name for route in evidence["routes"]) else
                    "components" if item.get("type") == "component" else
                    "helpers" if name.startswith("_") or name.startswith("get_") else "services")
        groups.setdefault(category, set()).add(name)
    proposed = [{"name": name, "symbols": sorted(symbols)} for name, symbols in sorted(groups.items())]
    edges = []
    content = evidence["target_content"] or ""
    try:
        tree = ast.parse(content)
        owners = {symbol: group for group, symbols in groups.items() for symbol in symbols}
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in owners:
                for call in ast.walk(node):
                    if isinstance(call, ast.Call) and isinstance(call.func, ast.Name):
                        target = owners.get(call.func.id)
                        if target and target != owners[node.name]:
                            edge = {"source": owners[node.name], "target": target,
                                    "evidence": f"{node.name} calls {call.func.id}"}
                            if edge not in edges:
                                edges.append(edge)
    except SyntaxError:
        pass
    return proposed, edges[:50]


def construct_plan(plan_id: str, plan_type: str, resolved: Dict[str, Any],
                   evidence: Dict[str, Any], migration: Dict[str, Any],
                   risk_level: str, risk_factors: List[str], confidence: str) -> RefactorPlan:
    path = resolved["path"]
    target = resolved["target"]
    destination = resolved["destination"]
    symbol = resolved["symbol"]
    affected = sorted(set(evidence["affected_files"]) |
                      {item["path"] for key in ("import_sites", "usage_sites", "wrapper_sites") for item in migration[key]})
    tests = sorted({item.get("file") for item in evidence["tests"] if item.get("file")})
    direct = evidence["direct"]
    locations = _locations(path, evidence)
    steps: List[PlanStep] = []
    warnings = list(migration["warnings"])
    if evidence.get("coverage_warning"):
        warnings.append(evidence["coverage_warning"])
    review = []
    partitions, partition_edges = _partitions(evidence) if plan_type == "split_large_file" else ([], [])

    def add(identifier, title, description, files=None, symbols=None, prerequisites=None,
            risk=None, confidence_override=None, locations_override=None, validation=None,
            manual=True, auto_preview=False):
        steps.append(PlanStep(
            id=identifier, order=0, title=title, description=description,
            target=target, change_type=plan_type, prerequisites=prerequisites or [],
            affected_files=sorted(set(files if files is not None else [path])),
            affected_symbols=symbols or ([symbol] if symbol else []),
            source_locations=locations_override if locations_override is not None else locations,
            validation=validation or [], risk_level=risk or risk_level,
            confidence=confidence_override or confidence,
            can_auto_preview=auto_preview, requires_manual_review=manual,
        ))

    if plan_type == "rename_symbol":
        private_local_preview = bool(path.endswith(".py") and symbol and symbol.startswith("_") and
                                     affected == [path] and not evidence["string_references"] and
                                     not evidence["routes"] and not evidence["models"])
        add("definition", "Rename the definition", f"Rename {symbol} to {destination} in {path}; preserve its signature and behavior.",
            auto_preview=private_local_preview)
        if evidence["exports"]:
            add("compatibility", "Preserve the old public name temporarily", "Review an alias or re-export only if callers need a transition window.",
                prerequisites=["definition"], manual=True)
            import_parent = "compatibility"
        else:
            import_parent = "definition"
        add("imports", "Update imports and exports", "Update confirmed import sites; inspect barrel exports and dynamic imports manually.",
            files=direct or [path], prerequisites=[import_parent])
        add("references", "Update references", "Review each confirmed reference and separately verify string-based references.",
            files=sorted({item["path"] for item in evidence["references"]}) or affected,
            prerequisites=["imports"])
        add("tests", "Update targeted tests", "Update test references and assertions for the renamed symbol.",
            files=tests or [path], prerequisites=["references"])
        review.append("Lexical matches are evidence for review, not authorization for automatic rename.")
        if evidence["string_references"]:
            review.append(f"Review {len(evidence['string_references'])} possible string-based references.")
    elif plan_type in {"move_file", "move_module"}:
        add("prepare", "Prepare destination", f"Create {destination} and inspect outbound imports and relative paths.")
        if evidence["exports"] or evidence["cycles"]:
            add("compatibility", "Add a temporary compatibility path", "Consider a re-export or alias supported by the module structure; remove it after callers migrate.", prerequisites=["prepare"])
            move_parent = "compatibility"
        else:
            move_parent = "prepare"
        add("move", "Move implementation", f"Move {path} to {destination} while preserving public exports.", prerequisites=[move_parent])
        add("imports", "Update inbound imports and aliases", "Update direct dependents, relative imports, path aliases, config references, and barrel exports.",
            files=direct or [path], prerequisites=["move"], auto_preview=bool(direct and not evidence["cycles"]))
        add("tests", "Update tests and path references", "Update relevant test imports and fixture/config paths.",
            files=tests or [path], prerequisites=["imports"])
        review.append("Check relative import breakage, dynamic imports, path aliases, and configuration paths.")
        for category, items in evidence["move_references"].items():
            if items:
                review.append(f"Review {len(items)} {category.replace('_', ' ')} found in cached source.")
    elif plan_type in {"extract_function", "extract_module", "split_large_file", "merge_duplicate_helpers"}:
        findings = (evidence["humanize"] or {}).get("findings", [])
        relevant = [item for item in findings if item["rule"] in {
            "long_function", "branch_complexity", "deep_nesting", "repeated_block", "crowded_module", "large_class"}]
        if plan_type == "merge_duplicate_helpers":
            relevant = [item for item in relevant if item["rule"] == "repeated_block"]
        if not relevant:
            warnings.append("No matching Humanize candidate was confirmed from cached source; inspect the target manually.")
        detail = extraction_details(evidence["target_content"] or "", symbol or "") if plan_type == "extract_function" else None
        description = "Inspect Humanize findings, symbols, imports, and responsibilities before selecting an extraction boundary."
        if detail:
            description += f" Inputs: {', '.join(detail['inputs']) or 'unresolved'}; outputs: {', '.join(detail['outputs']) or 'unresolved'}; locals: {', '.join(detail['locals']) or 'unresolved'}; calls: {', '.join(detail['calls']) or 'unresolved'}."
        add("boundary", "Identify a safe boundary", description)
        add("extract", "Extract cohesive implementation", "Move a reviewed unit into a function/module; preserve existing call and export contracts.",
            prerequisites=["boundary"])
        add("callers", "Update callers and exports", "Update imports and references in dependency order; retain compatibility where public names exist.",
            files=direct or [path], prerequisites=["extract"])
        add("tests", "Add focused regression tests", "Cover inputs, outputs, side effects, and existing behavior before removing old logic.",
            files=tests or [path], prerequisites=["callers"])
        review.append("Side effects and behavior equivalence need manual review; static findings alone do not prove extraction safety.")
        if plan_type == "split_large_file":
            review.append("Partition symbols by responsibility (types, services, helpers, routes, models, components) and verify edges between partitions.")
            if partitions:
                warnings.append("Proposed partitions are symbol-level suggestions; inspect cohesion and imports before splitting.")
    elif plan_type in {"replace_dependency", "upgrade_dependency"}:
        add("manifest", "Stage dependency change", f"Inspect manifest constraints for {target}; stage {destination or 'the target version'} after checking external compatibility guidance.",
            files=migration["manifests"] or [path])
        add("adapters", "Update adapters and wrappers", "Migrate wrapper modules first so downstream call sites have a stable boundary.", prerequisites=["manifest"])
        add("usages", "Update import and API usages", "Review confirmed import sites and version-specific API changes; do not infer missing migration rules.",
            files=sorted({item["path"] for item in migration["import_sites"]}) or [path], prerequisites=["adapters"])
        add("tests", "Run focused and integration checks", "Validate affected tests, types, build, and runtime integration.", files=tests or [path], prerequisites=["usages"])
        if plan_type == "replace_dependency":
            add("remove", "Remove old dependency", "Remove the old package only after migrated usages and validation are complete.",
                files=migration["manifests"] or [path], prerequisites=["tests"])
        if migration["usage_sites"]:
            review.append(f"Review {len(migration['usage_sites'])} cached API usage lines for version-specific behavior.")
    else:
        add("inventory", "Inventory contracts and boundaries", "Review repository routes, models, symbols, dependent files, and current tests; obtain external migration guidance.")
        add("adapter", "Plan a compatibility adapter", "Use an adapter or dual path only where current project structure supports it.", prerequisites=["inventory"])
        add("migrate", "Migrate in bounded stages", "Update one boundary at a time and preserve externally visible behavior until callers are migrated.", prerequisites=["adapter"])
        add("tests", "Validate contracts", "Run targeted tests, route/model checks, typecheck, build, and integration checks.",
            files=tests or [path], prerequisites=["migrate"])

    if evidence["cycles"]:
        add("cycle_review", "Resolve dependency cycle", "Document the cycle and introduce a temporary compatibility boundary before moving dependent files.",
            prerequisites=[steps[0].id], risk="HIGH")
        review.append("A dependency cycle was detected; compatibility steps need manual design.")
    final_parents = [step.id for step in steps if not any(step.id in other.prerequisites for other in steps)]
    validation = ["Run affected tests", "Verify affected routes and models", "Run TypeScript/type checks where configured",
                  "Run production build where configured", "Run relevant integration checks"]
    add("validate", "Validate the planned change", "Run the validation gates and inspect results before removing compatibility code.",
        files=tests or [path], prerequisites=final_parents, validation=validation, manual=False)
    ordered, step_cycles = order_steps(steps)
    if step_cycles:
        warnings.append("Step prerequisite cycle detected; ordering needs manual repair.")
    dependencies = [{"source": src, "target": dep,
                     "type": (resolved["index"].dependency_edges.get((src, dep)) or {}).get("type", "imports")}
                    for src in affected for dep in sorted(resolved["index"].forward_deps.get(src, set()))
                    if dep in affected]
    description = f"Plan {plan_type.replace('_', ' ')} for {target}"
    if destination:
        description += f" toward {destination}"
    return RefactorPlan(
        id=plan_id, plan_type=plan_type, target=target, destination=destination,
        summary=description + ".", risk_level=risk_level, steps=ordered,
        affected_files=affected, affected_symbols=sorted({item.get("name") for item in evidence["definitions"] if item.get("name")}),
        affected_routes=evidence["routes"], affected_models=evidence["models"], affected_tests=evidence["tests"],
        dependencies=dependencies, warnings=warnings, manual_review_items=review,
        confidence=confidence, estimated_scope={"files": len(affected), "direct_dependents": len(direct),
                                                "tests": len(tests), "steps": len(ordered)},
        risk_factors=risk_factors, impact=evidence["impact"], execution_paths=evidence["execution_paths"],
        proposed_partitions=partitions, partition_edges=partition_edges,
        migration_evidence={key: migration[key] for key in ("manifests", "constraints", "import_sites", "usage_sites", "wrapper_sites")},
        validation=validation, cycles=evidence["cycles"] + step_cycles,
        external_information_needed=migration["external_information_needed"],
    )
