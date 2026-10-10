"""Execution-flow documents from the existing deterministic trace service."""

import re

from .models import section, citation
from security import is_sensitive_file


def generate(model, trace):
    flows = (trace or {}).get("flows") or []
    if not flows:
        return [section("flow-unavailable", "Execution flow", unknowns=["No source-backed execution flow was resolved for this request."])]
    result = []
    for index, flow in enumerate(flows[:3]):
        steps = [step for step in (flow.get("steps") or []) if not is_sensitive_file(step.get("file") or "")][:20]
        result.append(section(f"flow-{index}", flow.get("title") or "Execution flow",
            facts=[f"{position + 1}. {step.get('label', '?')} — {step.get('file', '?')}"
                   for position, step in enumerate(steps) if not step.get("is_inferred")],
            inferences=[f"{position + 1}. {step.get('label', '?')} — {step.get('file', '?')}"
                        for position, step in enumerate(steps) if step.get("is_inferred")],
            citations=[citation(step.get("file"), step.get("line"), symbol=step.get("symbol")) for step in steps],
            diagram=_diagram(steps)))
    return result


def _diagram(steps):
    if len(steps) < 2:
        return None
    lines = ["flowchart LR"]
    for index, step in enumerate(steps[:20]):
        label = re.sub(r"[^A-Za-z0-9_./ -]", "_", str(step.get("label") or step.get("file") or "Step"))[:70]
        lines.append(f'  n{index}["{label}"]')
        if index:
            lines.append(f"  n{index - 1} --> n{index}")
    return "\n".join(lines)
