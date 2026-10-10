"""Data model summaries use only parser-provided fields and links."""

from .collector import data_models, file_ref, routes
from .models import section


def generate(model, scope=None):
    selected = [entry for entry in data_models(model) if not scope or scope in (entry.get("name"), entry.get("file"))]
    if not selected:
        return [section("models-unavailable", "Data models", unknowns=["No matching statically detected data models are available."])]
    result = []
    for index, entry in enumerate(selected):
        path = entry.get("file") or ""
        fields = entry.get("fields") or []
        refs = [route for route in routes(model) if route.get("file") == path]
        result.append(section(f"model-{index}", f"{entry.get('name', 'Unnamed model')}",
            facts=[f"Framework: {entry.get('framework', 'Unknown')}", f"Source: {path}"] +
                  [f"Field {field.get('name')}: {field.get('type') or 'type unknown'}" for field in fields[:50]] +
                  [f"Route in same file: {route.get('method')} {route.get('path')}" for route in refs],
            unknowns=["Relationships are unknown / not statically determined."] if not entry.get("relationships") else [],
            citations=[file_ref(path, model)]))
    return result
