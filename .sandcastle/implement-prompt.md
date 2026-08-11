# TASK

Implement issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view {{TASK_ID}} --comments`. If it names a parent spec issue, pull that in too — but implement **only** this ticket's slice of it.

Work on branch {{BRANCH}}. Make commits and run tests.

# CONTEXT

`CLAUDE.md` at the repo root is authoritative — read it and follow it. Also read the decision records the ticket builds on before writing code:

- `CONTEXT.md` (project glossary and framing)
- `docs/adr/` (accepted architecture decisions — respect them, do not relitigate them)
- Any research note the issue cites under `docs/`

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

Use RGR to complete the task:

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

This is a pnpm + Turborepo monorepo — always `pnpm`, never `npm`. When passing flags through `pnpm --filter`, omit the `--` separator (pnpm silently drops flags after it).

- Tight loop while implementing: the owning package's tests, e.g. `pnpm --filter @dragons/native test`
- Before every commit: `pnpm typecheck` and `pnpm lint`
- Before declaring the task complete: `pnpm test` (full workspace) and the owning package's `coverage` script — coverage thresholds ratchet and the build fails below them, so new code needs tests that keep the gate green

# COMMIT

Use this repo's conventional commit style: `type(scope): summary` referencing the issue, e.g. `feat(native): adopt native tabs shell (#216)`.

Never add `Co-Authored-By`, `Signed-off-by`, or any other trailer crediting an AI. Commits are authored solely by the human developer.

# THE ISSUE

Leave a comment on the issue describing what was done, key decisions, and anything a reviewer should look at. If the issue has a "Manual QA pass recorded" acceptance criterion, say explicitly that manual QA is still outstanding — that criterion can only be satisfied by a human on a device build.

Do not close the issue — closing is decided at merge time.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
