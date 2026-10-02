"""
execution_trace package
Deterministic static execution path tracing engine for Repo Explainer.
"""

from execution_trace.models import (
    StepType,
    ConfidenceLevel,
    ExecutionStep,
    ExecutionEdge,
    ExecutionFlow,
)
from execution_trace.matcher import (
    extract_http_client_calls,
    match_http_client_to_routes,
    resolve_trace_start_points,
)
from execution_trace.traversal import traverse_execution_paths
from execution_trace.ranking import rank_and_synthesize_flows
from execution_trace.service import ExecutionTraceService, default_trace_service

__all__ = [
    "StepType",
    "ConfidenceLevel",
    "ExecutionStep",
    "ExecutionEdge",
    "ExecutionFlow",
    "extract_http_client_calls",
    "match_http_client_to_routes",
    "resolve_trace_start_points",
    "traverse_execution_paths",
    "rank_and_synthesize_flows",
    "ExecutionTraceService",
    "default_trace_service",
]
