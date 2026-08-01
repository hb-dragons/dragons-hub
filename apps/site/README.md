# @dragons/site — PROTOTYPE, THROWAWAY

Astro skeleton spike for ticket 16 (unify-dragons-platform map, `.scratch/` in dragons-cms).
**Not production code.** Feasibility spike, single variant — design fixed (1:1 port of hbdragons.de),
question is: Astro 7 as pnpm/Turborepo workspace member, React 19 island reusing @dragons/ui +
@dragons/api-client (raw TS), site.css theme (`packages/ui/src/styles/site.css`) reproducing the
current site look on Dragon's Lair token names.

Run: `pnpm --filter @dragons/site dev` (or `build` / `preview`).

Lives only on branch `prototype/astro-site`. Delete freely.
