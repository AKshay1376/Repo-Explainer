"""Bridge changed current files to the existing Change Impact engine."""


def current_impact(model, changed_files, impact_service, *, limit=12):
    files = (model or {}).get("files") or {}
    results = []
    for path in changed_files:
        if path not in files or len(results) >= limit:
            continue
        response = impact_service.analyze_impact(model, target_file=path, change_type="GENERAL", depth=2)
        if not response.get("success"):
            continue
        analysis = response["analysis"]
        results.append({"file": path, "risk_level": analysis.get("risk_level"),
                        "summary": analysis.get("summary"), "blast_radius": analysis.get("blast_radius"),
                        "affected_tests": analysis.get("affected_tests", [])[:20],
                        "affected_routes": analysis.get("affected_routes", [])[:20],
                        "affected_models": analysis.get("affected_models", [])[:20]})
    return {"label": "Current-architecture impact estimate", "files": results,
            "truncated": len([path for path in changed_files if path in files]) > limit,
            "revert_preview": "Reverting this commit may affect these current dependents; no revert was run."}
