"""File and module documentation from normalized repository evidence."""

from security import is_sensitive_file
from .collector import files, file_ref, symbols, routes, data_models
from .models import section


def generate(model, scope, *, symbol=None, history=None, health=None, impact=None, humanize=None, trace=None):
    known = files(model)
    if not isinstance(scope, str) or scope not in known or is_sensitive_file(scope):
        raise ValueError("Select a non-sensitive modeled file for module documentation.")
    item = known[scope]
    members = [entry for entry in symbols(model, scope) if not symbol or entry.get("name") == symbol]
    selected_routes = [route for route in routes(model) if route.get("file") == scope]
    selected_models = [entry for entry in data_models(model) if entry.get("file") == scope]
    result = [section("module", f"Module: {scope}",
        facts=[f"Category: {item.get('category', 'unknown')}", f"Language: {item.get('language', 'unknown')}",
               f"Exports: {', '.join((item.get('exports') or [])[:30]) or 'None statically identified'}"],
        inferences=[f"Modeled purpose: {item['purpose']}"] if item.get("purpose") else [],
        citations=[file_ref(scope, model)]),
        section("symbols", "Symbols and dependencies",
                facts=[f"{entry.get('type', 'symbol')} {entry.get('name', '?')}" for entry in members] +
                      [f"Imports {path}" for path in (item.get("dependencies") or [])[:20]] +
                      [f"Used by {path}" for path in (item.get("dependents") or [])[:20]],
                citations=[file_ref(scope, model, entry.get("name")) for entry in members] + [file_ref(scope, model)]),
        section("surface", "Routes and data models",
                facts=[f"{route.get('method')} {route.get('path')}" for route in selected_routes] +
                      [f"Model {entry.get('name')}" for entry in selected_models], citations=[file_ref(scope, model)])]
    if history and history.get("total_commits"):
        result.append(section("history", "Recent Git activity", facts=[f"{history['total_commits']} sampled commits touched this file; latest {history.get('latest_commit') or 'unknown'}."],
                              citations=[file_ref(scope, model)]))
    if health:
        findings = [finding for finding in health.get("findings", []) if finding.get("file") == scope][:10]
        result.append(section("quality", "Health and maintainability signals",
            inferences=[f"{finding.get('title')}: {finding.get('summary')}" for finding in findings],
            citations=[file_ref(scope, model)]))
    if impact:
        result.append(section("impact", "Current change impact", inferences=[impact.get("summary") or "Current impact is available."],
                              citations=[file_ref(scope, model)]))
    if humanize:
        result.append(section("humanize", "Maintainability signals", inferences=[
            f"Cached Humanize score: {humanize.get('score', 'unknown')}; review findings in Humanize before changing this file."],
            citations=[file_ref(scope, model)]))
    if trace and trace.get("flows"):
        from .flows import generate as flow_sections
        result.extend(flow_sections(model, trace)[:1])
    return result
