"""
execution_trace/service.py
Core orchestration service for Execution Path Tracing.
Coordinates starting point resolution, graph traversal, cycle detection,
path ranking, and flow synthesis.
"""

import logging
from typing import Dict, Any, List, Optional
from execution_trace.models import ExecutionFlow
from execution_trace.matcher import resolve_trace_start_points
from execution_trace.traversal import traverse_execution_paths
from execution_trace.ranking import rank_and_synthesize_flows

logger = logging.getLogger(__name__)


class ExecutionTraceService:
    """Service orchestrating deterministic static execution path tracing."""

    def trace_execution(
        self,
        repo_model: Dict[str, Any],
        query: Optional[str] = None,
        start_file: Optional[str] = None,
        start_symbol: Optional[str] = None,
        route: Optional[str] = None,
        ask_repo_context: Optional[Dict[str, Any]] = None,
        file_contents: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Compute evidence-grounded execution traces through the repository.
        """
        # 1. Resolve starting points
        start_steps = resolve_trace_start_points(
            repo_model=repo_model,
            query=query,
            start_file=start_file,
            start_symbol=start_symbol,
            route=route,
            ask_repo_context=ask_repo_context,
            file_contents=file_contents
        )

        if not start_steps:
            return {
                "success": False,
                "error": "No valid starting point could be resolved for tracing.",
                "flows": [],
                "primary_flow_id": None,
                "warnings": ["Could not locate matching entry point, file, symbol, or route."],
            }

        # 2. Explore execution paths from resolved start steps
        all_raw_paths = []
        for start_step in start_steps[:3]:
            paths = traverse_execution_paths(
                start_step=start_step,
                repo_model=repo_model,
                file_contents=file_contents
            )
            all_raw_paths.extend(paths)

        # 3. Rank and synthesize flows
        flows = rank_and_synthesize_flows(all_raw_paths, query=query)

        # Gather all warnings across flows
        warnings = []
        for f in flows:
            for w in f.warnings:
                if w not in warnings:
                    warnings.append(w)

        primary_id = flows[0].id if flows else None

        return {
            "success": True,
            "flows": [f.to_dict() for f in flows],
            "primary_flow_id": primary_id,
            "total_flows": len(flows),
            "warnings": warnings,
            "start_step": start_steps[0].to_dict() if start_steps else None,
        }


# Global singleton instance
default_trace_service = ExecutionTraceService()
