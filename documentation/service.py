"""Doc type routing and revision-aware cache; no repository execution or AI."""

import hashlib
import json
from cachetools import TTLCache

from . import architecture, api_docs, modules, data_models, onboarding, flows, changelog
from .models import TYPES, document, section
from .renderer import markdown, html_document


def _stable(value):
    if isinstance(value, dict):
        return {key: _stable(item) for key, item in value.items() if key not in {"cached", "generated_at", "timestamp"}}
    if isinstance(value, list):
        return [_stable(item) for item in value]
    return value


class DocumentationService:
    def __init__(self):
        self.cache = TTLCache(maxsize=80, ttl=900)
        self.documents = TTLCache(maxsize=80, ttl=900)

    def generate(self, doc_type, model, *, scope=None, options=None, context=None):
        if doc_type not in TYPES:
            raise ValueError("Choose a supported documentation type.")
        if not isinstance(model, dict) or not isinstance(model.get("files"), dict) or not model["files"]:
            raise ValueError("Analyze a repository before generating documentation.")
        if scope is not None and (not isinstance(scope, str) or len(scope) > 300):
            raise ValueError("Invalid documentation scope.")
        options = options or {}
        context = context or {}
        if not isinstance(options, dict):
            raise ValueError("Invalid documentation options.")
        if len(json.dumps(options, default=str)) > 4000:
            raise ValueError("Documentation options exceed the request limit.")
        metadata = model.get("metadata") or {}
        revision = metadata.get("latest_commit_sha") or "unknown"
        fingerprint = hashlib.sha256(json.dumps({"model": model, "context": _stable(context)}, sort_keys=True, default=str).encode()).hexdigest()
        key = (revision, doc_type, scope, json.dumps(options, sort_keys=True, default=str), fingerprint)
        if key in self.cache:
            result = {**self.cache[key], "cached": True}
            self.documents[result["id"]] = result
            return result
        title = doc_type.replace("_", " ").title()
        if doc_type == "PROJECT_OVERVIEW":
            parts = architecture.overview(model)
        elif doc_type == "ARCHITECTURE":
            parts = architecture.architecture(model, scope)
        elif doc_type == "MODULE":
            parts = modules.generate(model, scope, symbol=options.get("symbol"), history=context.get("history"), health=context.get("health"),
                                     impact=context.get("impact"), humanize=context.get("humanize"), trace=context.get("trace"))
            title = f"Module: {scope}"
        elif doc_type == "API":
            parts = api_docs.generate(model, scope)
        elif doc_type == "DATA_MODELS":
            parts = data_models.generate(model, scope)
        elif doc_type == "EXECUTION_FLOW":
            parts = flows.generate(model, context.get("trace"))
        elif doc_type == "ONBOARDING":
            parts = onboarding.generate(model, validator=context.get("validator"))
        elif doc_type == "CONTRIBUTOR_GUIDE":
            parts = onboarding.generate(model, contributor=True, validator=context.get("validator"))
        elif doc_type == "CHANGE_SUMMARY":
            parts = changelog.generate(context.get("history"), evolution=context.get("evolution"), comparison=context.get("comparison"))
        elif doc_type == "TECH_DEBT":
            parts = changelog.debt(model, context.get("health"), context.get("hotspots"))
        elif doc_type == "REFACTOR_NOTES":
            plan = context.get("plan") or {}
            parts = [section("plan", "Refactor or migration plan",
                facts=[f"Target: {plan.get('target', scope or 'Unknown')}", f"Risk: {plan.get('risk_level', 'Unknown')}"] +
                      [f"Step {step.get('order')}: {step.get('title')} — {step.get('description')}" for step in (plan.get("steps") or [])[:30]],
                inferences=(plan.get("risk_factors") or [])[:20],
                unknowns=[] if plan else ["No current refactor plan was supplied."])]
        else:  # README_DRAFT
            parts = onboarding.readme_sections(model, validator=context.get("validator"))
            title = f"{metadata.get('repo') or 'Project'} — README Draft"
        warnings = ["Generated from available static evidence. Unknown behavior and unstated schemas remain unknown."]
        if context.get("history_warning"):
            warnings.append(context["history_warning"])
        if context.get("flow_warning"):
            warnings.append(context["flow_warning"])
        result = document(doc_type, title, model, scope, parts, warnings=warnings)
        result["id"] = hashlib.sha256(repr(key).encode()).hexdigest()[:16]
        result["repository"] = {"owner": metadata.get("owner"), "repo": metadata.get("repo")}
        result["cached"] = False
        self.cache[key] = result
        self.documents[result["id"]] = result
        return result

    def get(self, identifier):
        result = self.documents.get(identifier)
        if not result:
            raise ValueError("Generate this documentation again before exporting it.")
        return result

    def export(self, result, format):
        if format == "markdown":
            return markdown(result), "text/markdown; charset=utf-8", ".md"
        if format == "html":
            return html_document(result), "text/html; charset=utf-8", ".html"
        if format == "json":
            return json.dumps(result, indent=2), "application/json", ".json"
        raise ValueError("Choose Markdown, HTML, or JSON export.")
