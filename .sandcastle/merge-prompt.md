# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-ff --no-edit` — this repo's convention is always a merge commit, never a fast-forward
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution
3. After each merge, run `pnpm typecheck`, `pnpm lint`, and `pnpm test` to verify everything works (always `pnpm`, never `npm`)
4. If checks fail, fix the issues before proceeding to the next branch

Do not push anything, and do not delete branches — the developer handles both after their own review.

If a fix-up commit is needed, use the repo's conventional style (`type(scope): summary`) and never add an AI co-author trailer.

# CLOSE OR COMMENT

Here are the issues belonging to the merged branches:

{{ISSUES}}

For each issue whose branch was merged, read it with `gh issue view <ID>` and check its acceptance criteria:

- If **every** criterion is machine-verifiable and now satisfied, close it: `gh issue close <ID> --comment "Merged by sandcastle from <branch>."`
- If it has a "Manual QA pass recorded" criterion (or any other human-only criterion), do **not** close it. Comment instead: `gh issue comment <ID> --body "Merged by sandcastle from <branch>. Implementation and automated checks are done; manual QA is still outstanding."`

The exact phrase "Merged by sandcastle" matters: the planner reads it to treat this issue's blockers as resolved for dependent tickets, and to avoid re-implementing the issue. Use it verbatim in both cases.

Once you've merged everything you can, output <promise>COMPLETE</promise>.
