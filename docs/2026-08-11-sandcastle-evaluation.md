# Sandcastle evaluation (2026-08-11)

Primary-source review of [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle), read from a clone of the repo at commit `e99f832` (2026-06-29, the current `main` head). All file paths below are paths inside the sandcastle repo unless marked otherwise.

## What it is

Sandcastle (npm: `@ai-hero/sandcastle`) is a TypeScript **library plus a small scaffolding CLI** for running AI coding agents in isolated sandboxes from your own orchestration script. The README's own framing: "A TypeScript library for orchestrating AI coding agents in isolated sandboxes: 1. You invoke agents with a single `sandcastle.run()`. 2. Sandcastle handles sandboxing the agent with a configurable branch strategy. 3. The commits made on the branches get merged back." (`README.md`, "What Is Sandcastle?"). It is provider-agnostic on both axes: sandbox providers (Docker, Podman, Vercel microVMs, Daytona, no-sandbox, custom) and agent providers (Claude Code, Codex, Pi, Cursor, OpenCode, Copilot CLI — `src/AgentProvider.ts`). Everything runs locally against your git repo; there is no server, no GitHub App, and no hosted component.

## 1. What is it, and how does it pick up work?

It is a **manually invoked orchestration library**, not a GitHub-app worker and not a daemon.

- The installed `sandcastle` binary (`package.json#bin` → `dist/main.js`) exposes only scaffolding commands: `init`, `docker build-image`, `docker remove-image`, `podman build-image`, `podman remove-image` (`src/cli.ts:156,545,577,618,648,684`). No `run`, `watch`, or `serve` command exists.
- Actual orchestration is a user-authored TypeScript script — `sandcastle init` scaffolds `.sandcastle/main.ts` and you run it yourself: `npx tsx .sandcastle/main.ts` (`README.md`, "Quick start"; `docs/content/docs/index.mdx`).
- **No webhooks, no polling, no issue assignment.** Work pickup happens inside the prompt: templates embed a shell expression that runs in the sandbox at prompt-expansion time — `` !`gh issue list --state open --label Sandcastle --limit 100 --json number,title,body,labels,comments ...` `` (`src/InitService.ts:535`; `README.md`, "Dynamic context with `` !`command` ``") — and the agent picks an issue from that list (`src/templates/simple-loop/prompt.md`). So the closest thing to a trigger is a **GitHub label** (`Sandcastle`, created by `init --create-label`), but it only filters a query the agent runs when *you* start the script.
- The issue tracker is pluggable at init time: `github-issues` (via `gh`), `beads` (`bd ready --json`), or `custom` (scaffolds a deliberately broken setup plus a `SETUP_ISSUE_TRACKER.md` prompt your agent uses to wire in your own tracker) (`src/InitService.ts:530-573`; `README.md`, "Templates").

The engine itself is workflow-agnostic: "You write the prompt, and the engine executes it — no opinions about workflow, task management, or context sources are imposed." (`README.md`, "Prompts").

## 2. Blocking/dependency edges between issues

**The engine has no issue model at all** — no dependency parsing, no GitHub relationships API, no metadata files. Dependency handling lives entirely in the scaffolded template prompts, where it is **LLM inference over the issue JSON**:

- The planner templates instruct the agent: "Analyze the open issues and build a dependency graph. For each issue, determine whether it **blocks** or **is blocked by** any other open issue", with criteria based on inferred relationships (B needs code A introduces; overlapping files; B depends on a decision A will establish) (`src/templates/parallel-planner/plan-prompt.md:15-23`, same in `parallel-planner-with-review`).
- The simple-loop / sequential-reviewer prompts just say: "Pick the highest-priority open issue that is not blocked by another open issue" (`src/templates/simple-loop/prompt.md:26`).
- The issue list fed to the planner includes `number,title,body,labels,comments` (`src/InitService.ts:535`), so body-text edges like "Blocked by #123" are visible to the model.

**Consequence for a repo with body-text "Blocked by" lists: no conversion needed.** The planner reads bodies and comments and infers edges anyway; explicit "Blocked by #N" text only makes its job easier. There is no native-relationship or sub-issue support to convert *to*. (The `beads` tracker option is the exception with real dependency semantics — `bd ready --json` returns only unblocked issues — but that is beads' feature, not sandcastle's; `src/InitService.ts:549`.)

## 3. How it runs agents, auth, isolation

**Agent execution: the agents' own CLIs, spawned inside the sandbox — not the Claude Agent SDK.** The `claudeCode()` provider builds `claude --print --verbose --dangerously-skip-permissions --output-format stream-json --model <m> -p -` with the prompt on stdin (`src/AgentProvider.ts:1213`). `--dangerously-skip-permissions` is the default for AFK runs; `permissionMode` swaps it for `--permission-mode <mode>` (`README.md`, "ClaudeCodeOptions"). Codex, Pi, Cursor, OpenCode, and Copilot providers spawn their respective CLIs the same way (`src/AgentProvider.ts:651,811,856,981,1131`).

**Auth: subscription OAuth token by default, API key as fallback.** `sandcastle init` scaffolds `.sandcastle/.env.example` with `CLAUDE_CODE_OAUTH_TOKEN=` ("get one by running `claude setup-token` on your host. Lets the agent use your Claude subscription instead of an API key") and a commented `# ANTHROPIC_API_KEY=` (`src/InitService.ts:416-420`; `README.md`, "Quick start" step 3). Env resolution: `.sandcastle/.env` wins over `process.env`, and only keys declared in the file are resolved (`src/EnvResolver.ts`).

**Isolation: git worktrees bind-mounted into containers.**
- With the `branch` / `merge-to-head` strategies, sandcastle creates a git worktree under `.sandcastle/worktrees/<branch>/` and bind-mounts it into a Docker/Podman container — "the agent writes directly to the host filesystem through the mount, so no sync is needed" (`README.md`, "How it works"). Isolated providers (Vercel Firecracker microVMs, Daytona) sync in/out via `copyIn`/`copyFileOut` instead (`README.md`, "Custom Sandbox Providers"). `noSandbox()` is an explicit opt-out that runs the agent on the host (`README.md`, "Sandbox Providers").
- The container image comes from a scaffolded `.sandcastle/Dockerfile`: Node 22 base, git, curl, jq, the issue tracker CLI (`gh` or beads), the agent CLI, and a non-root `agent` user whose UID/GID is aligned to the host via build args to avoid file-ownership problems (`README.md`, "Custom Dockerfile"; `src/InitService.ts:380-407`; ADR `docs/adr/0014-docker-uid-alignment-via-build-arg.md`).
- Existing worktrees for a named branch are **reused** by default, with a safe fast-forward from `origin` only when the worktree is clean and strictly behind (`docs/adr/0003-reuse-worktree-by-default.md`).

**Dependency installation in fresh workspaces is explicitly designed for.** The templates pair `copyToWorktree: ["node_modules"]` (copy the host's node_modules into the worktree before container start — "Avoids a full npm install from scratch") with a `hooks.sandbox.onSandboxReady: [{ command: "npm install" }]` hook that tops it up inside the sandbox (`src/templates/parallel-planner/main.mts`). Hooks accept `timeoutMs` for long installs (default 60 s per hook), and any hook exiting non-zero fails setup fast (`README.md`, "Hooks"). This matches the failure mode recorded in this repo's own memory note about worktree agents needing installs.

## 4. How completed work lands

**Local git only — never a PR, never a push.** `grep` across `src/`, `README.md`, and `docs/content/` finds zero occurrences of `pr create`, `git push`, or `push origin`. Three branch strategies, configured per `run()` (`README.md`, "Branch strategies"; "How it works"):

- `head` — agent writes directly to the host working directory (default for bind-mount providers).
- `merge-to-head` — temp branch in a worktree, then a plain local `git merge "<branch>"` back onto the host's current branch (`src/SandboxLifecycle.ts:443`); temp branch deleted after merge.
- `branch` — commits accumulate on a named local branch (e.g. for you to turn into a PR — or not); the branch is simply left for the caller.

The README is explicit that this is the whole story: "you just configure `branchStrategy: { type: 'branch', branch: 'foo' }` on `run()`, and get a commit on branch `foo` once it's complete. All 100% local." (`README.md`, "How it works"). Even the parallel-planner's merge phase is an agent running `git merge <branch> --no-edit` locally (`src/templates/parallel-planner/merge-prompt.md`).

**Fit with dragons-hub's local `--no-ff` merge convention: good.** Use the `branch` strategy and perform the `--no-ff` merge yourself (or in a merge-prompt you edit — the prompts are scaffolded files you own). Two caveats: the built-in `merge-to-head` merge is a bare `git merge` with no `--no-ff` option exposed (`src/SandboxLifecycle.ts:443`), so use `branch` if merge-commit shape matters; and nothing creates PRs, so a PR-based flow would be the thing needing extra work here, not the local one.

## 5. Failure and CI behaviour

**Sandcastle does not watch CI.** Nothing in the engine polls GitHub Actions or any CI system (no such code in `src/`; CI never appears in `README.md` outside "use merge-to-head for CI or unattended runs"). Verification is caller-owned, with three mechanisms:

- **In-harness gating:** `sandbox.exec("npm test")` between `run()` calls — "non-zero `exitCode` is returned, not thrown", the README's own example throws when tests fail (`README.md`, "createSandbox()"; changelog `0.12.0` in `CHANGELOG.md`).
- **In-prompt verification:** templates instruct the agent to run `npm run typecheck` and `npm run test` before committing and fix failures first (`src/templates/simple-loop/prompt.md:34`); the merge prompt requires tests after each merge and "If tests fail, fix the issues before proceeding" (`src/templates/parallel-planner/merge-prompt.md`).
- **Blocked-issue escalation is conversational:** "If you are blocked (missing context, failing tests you cannot fix, external dependency), leave a comment on the issue and move on — do not close it." (`src/templates/simple-loop/prompt.md:47`).

Engine-level failure handling:

- **Timeouts:** `idleTimeoutSeconds` (default 600 s, resets on output) fails a stuck run with `AgentIdleTimeoutError`; `completionTimeoutSeconds` (default 60 s) resolves a run *successfully with a warning* when the agent emitted the completion signal but its process hangs, keeping the commits (`README.md`, "Hanging processes after the completion signal"; `docs/adr/0019-completion-timeout-for-hanging-process.md`).
- **Preservation, not retry:** on failure the worktree is kept on disk and errors carry `preservedWorktreePath` (`src/errors.ts:55-76`); a failed merge preserves the temp branch and prints copy-pastable recovery commands ("To retry: git merge <branch>, then clean up: git branch -D <branch>", `src/SandboxLifecycle.ts:448-451`); failed patch application on isolated providers gets a step-by-step recovery message (`src/RecoveryMessage.ts`).
- **The only built-in retry** is for structured output: `maxRetries` on `Output.object()/string()` resumes the failed agent session with token-efficient error feedback (`README.md`, "Structured output"; `src/run.ts:862-886`).
- **Fan-out resilience is template-level:** `Promise.allSettled` so "one failing agent doesn't cancel the others", with rejected runs logged and their branches simply excluded from the merge phase (`src/templates/parallel-planner/main.mts`).

Otherwise, a failed run throws to your script and you decide.

## 6. CLAUDE.md / AGENTS.md handling

**Implicit only.** A full-repo grep finds no code that reads, injects, or mentions `CLAUDE.md`/`AGENTS.md` — the only hits are the sandcastle repo's own contributor docs (`docs/agents/adding-an-issue-tracker.md:108`, `docs/agents/adding-an-agent-provider.md:173`). Instruction files are respected purely because the agent CLI runs in a real checkout: the git worktree contains all *tracked* files, bind-mounted at the sandbox repo root, and Claude Code reads `CLAUDE.md` from its cwd natively. Three implications:

- A committed `CLAUDE.md`/`AGENTS.md` (dragons-hub's case) works with zero configuration.
- Untracked instruction files would need `copyToWorktree` (`README.md`, "All options").
- Host-global config (`~/.claude/`) is **not** mounted into the container by default — only the worktree and any explicit `mounts` you configure on the provider (`README.md`, docker `mounts` option). Sessions are captured *out* of the container's `~/.claude/projects/` after each run (`README.md`, "Session capture"), but nothing is seeded *in*.

Templates that want standards beyond the repo's own files reference them explicitly in prompts (`@.sandcastle/CODING_STANDARDS.md` in `src/templates/sequential-reviewer/review-prompt.md`).

## Setup requirements

- **Install:** `npm install --save-dev @ai-hero/sandcastle`, then `npx @ai-hero/sandcastle init` scaffolds `.sandcastle/` (Dockerfile or Containerfile, prompt files, `main.ts`, `.env.example`, `.gitignore`) and builds the sandbox image (`README.md`, "Quick start", "sandcastle init"). Init is fully scriptable via flags (`--agent`, `--sandbox`, `--template`, `--issue-tracker`, etc.).
- **Prerequisites:** Git plus a sandbox provider — Docker Desktop, Podman, or Vercel (`README.md`, "Prerequisites"). No host Node version is declared (`package.json` has no `engines` field); the sandbox image is Node 22 (`README.md`, "Custom Dockerfile"). Scripts run via `npx tsx`.
- **GitHub access: plain PAT, no GitHub App.** The github-issues tracker scaffolds `GH_TOKEN=` with "Create a fine-grained token … Required repository permissions: Issues (Read and write) and Metadata (Read)" (`src/InitService.ts:540-543`). That is the *entire* GitHub footprint — it never pushes or opens PRs, so no `contents: write` scope is needed for the engine itself.
- **Agent auth per provider** (`src/InitService.ts:409-473`): `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` (claude-code); `ANTHROPIC_API_KEY` (pi); `OPENAI_KEY` (codex); `CURSOR_API_KEY`; `OPENCODE_API_KEY`; `GITHUB_TOKEN` with the Copilot Requests permission (copilot).
- **Config format:** there is no JSON/YAML config file — configuration is TypeScript (`RunOptions` in your `main.ts`) plus the `.sandcastle/` directory (`README.md`, "Configuration"). Optional peer deps `@vercel/sandbox` / `@daytona/sdk` are needed only for those providers (`package.json`).

## Maturity

- Repo created 2026-03-17; first release v0.1.0 on 2026-03-26; latest v0.12.0 on 2026-06-29, which is also the last commit to `main` — a ~6-week quiet period as of 2026-08-11 (`gh repo view` / `gh release list -R mattpocock/sandcastle`; `git log`).
- 43 tags / ~40 releases in 3 months, changesets-driven with a detailed 73 KB `CHANGELOG.md`; npm `latest` is 0.12.0, matching the repo (`npm view @ai-hero/sandcastle`).
- 7,317 stars; 89 open issues; 39 open PRs (`gh api` search counts, 2026-08-11).
- **Pre-1.0 by its own statement:** "all new features or breaking changes `minor` (since we're pre-1.0)" (`CLAUDE.md` in the sandcastle repo). No other stability caveat is stated in the README.
- Engineering signals: 20 ADRs under `docs/adr/`, tests co-located per module, Windows-specific fixes landing through 0.11.0 (`CHANGELOG.md`), and the project dogfoods itself — its own `.sandcastle/run.ts` drives a plan/execute/merge loop over its GitHub issues.

## License

MIT (`LICENSE`; `package.json#license`; `README.md`, "License").

## Open questions

- Is development paused or done? Nothing in the repo explains the gap since 2026-06-29 (v0.12.0) against 89 open issues and 39 open PRs.
- No published docs-site URL: `docs/` is a private Fumadocs/Next app (`docs/package.json`) with no homepage link anywhere in the repo, and parts of it lag the README (e.g. `docs/content/docs/index.mdx` calls sandcastle a "CLI tool" and says an iteration produces "at most one commit").
- Minimum host Node version: undeclared (`package.json` has no `engines`); tsup/tsx and `await using` in examples imply a recent Node, but no primary source states a floor.
- Whether `merge-to-head`'s bare `git merge` fast-forwards or creates a merge commit follows the host's git config; no `--no-ff` control is exposed on that step (`src/SandboxLifecycle.ts:443`) — moot if you use the `branch` strategy and merge yourself.
- `gh release list` shows no v0.11.0 release object even though the tag and changelog entry exist; presumably a release-automation hiccup, but the repo doesn't say.
