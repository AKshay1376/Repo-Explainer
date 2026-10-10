"""Transparent maintenance hotspot ranking, not a bug predictor."""

import math

from .models import HOTSPOT_WEIGHTS


def rank_hotspots(churn, model=None, humanize_audit=None, *, limit=50):
    files = (model or {}).get("files") or {}
    scores = {item["path"]: item.get("score") for item in (humanize_audit or {}).get("top_files", [])
              if item.get("score") is not None}
    max_churn = max((item["total_churn"] for item in churn.values()), default=0)
    max_frequency = max((item["commits"] for item in churn.values()), default=0)
    result = []
    for path, item in churn.items():
        meta = files.get(path) or {}
        centrality = len(meta.get("dependents") or [])
        factors = {
            "churn": round(HOTSPOT_WEIGHTS["churn"] * math.log1p(item["total_churn"]) / math.log1p(max_churn), 2) if max_churn else 0,
            "frequency": round(HOTSPOT_WEIGHTS["frequency"] * item["commits"] / max_frequency, 2) if max_frequency else 0,
            "centrality": round(HOTSPOT_WEIGHTS["centrality"] * min(centrality / 12, 1), 2),
            "maintainability": round(HOTSPOT_WEIGHTS["maintainability"] * max(0, 100 - scores[path]) / 100, 2) if path in scores else 0,
        }
        score = round(sum(factors.values()))
        label = "Critical Hotspot" if score >= 75 else "Hotspot" if score >= 50 else "Active" if score >= 25 else "Stable"
        result.append({"path": path, "score": score, "label": label, "factors": factors,
                       "commits": item["commits"], "total_churn": item["total_churn"],
                       "recent_churn": item["recent_churn"], "days_since_last_change": item["days_since_last_change"],
                       "confidence": "HIGH" if path in scores and path in files else "MEDIUM" if path in files else "LOW",
                       "description": "Maintenance activity indicator from sampled Git history and current repository structure."})
    result.sort(key=lambda item: (-item["score"], -item["commits"], item["path"]))
    return result[:limit]
