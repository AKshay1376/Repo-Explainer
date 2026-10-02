"""Conservative risk classification with visible factors."""

from typing import Any, Dict, List, Tuple


def classify_risk(plan_type: str, model: Dict[str, Any], evidence: Dict[str, Any]) -> Tuple[str, List[str], str]:
    path = evidence["path"]
    factors = []
    file_meta = (model.get("files") or {}).get(path) or {}
    if evidence["exports"]:
        factors.append("target file exports public symbols")
    if any(item.get("file") == path for item in model.get("entry_points") or []):
        factors.append("target is an entry point")
    if any(item.get("file") == path for item in model.get("api_routes") or []):
        factors.append("target defines an API route")
    if any(item.get("file") == path for item in model.get("database_models") or []):
        factors.append("target defines a database model")
    if len(evidence["direct"]) >= 5:
        factors.append(f"{len(evidence['direct'])} direct dependents")
    if plan_type in {"framework_migration", "api_migration", "database_model_migration"}:
        factors.append("migration crosses a framework, API, or schema boundary")
    if evidence["cycles"]:
        factors.append("dependency cycle requires a compatibility strategy")
    if not evidence["tests"]:
        factors.append("no affected test was identified")
    if not evidence["target_content_available"]:
        factors.append("source content is unavailable; references are incomplete")
    if plan_type in {"rename_symbol", "move_file", "move_module"} and not evidence["references"]:
        factors.append("reference sites are not confirmed by cached source")
    high = any("public" in item or "entry point" in item or "API route" in item or
               "database model" in item or "boundary" in item or "direct dependents" in item
               for item in factors)
    medium = (high or bool(evidence["direct"]) or bool(evidence["cycles"]) or
              file_meta.get("category") in {"service", "controller", "middleware"})
    level = "HIGH" if high else "MEDIUM" if medium else "LOW"
    confidence = "HIGH" if evidence["target_content_available"] and evidence["impact"]["available"] else "MEDIUM" if evidence["impact"]["available"] else "LOW"
    return level, factors, confidence
