"""Shared limits and labels for Git history responses."""

DEFAULT_LIMIT = 50
MAX_LIMIT = 200
MAX_SCAN = 500
MAX_DIFF_BYTES = 240_000
MAX_SOURCE_BYTES = 200_000
MAX_BLAME_LINES = 200
HOTSPOT_WEIGHTS = {"churn": 35, "frequency": 25, "centrality": 20, "maintainability": 20}
HOTSPOT_THRESHOLDS = {"Stable": 0, "Active": 25, "Hotspot": 50, "Critical Hotspot": 75}
