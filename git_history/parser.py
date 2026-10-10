"""Parse NUL-delimited Git records without interpreting repository content as commands."""

import hashlib
import re


FORMAT = "%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%cI%x1f%s"


def _text(value):
    return value.decode("utf-8", "replace")


def _author_name(value):
    name = _text(value)
    return "Contributor" if re.search(r"\S+@\S+", name) else name


def parse_numstat(data):
    """Return path changes, including Git-confirmed renames from -z numstat."""
    fields = data.lstrip(b"\n").split(b"\x00")
    changes = []
    index = 0
    while index < len(fields):
        field = fields[index].lstrip(b"\n")
        index += 1
        if not field or b"\t" not in field:
            continue
        parts = field.split(b"\t", 2)
        if len(parts) != 3:
            continue
        added = int(parts[0]) if parts[0].isdigit() else 0
        removed = int(parts[1]) if parts[1].isdigit() else 0
        path = _text(parts[2])
        old_path = None
        if not path and index + 1 < len(fields):
            old_path, path = _text(fields[index]), _text(fields[index + 1])
            index += 2
        if path:
            changes.append({"path": path, "old_path": old_path, "additions": added,
                            "deletions": removed, "binary": parts[0] == b"-"})
    return changes


def parse_log(data):
    commits = []
    for block in data.split(b"\x1e"):
        if not block.strip():
            continue
        header, separator, stats = block.partition(b"\x00")
        columns = header.strip(b"\n").split(b"\x1f", 6)
        if len(columns) != 7:
            continue
        sha, parents, _, email, authored, committed, subject = map(_text, columns)
        author = _author_name(columns[2])
        changes = parse_numstat(stats) if separator else []
        commits.append({"sha": sha, "short_sha": sha[:8], "parents": parents.split() if parents else [],
                        "author_name": author, "author_email_hash": hashlib.sha256(email.lower().encode()).hexdigest()[:12],
                        "author_date": authored, "committer_date": committed, "subject": subject,
                        "files_changed": len(changes), "insertions": sum(c["additions"] for c in changes),
                        "deletions": sum(c["deletions"] for c in changes), "is_merge": len(parents.split()) > 1,
                        "files": changes, "tags": [], "branches": []})
    return commits


def parse_name_status(data):
    fields = data.split(b"\x00")
    changes = []
    index = 0
    while index < len(fields):
        code = _text(fields[index]).strip()
        index += 1
        if not code or index >= len(fields):
            continue
        if code[0] in "RC":
            if index + 1 >= len(fields):
                break
            old_path, path = _text(fields[index]), _text(fields[index + 1])
            index += 2
        else:
            old_path, path = None, _text(fields[index])
            index += 1
        if path:
            changes.append({"status": code[0], "similarity": int(code[1:]) if code[1:].isdigit() else None,
                            "path": path, "old_path": old_path})
    return changes


def parse_blame(data):
    lines = []
    current = {}
    for raw in data.splitlines():
        if raw.startswith(b"\t"):
            if current:
                lines.append(current)
            current = {}
            continue
        parts = raw.split(b" ", 1)
        if len(parts) != 2:
            continue
        key, value = parts
        if key == b"author":
            current["author_name"] = _author_name(value)
        elif key == b"author-time":
            current["author_time"] = int(value) if value.isdigit() else None
        elif key == b"summary":
            current["subject"] = _text(value)
        elif len(key) in (40, 64) and all(character in b"0123456789abcdef" for character in key):
            current["sha"] = _text(key)
            current["line"] = int(parts[1].split()[1])
    return lines
