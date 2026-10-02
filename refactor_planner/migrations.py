"""Repository-evidence migration rules; version-specific claims require external information."""

import re
from typing import Any, Dict

from .analyzer import safe_cached_content


def migration_context(model: Dict[str, Any], plan_type: str, target: str,
                      destination: str, owner: str, repo: str, revision: str) -> Dict[str, Any]:
    files = model.get("files") or {}
    manifests = sorted(path for path in files if path.endswith((
        "package.json", "requirements.txt", "pyproject.toml", "Pipfile", "Cargo.toml", "go.mod")))
    import_sites = []
    constraints = []
    usage_sites = []
    wrapper_sites = []
    if plan_type in {"replace_dependency", "upgrade_dependency"}:
        pattern = re.compile(r"(?<![\w.-])" + re.escape(target) + r"(?![\w.-])", re.IGNORECASE)
        for path in sorted(files):
            content = safe_cached_content(owner, repo, revision, path)
            if content is None:
                continue
            for number, line in enumerate(content.splitlines(), 1):
                if not pattern.search(line):
                    continue
                record = {"path": path, "line": number, "evidence": line.strip()[:160]}
                if path in manifests:
                    constraints.append(record)
                elif re.search(r"\b(import|from|require)\b", line):
                    import_sites.append(record)
                else:
                    usage_sites.append(record)
                if re.search(r"(?:adapter|wrapper|client|service)", path, re.IGNORECASE) and path not in manifests:
                    wrapper_sites.append(record)
                if len(import_sites) + len(constraints) + len(usage_sites) >= 100:
                    break
    external_needed = plan_type in {
        "upgrade_dependency", "framework_migration", "api_migration", "database_model_migration"}
    warnings = []
    if external_needed:
        warnings.append("External version-specific or contract information is needed before implementation; no migration rule is inferred from absent documentation.")
    if plan_type in {"replace_dependency", "upgrade_dependency"} and not constraints:
        warnings.append("No cached manifest line confirms the package constraint; inspect the manifest before editing.")
    return {"manifests": manifests, "import_sites": import_sites,
            "usage_sites": usage_sites, "wrapper_sites": wrapper_sites,
            "constraints": constraints, "external_information_needed": external_needed,
            "warnings": warnings, "destination": destination}
