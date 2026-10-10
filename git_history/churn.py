"""File activity metrics from bounded parsed commits."""

from collections import defaultdict
from datetime import datetime, timezone

from security import is_sensitive_file


def file_churn(commits, *, recent_days=30):
    now = datetime.now(timezone.utc)
    metrics = defaultdict(lambda: {"commits": 0, "additions": 0, "deletions": 0, "recent_churn": 0,
                                   "latest_commit": None, "latest_date": None, "contributors": {}})
    for commit in commits:
        try:
            when = datetime.fromisoformat(commit["author_date"].replace("Z", "+00:00"))
        except (ValueError, TypeError):
            when = None
        for change in commit.get("files", []):
            path = change["path"]
            if is_sensitive_file(path):
                continue
            item = metrics[path]
            item["commits"] += 1
            item["additions"] += change["additions"]
            item["deletions"] += change["deletions"]
            if when and (now - when).days <= recent_days:
                item["recent_churn"] += change["additions"] + change["deletions"]
            if item["latest_date"] is None or commit["author_date"] > item["latest_date"]:
                item["latest_date"] = commit["author_date"]
                item["latest_commit"] = commit["sha"]
            key = commit["author_email_hash"]
            contributor = item["contributors"].setdefault(key, {"name": commit["author_name"], "commits": 0})
            contributor["commits"] += 1
    for item in metrics.values():
        item["total_churn"] = item["additions"] + item["deletions"]
        item["change_frequency"] = round(item["commits"] / max(len(commits), 1), 3)
        try:
            item["days_since_last_change"] = max(0, (now - datetime.fromisoformat(item["latest_date"].replace("Z", "+00:00"))).days)
        except (ValueError, TypeError):
            item["days_since_last_change"] = None
    return dict(metrics)
