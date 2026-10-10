"""Contributor distribution; names and counts, never raw email addresses."""

from collections import Counter


def contributors(commits, path=None):
    counts = Counter()
    names = {}
    recent = Counter()
    for index, commit in enumerate(commits):
        if path and path not in {change["path"] for change in commit.get("files", [])}:
            continue
        identity = commit["author_email_hash"]
        counts[identity] += 1
        names[identity] = commit["author_name"]
        if index < 20:
            recent[identity] += 1
    total = sum(counts.values())
    result = []
    for identity, count in counts.most_common():
        result.append({"author_name": names[identity], "commit_count": count,
                       "recent_commits": recent[identity], "share_percent": round(100 * count / total, 1) if total else 0,
                       "label": "Primary contributor" if count == counts.most_common(1)[0][1] else "Frequent contributor" if count >= 2 else "Contributor"})
    return result
