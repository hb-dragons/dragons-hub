# ISSUES

Here are the open issues in the repo that are ready for agent work:

<issues-json>

!`gh issue list --state open --label ready-for-agent --limit 100 --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

</issues-json>

Issues labelled `ready-for-human` are deliberately absent: they need a human and must never be planned here.

# TASK

Analyze the open issues and build a dependency graph, then select the issues that can be worked **right now**.

## Dependency rules

1. **Explicit edges are authoritative.** Ticket bodies declare blockers in a `## Blocked by` section listing issue references (`#213` etc.). Use these as the primary source of edges.
2. On top of the explicit edges, an issue B is also **blocked by** issue A if:
   - B requires code or infrastructure that A introduces
   - B and A modify overlapping files or modules, making concurrent work likely to produce merge conflicts
   - B's requirements depend on a decision or API shape that A will establish
3. **A blocker counts as resolved** when the blocking issue is closed, **or** when its comments contain a "Merged by sandcastle" marker — that means its implementation already landed and it stays open only for a manual QA pass. Manual QA never blocks dependent implementation work.
4. **Never select an issue whose own comments contain a "Merged by sandcastle" marker.** Its code is done; re-implementing it would duplicate work.
5. **Never select an umbrella/spec issue** — one whose body is a specification broken down into sub-issue tickets rather than a single implementable slice. Only leaf tickets are workable.

An issue is **unblocked** if it has zero unresolved blocking dependencies.

For each unblocked issue, assign a branch name using the exact format `sandcastle/issue-{id}` (no slug or other suffix). This must be deterministic so that re-planning the same issue always produces the same branch name and accumulated progress is preserved.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42"}]}
</plan>

Include only unblocked, selectable issues. If every remaining issue is blocked, output an empty list — do **not** pick a "least blocked" candidate; blocked means blocked.

Always emit the `<plan>` tags, even when there is nothing to do. If there are no issues to work on at all, output `<plan>{"issues": []}</plan>` so the run can exit cleanly.
