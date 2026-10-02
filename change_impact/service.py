"""
change_impact/service.py
Core orchestration service for Phase 8 Change Impact Analysis.
Coordinates target resolution, precomputed lookups, direct and transitive analysis,
risk scoring, and bounded caching.
0 LLM calls.
"""

import logging
from typing import Dict, Any, Optional
from change_impact.models import ImpactAnalysis, ImpactTarget
from change_impact.precomputed import build_repository_index
from change_impact.analyzer import (
    resolve_impact_target,
    analyze_direct_impacts,
    detect_affected_tests,
    detect_affected_routes,
    detect_affected_models,
    detect_affected_features,
)
from change_impact.traversal import traverse_reverse_dependencies
from change_impact.scoring import (
    compute_blast_radius,
    compute_risk_score,
    generate_summary,
)
from cache_manager import get_cached_impact, set_cached_impact

logger = logging.getLogger(__name__)


class ChangeImpactService:
    """Service orchestrating evidence-grounded Change Impact Analysis."""

    def analyze_impact(
        self,
        repo_model: Dict[str, Any],
        target_file: Optional[str] = None,
        target_symbol: Optional[str] = None,
        target_route: Optional[str] = None,
        target_model: Optional[str] = None,
        target_env_var: Optional[str] = None,
        change_type: str = "GENERAL",
        depth: int = 2,
        file_contents: Optional[Dict[str, str]] = None,
        repo_cache_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyze change impact deterministically with zero LLM calls.
        """
        # 1. Bounded TTL Cache lookup
        norm_file = (target_file or "").strip()
        norm_sym = (target_symbol or "").strip()
        norm_route = (target_route or "").strip()
        norm_model = (target_model or "").strip()
        norm_env = (target_env_var or "").strip()
        clamped_depth = max(1, min(depth or 2, 4))
        norm_type = (change_type or "GENERAL").upper()

        cache_key = (
            f"impact:{repo_cache_key or 'default'}:{norm_file}:{norm_sym}:"
            f"{norm_route}:{norm_model}:{norm_env}:{norm_type}:{clamped_depth}"
        )

        cached_res = get_cached_impact(cache_key)
        if cached_res:
            logger.info("Returning cached change impact analysis for %s", cache_key)
            return cached_res

        # 2. Get or construct precomputed index (O(1) lookups)
        index_key = f"index:{repo_cache_key}" if repo_cache_key else None
        index = build_repository_index(repo_model, file_contents, cache_key=index_key)

        # 3. Resolve target
        target = resolve_impact_target(
            repo_model=repo_model,
            index=index,
            target_file=target_file,
            target_symbol=target_symbol,
            target_route=target_route,
            target_model=target_model,
            target_env_var=target_env_var,
        )

        if not target or not target.file:
            return {
                "success": False,
                "error": "Could not resolve a valid target file, symbol, route, or model in this repository.",
                "analysis": None,
            }

        # 4. Direct impact detection
        direct_nodes = analyze_direct_impacts(
            target=target,
            repo_model=repo_model,
            index=index,
            file_contents=file_contents,
            change_type=norm_type,
        )

        # 5. Transitive bounded BFS traversal
        all_nodes, edges, warnings, truncated = traverse_reverse_dependencies(
            target_file=target.file,
            repo_model=repo_model,
            index=index,
            direct_nodes=direct_nodes,
            max_depth=clamped_depth,
            change_type=norm_type,
        )

        # 6. Entity impact detection
        affected_tests = detect_affected_tests(target, direct_nodes, repo_model, index, file_contents)
        affected_routes = detect_affected_routes(target, direct_nodes, repo_model, index)
        affected_models = detect_affected_models(target, direct_nodes, repo_model, index)
        affected_features = detect_affected_features(all_nodes, affected_routes, repo_model)

        # 7. Metrics, scoring, and blast radius
        blast_radius = compute_blast_radius(all_nodes, affected_tests, affected_routes, affected_models)
        risk_score, risk_level, risk_factors = compute_risk_score(
            target=target,
            nodes=all_nodes,
            affected_tests=affected_tests,
            affected_routes=affected_routes,
            affected_models=affected_models,
            repo_model=repo_model,
            index=index,
            warnings=warnings,
        )

        # 8. Deterministic summary
        summary = generate_summary(target, blast_radius, risk_level, affected_routes, affected_tests)

        # 9. Build structured response
        analysis = ImpactAnalysis(
            target=target,
            change_type=norm_type,
            depth=clamped_depth,
            summary=summary,
            blast_radius=blast_radius,
            risk_level=risk_level,
            risk_score=risk_score,
            risk_factors=risk_factors,
            nodes=all_nodes,
            edges=edges,
            affected_tests=affected_tests,
            affected_routes=affected_routes,
            affected_models=affected_models,
            affected_features=affected_features,
            warnings=warnings,
            truncated=truncated,
        )

        result = {
            "success": True,
            "analysis": analysis.to_dict(),
        }

        # Store in cache
        set_cached_impact(cache_key, result)

        return result
