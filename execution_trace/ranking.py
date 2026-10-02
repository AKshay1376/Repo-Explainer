"""
execution_trace/ranking.py
Candidate path ranking, scoring, and ExecutionFlow synthesis.
Selects the primary execution path and structures alternative candidate traces.
"""

from typing import List, Dict, Any, Tuple, Optional
from execution_trace.models import (
    StepType,
    ConfidenceLevel,
    ExecutionStep,
    ExecutionEdge,
    ExecutionFlow,
)


# Architectural layer progression order
LAYER_RANK = {
    StepType.UI_COMPONENT: 1,
    StepType.EVENT_HANDLER: 2,
    StepType.CLIENT_SERVICE: 3,
    StepType.API_CLIENT: 4,
    StepType.API_ROUTE: 5,
    StepType.MIDDLEWARE: 6,
    StepType.CONTROLLER: 7,
    StepType.SERVICE: 8,
    StepType.MODEL: 9,
    StepType.DATABASE: 10,
    StepType.UTILITY: 11,
    StepType.ENTRY_POINT: 0,
    StepType.UNKNOWN: 12,
}


def score_path(
    steps: List[ExecutionStep],
    edges: List[ExecutionEdge],
    cycle_detected: bool
) -> float:
    """
    Score a candidate execution path according to evidence quality,
    architectural completeness, and preferred path length.
    """
    score = 0.0

    # 1. Preferred length bonus (3 to 8 steps)
    length = len(steps)
    if 3 <= length <= 8:
        score += 35.0
    elif length == 2:
        score += 15.0
    elif length > 8:
        score += max(0.0, 30.0 - (length - 8) * 5.0)

    # 2. High confidence edges & calls
    for edge in edges:
        if edge.confidence == ConfidenceLevel.HIGH:
            score += 20.0
        elif edge.confidence == ConfidenceLevel.MEDIUM:
            score += 10.0
        else:
            score -= 10.0

        if edge.relationship == "HTTP Request":
            score += 40.0
        elif edge.relationship == "calls":
            score += 25.0
        elif edge.relationship == "queries":
            score += 25.0

    # 3. Architectural progression bonus
    # Check if layers flow in a forward direction (e.g. UI -> Route -> Service -> Model)
    types = [s.type for s in steps]
    is_progressive = True
    for i in range(len(types) - 1):
        r1 = LAYER_RANK.get(types[i], 5)
        r2 = LAYER_RANK.get(types[i + 1], 5)
        if r1 > r2 and not (types[i] == StepType.SERVICE and types[i+1] == StepType.API_CLIENT):
            is_progressive = False
            break

    if is_progressive and length >= 3:
        score += 30.0

    # 4. Diversity of architectural layers
    unique_types = set(types)
    score += len(unique_types) * 10.0

    # 5. Cycle penalty
    if cycle_detected:
        score -= 25.0

    return score


def generate_flow_description(
    title: str,
    trigger: str,
    steps: List[ExecutionStep],
    edges: List[ExecutionEdge]
) -> str:
    """Generate a step-by-step technical explanation of the execution flow."""
    lines = []
    lines.append(f"**Flow Summary:** {trigger}")
    lines.append("")
    lines.append("### Execution Steps:")
    for idx, step in enumerate(steps, 1):
        type_badge = step.type.replace("_", " ")
        sym_text = f"`{step.symbol}`" if step.symbol else ""
        lines.append(f"{idx}. **{step.label}** ({type_badge}) in `{step.file}` {sym_text}")
        if step.evidence:
            lines.append(f"   - *Evidence:* {step.evidence}")

    return "\n".join(lines)


def rank_and_synthesize_flows(
    raw_paths: List[Tuple[List[ExecutionStep], List[ExecutionEdge], bool, List[str]]],
    query: Optional[str] = None
) -> List[ExecutionFlow]:
    """
    Rank candidate execution paths and synthesize distinct ExecutionFlow objects.
    """
    if not raw_paths:
        return []

    # Score each path
    scored_paths = []
    for steps, edges, cycle, warnings in raw_paths:
        s = score_path(steps, edges, cycle)
        scored_paths.append((s, steps, edges, cycle, warnings))

    # Sort descending by score
    scored_paths.sort(key=lambda x: x[0], reverse=True)

    # Deduplicate paths that share identical step IDs
    unique_flows: List[ExecutionFlow] = []
    seen_path_fingerprints = set()

    for idx, (score_val, steps, edges, cycle, warnings) in enumerate(scored_paths):
        fingerprint = "->".join(s.id for s in steps)
        if fingerprint in seen_path_fingerprints:
            continue
        seen_path_fingerprints.add(fingerprint)

        # Determine flow title & trigger
        first_step = steps[0]
        last_step = steps[-1] if len(steps) > 1 else first_step

        if first_step.type == StepType.API_ROUTE:
            title = f"{first_step.label} Request Flow"
            trigger = f"HTTP client request targeting `{first_step.label}`"
            category = "api"
        elif first_step.type in (StepType.UI_COMPONENT, StepType.EVENT_HANDLER):
            title = f"{first_step.label} User Action Flow"
            trigger = f"User interaction in component `{first_step.file.split('/')[-1]}`"
            category = "ui"
        elif first_step.type == StepType.ENTRY_POINT:
            title = f"{first_step.label} Startup Flow"
            trigger = f"Application execution bootstrap from `{first_step.file}`"
            category = "startup"
        else:
            q_title = query.title() if query else first_step.label
            title = f"{q_title} Execution Flow"
            trigger = f"Invoked via `{first_step.label}` in `{first_step.file}`"
            category = "service"

        # Overall flow confidence
        flow_conf = ConfidenceLevel.HIGH
        if any(e.confidence == ConfidenceLevel.LOW for e in edges) or len(edges) == 0:
            flow_conf = ConfidenceLevel.MEDIUM if len(steps) > 1 else ConfidenceLevel.LOW
        elif any(e.confidence == ConfidenceLevel.MEDIUM for e in edges):
            flow_conf = ConfidenceLevel.MEDIUM

        flow_id = f"flow-{idx + 1}-{category}"
        description = generate_flow_description(title, trigger, steps, edges)

        flow = ExecutionFlow(
            id=flow_id,
            title=title,
            description=description,
            trigger=trigger,
            steps=steps,
            edges=edges,
            confidence=flow_conf,
            warnings=warnings,
            cycle_detected=cycle,
            is_primary=(len(unique_flows) == 0),
            flow_category=category,
        )
        unique_flows.append(flow)

    return unique_flows
