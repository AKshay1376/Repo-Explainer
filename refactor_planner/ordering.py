"""Stable step topological ordering and explicit cycle reporting."""

from collections import defaultdict
from typing import List, Tuple
from .models import PlanStep


def order_steps(steps: List[PlanStep]) -> Tuple[List[PlanStep], List[List[str]]]:
    by_id = {step.id: step for step in steps}
    if len(by_id) != len(steps):
        raise ValueError("Duplicate step identifier.")
    incoming = {step.id: set(step.prerequisites) for step in steps}
    outgoing = defaultdict(set)
    for step in steps:
        if step.id in incoming[step.id] or incoming[step.id] - by_id.keys():
            raise ValueError("Invalid step prerequisite.")
        for parent in step.prerequisites:
            outgoing[parent].add(step.id)
    ready = sorted(item for item, parents in incoming.items() if not parents)
    ordered = []
    while ready:
        current = ready.pop(0)
        ordered.append(by_id[current])
        for child in sorted(outgoing[current]):
            incoming[child].discard(current)
            if not incoming[child]:
                ready.append(child)
        ready.sort()
    remaining = sorted(set(by_id) - {step.id for step in ordered})
    cycles = []
    numbers = {}
    low = {}
    stack = []
    on_stack = set()

    def strongconnect(item):
        numbers[item] = low[item] = len(numbers)
        stack.append(item)
        on_stack.add(item)
        for child in sorted(outgoing[item] & set(remaining)):
            if child not in numbers:
                strongconnect(child)
                low[item] = min(low[item], low[child])
            elif child in on_stack:
                low[item] = min(low[item], numbers[child])
        if low[item] == numbers[item]:
            component = []
            while True:
                child = stack.pop()
                on_stack.remove(child)
                component.append(child)
                if child == item:
                    break
            if len(component) > 1:
                cycles.append(sorted(component))

    for item in remaining:
        if item not in numbers:
            strongconnect(item)
    cycles.sort()
    ordered.extend(by_id[item] for item in remaining)
    for number, step in enumerate(ordered, 1):
        step.order = number
    return ordered, cycles


def dependency_cycles(forward_deps, affected):
    """Find bounded file dependency cycles relevant to a plan."""
    affected = set(affected)
    colors = {}
    stack = []
    cycles = []

    def visit(file):
        colors[file] = 1
        stack.append(file)
        for dependency in sorted(set(forward_deps.get(file, ())) & affected):
            if colors.get(dependency) == 1:
                cycle = stack[stack.index(dependency):] + [dependency]
                if cycle not in cycles:
                    cycles.append(cycle)
            elif not colors.get(dependency):
                visit(dependency)
        stack.pop()
        colors[file] = 2

    for file in sorted(affected):
        if not colors.get(file):
            visit(file)
    return cycles[:10]
