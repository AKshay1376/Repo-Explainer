"""Bounded, non-sensitive RepositoryModel evidence helpers."""

import re

from .models import MAX_ITEMS, citation


def files(model):
    return {path: value for path, value in (model.get("files") or {}).items()
            if isinstance(value, dict) and citation(path)}


def symbols(model, path=None):
    return [item for item in (model.get("symbols") or [])
            if isinstance(item, dict) and citation(item.get("file"))
            and (path is None or item.get("file") == path)][:MAX_ITEMS]


def routes(model):
    return [item for item in (model.get("api_routes") or [])
            if isinstance(item, dict) and citation(item.get("file"))][:MAX_ITEMS]


def data_models(model):
    return [item for item in (model.get("database_models") or [])
            if isinstance(item, dict) and citation(item.get("file"))][:MAX_ITEMS]


def file_ref(path, model, symbol=None):
    line = None
    for item in symbols(model, path):
        if symbol is None or item.get("name") == symbol:
            line = item.get("line")
            break
    return citation(path, line, symbol=symbol)


def safe_env_names(model):
    names = set()
    for item in files(model).values():
        for name in item.get("env_vars") or []:
            if isinstance(name, str) and re.fullmatch(r"[A-Z][A-Z0-9_]{1,79}", name):
                names.add(name)
    return sorted(names)[:MAX_ITEMS]
