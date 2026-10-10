"""Small, serializable document schema shared by every generator."""

import hashlib
from datetime import datetime, timezone
from pathlib import PurePosixPath

from security import sanitize_content, is_sensitive_file


TYPES = (
    "PROJECT_OVERVIEW", "ARCHITECTURE", "MODULE", "API", "DATA_MODELS",
    "EXECUTION_FLOW", "ONBOARDING", "CONTRIBUTOR_GUIDE", "CHANGE_SUMMARY",
    "TECH_DEBT", "REFACTOR_NOTES", "README_DRAFT",
)
MAX_ITEMS = 60


def clean(value):
    """Sanitize model metadata before it becomes document prose."""
    safe = sanitize_content("generated-document.txt", str(value or ""))
    return (safe or "").replace("\x00", "")[:1000]


def citation(path, line=None, *, symbol=None, kind="source"):
    if (not isinstance(path, str) or not path or len(path) > 300 or is_sensitive_file(path)
            or "\\" in path or ":" in path or "\x00" in path or PurePosixPath(path).is_absolute()
            or any(part in {"", ".", ".."} for part in path.split("/"))):
        return None
    line = line if isinstance(line, int) and line > 0 else None
    return {"file": path, "start_line": line, "end_line": line,
            "symbol": clean(symbol) if symbol else None, "kind": kind}


def section(identifier, title, *, facts=(), inferences=(), unknowns=(), citations=(), diagram=None):
    refs = [item for item in citations if item and not is_sensitive_file(item["file"])]
    return {"id": identifier, "title": clean(title), "facts": [clean(x) for x in facts][:MAX_ITEMS],
            "inferences": [clean(x) for x in inferences][:MAX_ITEMS],
            "unknowns": [clean(x) for x in unknowns][:MAX_ITEMS],
            "citations": refs[:MAX_ITEMS], "diagram": diagram, "subsections": []}


def document(doc_type, title, model, scope, sections, *, warnings=(), confidence="MEDIUM"):
    revision = str((model.get("metadata") or {}).get("latest_commit_sha") or "unknown")
    identifier = hashlib.sha256(f"{revision}|{doc_type}|{scope}".encode()).hexdigest()[:16]
    references = []
    seen = set()
    for part in sections:
        for ref in part["citations"]:
            key = (ref["file"], ref["start_line"], ref["symbol"])
            if key not in seen:
                references.append(ref)
                seen.add(key)
    return {"id": identifier, "type": doc_type, "title": clean(title), "repo_revision": revision,
            "scope": scope, "summary": clean(title), "sections": sections,
            "citations": references, "warnings": [clean(w) for w in warnings],
            "confidence": confidence, "generated_at": datetime.now(timezone.utc).isoformat(),
            "success": True, "llm_calls": 0}
