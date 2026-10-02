"""
change_impact/traversal.py
Deterministic bounded BFS reverse-dependency traversal, cycle detection,
and path reconstruction for Phase 8 Change Impact Analysis.
0 LLM calls.
"""

from collections import deque
from typing import Dict, Any, List, Set, Tuple, Optional
from change_impact.models import (
    ImpactNode,
    ImpactEdge,
    ImpactType,
    ImpactConfidence,
    ChangeType,
)
from change_impact.precomputed import RepositoryIndex

MAX_DEPTH = 4
MAX_VISITED_NODES = 300
MAX_DISPLAYED_NODES = 100


def reconstruct_path(parent_map: Dict[str, str], current: str, start: str) -> List[str]:
    """
    Reconstruct path from start to current node using parent tracking.
    """
    path = [current]
    curr = current
    seen = {curr}
    while curr in parent_map and parent_map[curr] != curr:
        p = parent_map[curr]
        if p in seen:
            break
        path.append(p)
        seen.add(p)
        curr = p
        if curr == start:
            break
    path.reverse()
    return path


def traverse_reverse_dependencies(
    target_file: str,
    repo_model: Dict[str, Any],
    index: RepositoryIndex,
    direct_nodes: List[ImpactNode],
    max_depth: int = 2,
    change_type: str = "GENERAL",
) -> Tuple[List[ImpactNode], List[ImpactEdge], List[str], bool]:
    """
    Perform a bounded BFS traversal across reverse dependencies to find transitive impacts.
    Returns: (all_impact_nodes, impact_edges, warnings, truncated_flag)
    """
    depth_limit = max(1, min(max_depth, MAX_DEPTH))
    warnings: List[str] = []
    truncated = False

    all_nodes: List[ImpactNode] = []
    edges: List[ImpactEdge] = []
    edge_ids: Set[str] = set()

    # Create root target node
    target_layer = index.file_to_layer.get(target_file, "Unassigned")
    target_cat = index.file_categories.get(target_file, "unknown")
    target_node = ImpactNode(
        id=f"node_{target_file.replace('/', '_').replace('.', '_')}",
        file=target_file,
        category=target_cat,
        architecture_layer=target_layer,
        impact_type=ImpactType.TARGET.value,
        depth=0,
        confidence=ImpactConfidence.CONFIRMED.value,
        evidence="Impact analysis target",
        path_from_target=[target_file],
    )
    all_nodes.append(target_node)

    visited: Set[str] = {target_file}
    parent_map: Dict[str, str] = {}

    # Queue contains: (file, current_depth, path_from_root)
    queue: deque = deque()

    # Seed queue with direct nodes
    for dnode in direct_nodes:
        if dnode.file not in visited:
            visited.add(dnode.file)
            parent_map[dnode.file] = target_file
            all_nodes.append(dnode)

            # Edge from target to direct dependent
            edge_id = f"edge_{target_file}->{dnode.file}"
            if edge_id not in edge_ids:
                edge_ids.add(edge_id)
                edges.append(
                    ImpactEdge(
                        id=edge_id,
                        source=target_node.id,
                        target=dnode.id,
                        relationship="imported_by" if "import" in dnode.evidence.lower() else "impacts",
                        confidence=dnode.confidence,
                        evidence=dnode.evidence,
                    )
                )

            if depth_limit > 1:
                queue.append((dnode.file, 1, [target_file, dnode.file]))

    detected_cycles: Set[Tuple[str, str]] = set()

    # BFS for transitive levels (depth 2 up to max_depth)
    while queue:
        curr_file, curr_depth, curr_path = queue.popleft()

        if len(visited) >= MAX_VISITED_NODES:
            truncated = True
            warnings.append(f"Analysis reached maximum boundary of {MAX_VISITED_NODES} files. Transitive traversal stopped.")
            break

        if curr_depth >= depth_limit:
            continue

        next_depth = curr_depth + 1
        dependents = sorted(list(index.reverse_deps.get(curr_file, set())))

        for dep_file in dependents:
            # Cycle detection
            if dep_file in curr_path:
                cycle_pair = (curr_file, dep_file)
                if cycle_pair not in detected_cycles:
                    detected_cycles.add(cycle_pair)
                    cycle_repr = " → ".join(curr_path[curr_path.index(dep_file):] + [dep_file])
                    warnings.append(f"Dependency cycle detected: {cycle_repr}")
                continue

            edge_key = (curr_file, dep_file)
            rel_edge_info = index.dependency_edges.get(edge_key, {})
            edge_rel = rel_edge_info.get("type", "imports") if isinstance(rel_edge_info, dict) else "imports"

            source_node_id = f"node_{curr_file.replace('/', '_').replace('.', '_')}"
            dep_node_id = f"node_{dep_file.replace('/', '_').replace('.', '_')}"

            # Create or update edge
            edge_id = f"edge_{curr_file}->{dep_file}"
            if edge_id not in edge_ids:
                edge_ids.add(edge_id)
                edges.append(
                    ImpactEdge(
                        id=edge_id,
                        source=source_node_id,
                        target=dep_node_id,
                        relationship=f"transitively {edge_rel}",
                        confidence=ImpactConfidence.CONFIRMED.value if curr_depth == 1 else ImpactConfidence.LIKELY.value,
                        evidence=f"Connected via `{curr_file}`",
                    )
                )

            if dep_file in visited:
                continue

            visited.add(dep_file)
            parent_map[dep_file] = curr_file
            new_path = curr_path + [dep_file]

            # Transitive confidence: degrades gracefully with depth unless reinforced
            if next_depth == 2:
                trans_conf = ImpactConfidence.LIKELY.value
            else:
                trans_conf = ImpactConfidence.INFERRED.value

            dep_cat = index.file_categories.get(dep_file, "unknown")
            dep_layer = index.file_to_layer.get(dep_file, "Unassigned")

            # Check if this node is a test file
            impact_type = ImpactType.TRANSITIVE.value
            if dep_cat == "test" or dep_file in index.test_files:
                impact_type = ImpactType.TEST.value
                trans_conf = ImpactConfidence.LIKELY.value

            trans_node = ImpactNode(
                id=dep_node_id,
                file=dep_file,
                category=dep_cat,
                architecture_layer=dep_layer,
                impact_type=impact_type,
                depth=next_depth,
                confidence=trans_conf,
                evidence=f"Transitively depends on `{target_file}` via `{curr_file}` (depth {next_depth})",
                path_from_target=new_path,
            )
            all_nodes.append(trans_node)

            if next_depth < depth_limit:
                queue.append((dep_file, next_depth, new_path))

    return all_nodes, edges, warnings, truncated
