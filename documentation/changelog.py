"""Bounded Git change summaries, never inferred build status."""

from .models import section, citation
from security import is_sensitive_file


def generate(history, *, evolution=None, comparison=None):
    commits = (history or {}).get("commits") or []
    if not commits and not comparison:
        return [section("changes-unavailable", "Change summary", unknowns=["Matching local Git history is unavailable."])]
    facts = [f"{item.get('short_sha')}: {item.get('subject')} — {item.get('files_changed')} files, +{item.get('insertions')}/-{item.get('deletions')} lines"
             for item in commits[:30]]
    sections = [section("commits", "Sampled commits", facts=facts,
                        unknowns=["No matching commits were sampled in this range."] if not commits else
                                 ["Commit activity does not establish successful validation or deployed behavior."])]
    if comparison:
        visible = [item for item in comparison.get("files", []) if not item.get("redacted")]
        sections.append(section("comparison", "Selected commit range", facts=[
            f"{comparison.get('before') or 'root'} → {comparison.get('after')}: {comparison.get('files_changed')} files; "
            f"+{comparison.get('insertions')}/-{comparison.get('deletions')} lines"] +
            [f"{item.get('status')} {item.get('path')}" for item in visible[:30]],
            unknowns=["Diff statistics do not establish runtime behavior."]))
    if evolution:
        points = [point for point in evolution.get("checkpoints", []) if point.get("available")]
        sections.append(section("evolution", "Sampled file-tree evolution",
            facts=[f"{point['days_ago']} days ago: {point['files_before']} → {point['files_now']} files; "
                   f"+{point['files_added']} added, -{point['files_removed']} removed." for point in points],
            unknowns=["Historical routes and dependency counts were not re-analyzed."]))
    return sections


def debt(model, health=None, hotspots=None):
    findings = [item for item in (health or {}).get("top_issues", []) if not is_sensitive_file(item.get("file") or "")][:20]
    areas = [item for item in (hotspots or {}).get("hotspots", []) if not is_sensitive_file(item.get("path") or "")][:10]
    result = [section("health", "Project Health findings",
        inferences=[f"{item.get('severity')} {item.get('title')}: {item.get('summary')} — suggested: "
                    f"{item.get('why_it_matters') or 'review evidence'}" for item in findings],
        citations=[citation(item.get("file"), item.get("start_line")) for item in findings],
        unknowns=[] if health else ["Project Health analysis is unavailable."])]
    result.append(section("hotspots", "Maintenance activity",
        inferences=[f"{item.get('path')}: {item.get('label')} ({item.get('score')}/100), "
                    f"{item.get('commits')} sampled changes" for item in areas],
        citations=[citation(item.get("path")) for item in areas],
        unknowns=["Hotspot scores are maintenance indicators, not confirmed defects."]))
    return result
