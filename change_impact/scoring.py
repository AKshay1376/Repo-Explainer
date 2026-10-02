"""
change_impact/scoring.py
Deterministic risk scoring, centrality calculation, blast radius calculation,
and programmatic summary generation for Phase 8 Change Impact Analysis.
0 LLM calls.
"""

from typing import Dict, Any, List, Tuple
from change_impact.models import (
    ImpactTarget,
    ImpactNode,
    BlastRadius,
    RiskLevel,
    ImpactType,
    ImpactConfidence,
)
from change_impact.precomputed import RepositoryIndex

# Deterministic risk factor weights
WEIGHT_ENTRY_POINT = 3.0
WEIGHT_API_ROUTE = 2.0
WEIGHT_DATABASE_MODEL = 2.0
WEIGHT_CYCLE = 2.0
WEIGHT_DIRECT_CONFIRMED = 1.0
WEIGHT_DIRECT_MAX = 10.0
WEIGHT_TRANSITIVE = 0.5
WEIGHT_TRANSITIVE_MAX = 10.0
WEIGHT_TEST_EXPOSURE = 2.0
WEIGHT_HIGH_CENTRALITY = 1.0

THRESHOLD_HIGH_CENTRALITY = 5
THRESHOLD_TEST_EXPOSURE = 3

RISK_CUTOFF_MEDIUM = 5.0
RISK_CUTOFF_HIGH = 12.0


def compute_centrality(file_path: str, index: RepositoryIndex) -> Dict[str, int]:
    """
    Calculate lightweight structural centrality metrics using in-degree and out-degree.
    """
    in_deg = index.in_degrees.get(file_path, 0)
    out_deg = index.out_degrees.get(file_path, 0)
    rev_deps_count = len(index.reverse_deps.get(file_path, set()))
    return {
        "in_degree": in_deg,
        "out_degree": out_deg,
        "reverse_dependents": rev_deps_count,
    }


def compute_blast_radius(
    nodes: List[ImpactNode],
    affected_tests: List[Dict[str, Any]],
    affected_routes: List[Dict[str, Any]],
    affected_models: List[Dict[str, Any]],
) -> BlastRadius:
    """
    Calculate blast radius counts from detected nodes and entities.
    """
    direct_count = sum(1 for n in nodes if n.impact_type == ImpactType.DIRECT.value)
    transitive_count = sum(
        1 for n in nodes
        if n.impact_type in (ImpactType.TRANSITIVE.value, ImpactType.TEST.value) and n.depth > 1
    )

    # Unique files excluding target
    unique_impacted_files = {
        n.file for n in nodes if n.impact_type != ImpactType.TARGET.value
    }

    return BlastRadius(
        directly_affected=direct_count,
        transitively_affected=transitive_count,
        tests_affected=len(affected_tests),
        routes_affected=len(affected_routes),
        models_affected=len(affected_models),
        total_affected=len(unique_impacted_files),
    )


def compute_risk_score(
    target: ImpactTarget,
    nodes: List[ImpactNode],
    affected_tests: List[Dict[str, Any]],
    affected_routes: List[Dict[str, Any]],
    affected_models: List[Dict[str, Any]],
    repo_model: Dict[str, Any],
    index: RepositoryIndex,
    warnings: List[str],
) -> Tuple[float, str, List[str]]:
    """
    Calculate deterministic risk score, risk level, and explainable risk factors.
    Returns: (score, risk_level, risk_factors)
    """
    score = 0.0
    factors: List[str] = []

    # 1. Entry point check (+3)
    entry_points = [ep.get("path") for ep in (repo_model.get("entry_points") or []) if isinstance(ep, dict)]
    if target.file in entry_points:
        score += WEIGHT_ENTRY_POINT
        factors.append(f"Target is a repository entry point (+{int(WEIGHT_ENTRY_POINT)})")

    # 2. Public API route involvement (+2)
    if affected_routes:
        score += WEIGHT_API_ROUTE
        factors.append(f"Directly affects {len(affected_routes)} API route(s) (+{int(WEIGHT_API_ROUTE)})")

    # 3. Database model involvement (+2)
    if affected_models:
        score += WEIGHT_DATABASE_MODEL
        factors.append(f"Directly affects {len(affected_models)} database model(s) (+{int(WEIGHT_DATABASE_MODEL)})")

    # 4. Dependency cycle detected (+2)
    has_cycles = any("cycle detected" in w.lower() for w in warnings)
    if has_cycles:
        score += WEIGHT_CYCLE
        factors.append(f"Participates in a circular dependency chain (+{int(WEIGHT_CYCLE)})")

    # 5. Direct confirmed dependents (+1 each up to max 10)
    confirmed_direct = sum(
        1 for n in nodes
        if n.impact_type == ImpactType.DIRECT.value and n.confidence == ImpactConfidence.CONFIRMED.value
    )
    direct_points = min(confirmed_direct * WEIGHT_DIRECT_CONFIRMED, WEIGHT_DIRECT_MAX)
    if direct_points > 0:
        score += direct_points
        factors.append(f"{confirmed_direct} confirmed direct dependent(s) (+{direct_points:.1f})")

    # 6. Transitive dependents (+0.5 each up to max 10)
    transitive_count = sum(
        1 for n in nodes
        if n.impact_type in (ImpactType.TRANSITIVE.value, ImpactType.TEST.value) and n.depth > 1
    )
    transitive_points = min(transitive_count * WEIGHT_TRANSITIVE, WEIGHT_TRANSITIVE_MAX)
    if transitive_points > 0:
        score += transitive_points
        factors.append(f"{transitive_count} transitive dependent(s) (+{transitive_points:.1f})")

    # 7. Test exposure check (+2)
    if len(affected_tests) >= THRESHOLD_TEST_EXPOSURE:
        score += WEIGHT_TEST_EXPOSURE
        factors.append(f"Broad test coverage exposure ({len(affected_tests)} tests affected) (+{int(WEIGHT_TEST_EXPOSURE)})")

    # 8. Structural centrality check (+1)
    centrality = compute_centrality(target.file, index)
    if centrality["in_degree"] > THRESHOLD_HIGH_CENTRALITY:
        score += WEIGHT_HIGH_CENTRALITY
        factors.append(f"High structural in-degree centrality ({centrality['in_degree']}) (+{int(WEIGHT_HIGH_CENTRALITY)})")

    # Score cutoffs
    if score < RISK_CUTOFF_MEDIUM:
        level = RiskLevel.LOW.value
    elif score <= RISK_CUTOFF_HIGH:
        level = RiskLevel.MEDIUM.value
    else:
        level = RiskLevel.HIGH.value

    return round(score, 1), level, factors


def generate_summary(
    target: ImpactTarget,
    blast_radius: BlastRadius,
    risk_level: str,
    affected_routes: List[Dict[str, Any]],
    affected_tests: List[Dict[str, Any]],
) -> str:
    """
    Produce a deterministic, evidence-grounded summary text without calling an LLM.
    """
    target_name = target.symbol or target.route or target.model_name or target.env_var or target.file
    target_label = f"`{target_name}`"

    direct_str = f"{blast_radius.directly_affected} file" if blast_radius.directly_affected == 1 else f"{blast_radius.directly_affected} files"
    trans_str = f"{blast_radius.transitively_affected} additional file" if blast_radius.transitively_affected == 1 else f"{blast_radius.transitively_affected} additional files"
    test_str = f"{blast_radius.tests_affected} test" if blast_radius.tests_affected == 1 else f"{blast_radius.tests_affected} tests"
    route_str = f"{blast_radius.routes_affected} API route" if blast_radius.routes_affected == 1 else f"{blast_radius.routes_affected} API routes"

    summary = (
        f"Modifying {target_label} may directly affect {direct_str} and transitively affect {trans_str}. "
        f"{test_str} and {route_str} are connected through confirmed or structural dependency paths. "
        f"Overall risk assessment: {risk_level}."
    )
    return summary
