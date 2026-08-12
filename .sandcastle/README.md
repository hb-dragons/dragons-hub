# Sandcastle runbook

Automation for working the `ready-for-agent` ticket backlog AFK. [Sandcastle](https://github.com/mattpocock/sandcastle) runs Claude Code agents in Docker containers over git worktrees, entirely locally — no GitHub App, no PRs, no pushes. Evaluation notes with sources: `docs/2026-08-11-sandcastle-evaluation.md`.

## One-time setup

1. Build the sandbox image (repeat after editing `Dockerfile`):

   ```bash
   npx sandcastle docker build-image
   ```

2. Fill `.sandcastle/.env` (gitignored — never commit it). `scripts/setup-sandcastle-env.sh` walks you through both values:
   - `CLAUDE_CODE_OAUTH_TOKEN` — from `claude setup-token` on the host (uses your Claude subscription)
   - `GH_TOKEN` — fine-grained PAT, this repo only, permissions: Issues (read/write) + Metadata (read). Nothing here pushes code, so no `contents` scope.

## Running a batch

```bash
git checkout -b feat/native-modernization main   # the base must already contain this setup
pnpm sandcastle
```

The merge phase lands ticket branches into **whatever branch is checked out** — always run from a dedicated integration branch, never from `main` directly.

Each cycle: a planner reads open `ready-for-agent` issues and picks the unblocked frontier (explicit `## Blocked by` edges are authoritative; umbrella specs and `ready-for-human` tickets are never selected) → one implementer + reviewer per ticket run concurrently, each in its own worktree container on branch `sandcastle/issue-<N>` → a merger lands finished branches into the current branch with `--no-ff`, running typecheck/lint/tests after each merge. Cycles repeat as merges unblock new tickets.

## Issue lifecycle

- Fully machine-verifiable tickets are closed at merge time with a "Merged by sandcastle" comment.
- Tickets with a **"Manual QA pass recorded"** criterion stay open with the same marker comment. The planner treats the marker as "no longer blocks dependents", so QA does not stall the pipeline — but the human QA pass (EAS dev build on device) is still yours to do before closing the ticket.

## Finishing

Nothing is pushed for you. Review the integration branch, run the suite, then the usual finish flow: local `--no-ff` merge to `main`, delete the branch, push. CI on the push is the final gate — sandcastle does not watch CI.

## Cleanup and recovery

- Worktrees live under `.sandcastle/worktrees/` and are reused per branch across runs. After a ticket branch is merged and closed out: `git worktree remove .sandcastle/worktrees/<branch-dir>` then `git branch -d sandcastle/issue-<N>`.
- A failed run keeps its worktree and branch and prints recovery commands; a failed ticket simply drops out of that cycle's merge without cancelling the others.
- Logs land in `.sandcastle/logs/`.
