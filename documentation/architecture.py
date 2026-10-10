"""Architecture and overview descriptions from existing model edges."""

import re

from .collector import file_ref, files, routes, data_models
from .models import section, MAX_ITEMS


def diagram(model, scope=None):
    allowed = files(model)
    edges = [edge for edge in (model.get("dependencies") or [])
             if edge.get("source") in allowed and edge.get("target") in allowed
             and (not scope or scope in (edge.get("source"), edge.get("target")) or
                  edge.get("source", "").startswith(scope.rstrip("/") + "/"))][:35]
    if not edges:
        return None
    paths = sorted({path for edge in edges for path in (edge["source"], edge["target"])})
    identities = {path: f"n{index}" for index, path in enumerate(paths)}
    lines = ["flowchart LR"]
    for path in paths:
        label = re.sub(r"[^A-Za-z0-9_./ -]", "_", path)[:90]
        lines.append(f'  {identities[path]}["{label}"]')
    for edge in edges:
        lines.append(f'  {identities[edge["source"]]} --> {identities[edge["target"]]}')
    return "\n".join(lines)


def architecture(model, scope=None):
    known = files(model)
    layers = model.get("architecture_layers") or {}
    facts = [f"{name}: {len([p for p in paths if p in known])} modeled files" for name, paths in list(layers.items())[:MAX_ITEMS]]
    refs = [file_ref(path, model) for paths in list(layers.values())[:10] for path in paths[:2] if path in known]
    entries = [item for item in (model.get("entry_points") or []) if item.get("path") in known][:20]
    entry = section("entry-points", "Entry points", facts=[f"{item['path']} ({item.get('type', 'entrypoint')})" for item in entries],
                    citations=[file_ref(item["path"], model) for item in entries])
    components = section("layers", "Layers and components", facts=facts or [f"{len(known)} modeled files"], citations=refs)
    dependencies = [edge for edge in (model.get("dependencies") or []) if edge.get("source") in known and edge.get("target") in known][:MAX_ITEMS]
    edges = section("dependencies", "Key dependencies", facts=[f"{e['source']} → {e['target']} ({e.get('type', 'relationship')})" for e in dependencies],
                    citations=[file_ref(e["source"], model) for e in dependencies], diagram=diagram(model, scope))
    warnings = section("architecture-risks", "Architecture warnings", inferences=(model.get("warnings") or [])[:20],
                       unknowns=["Historical dependency growth is not statically determined from the current model."])
    return [components, entry, edges, warnings]


def overview(model):
    meta = model.get("metadata") or {}
    technologies = (model.get("technologies") or [])[:30]
    stack = section("stack", "Detected stack", facts=[f"{item.get('name')} ({item.get('category')})" for item in technologies],
                    citations=[file_ref(item.get("evidence", ""), model) for item in []])
    summary = section("project", "Project evidence", facts=[f"Repository: {meta.get('owner', '')}/{meta.get('repo', '')}",
                    f"Modeled files: {len(files(model))}; routes: {len(routes(model))}; data models: {len(data_models(model))}",
                    f"Languages: {', '.join(meta.get('languages') or []) or 'Unknown'}"],
                    inferences=[f"Repository description: {meta['description']}"] if meta.get("description") else [],
                    unknowns=[] if meta.get("description") else ["Business purpose is not established by the available repository evidence."])
    return [summary, stack] + architecture(model)[:2]
