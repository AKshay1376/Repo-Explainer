"""Deterministic line hunks and unified previews, without a patch interpreter."""

import difflib
import hashlib

from .models import PatchHunk


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def make_hunks(before: str, after: str, reason: str) -> list[PatchHunk]:
    old_lines = before.splitlines(keepends=True)
    new_lines = after.splitlines(keepends=True)
    matcher = difflib.SequenceMatcher(a=old_lines, b=new_lines, autojunk=False)
    result = []
    for tag, start, end, new_start, new_end in matcher.get_opcodes():
        if tag == "equal":
            continue
        result.append(PatchHunk(
            id=f"h{len(result) + 1}", old_start=start + 1, old_count=end - start,
            new_start=new_start + 1, new_count=new_end - new_start,
            original_lines=old_lines[start:end], proposed_lines=new_lines[new_start:new_end],
            reason=reason,
        ))
    return result


def selected_content(before: str, hunks: list[PatchHunk], selected: set[str]) -> str:
    lines = before.splitlines(keepends=True)
    previous_end = 0
    known = {hunk.id for hunk in hunks}
    if not selected or not selected <= known:
        raise ValueError("Select at least one valid hunk.")
    for hunk in hunks:
        start = hunk.old_start - 1
        end = start + hunk.old_count
        if start < previous_end or lines[start:end] != hunk.original_lines:
            raise ValueError("Overlapping or inconsistent patch hunks.")
        previous_end = end
        if hunk.id in selected and not set(hunk.depends_on) <= selected:
            raise ValueError(f"Hunk {hunk.id} depends on another unselected hunk.")
    for hunk in reversed(hunks):
        if hunk.id in selected:
            start = hunk.old_start - 1
            lines[start:start + hunk.old_count] = hunk.proposed_lines
    return "".join(lines)


def unified(path: str, before: str, after: str) -> str:
    return "".join(difflib.unified_diff(
        before.splitlines(keepends=True), after.splitlines(keepends=True),
        fromfile=f"a/{path}", tofile=f"b/{path}", n=3,
    ))
