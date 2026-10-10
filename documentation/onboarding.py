"""Setup and contributor guides without reading environment values."""

from .collector import files, safe_env_names, file_ref
from .models import section


def generate(model, *, contributor=False, validator=None):
    known = files(model)
    manifests = [path for path in known if path.rsplit("/", 1)[-1] in
                 {"package.json", "requirements.txt", "pyproject.toml", "Pipfile", "Cargo.toml", "go.mod", "Dockerfile", "Makefile"}][:20]
    entries = [entry for entry in (model.get("entry_points") or []) if entry.get("path") in known][:20]
    commands = ((validator or {}).get("profile") or {}).get("commands") or []
    result = [section("structure", "Where to start", facts=[f"Entry point: {entry['path']}" for entry in entries] +
              [f"Manifest: {path}" for path in manifests], citations=[file_ref(path, model) for path in manifests] +
              [file_ref(entry["path"], model) for entry in entries]),
              section("environment", "Environment variable names", facts=safe_env_names(model),
                      unknowns=["Values, required defaults, and deployment secrets are intentionally unavailable."])]
    if commands:
        result.append(section("validation", "Discovered validation commands",
            facts=[f"{item.get('command') or item.get('display') or item.get('id')} — {'trusted' if item.get('trusted') else 'untrusted; review before running'}"
                   for item in commands[:20]],
            unknowns=["Discovery does not establish that these commands pass."]))
    else:
        result.append(section("validation", "Validation", unknowns=["No local validator profile is available; test commands are not verified."]))
    if contributor:
        result.append(section("workflow", "Contributor workflow",
            inferences=["Review source and modeled dependents before changes; use patch previews and explicit validation."],
            unknowns=["Repository-specific contribution rules are not statically determined."]))
    else:
        result.append(section("setup", "Setup", unknowns=["Installation and run commands require confirmation from project documentation or a trusted validator profile."]))
    return result


def readme_sections(model, validator=None):
    from .architecture import overview, architecture
    from .collector import routes
    known = files(model)
    selected_routes = routes(model)[:10]
    parts = overview(model)[:2]
    parts.append(section("features", "Features and API surface",
        facts=[f"Detected route: {item.get('method')} {item.get('path')}" for item in selected_routes],
        citations=[file_ref(item.get("file"), model) for item in selected_routes],
        unknowns=[] if selected_routes else ["Features are not statically established by the available route model."]))
    parts.extend(architecture(model)[:3])
    parts.extend(generate(model, validator=validator))
    parts.append(section("usage", "Usage", unknowns=["Usage examples and runtime behavior require project documentation or verified execution evidence."]))
    parts.append(section("testing", "Testing", facts=[f"Test file: {path}" for path, item in list(known.items())[:200]
        if item.get("category") == "test" or path.rsplit("/", 1)[-1].startswith("test_")][:30],
        citations=[file_ref(path, model) for path, item in list(known.items())[:200]
                   if item.get("category") == "test" or path.rsplit("/", 1)[-1].startswith("test_")][:30]))
    parts.append(section("project-structure", "Project structure",
        facts=[f"{folder}: {len(paths)} modeled files" for folder, paths in list((model.get("directories") or {}).items())[:30]],
        unknowns=[] if model.get("directories") else ["Folder summaries are unavailable."]))
    return parts
