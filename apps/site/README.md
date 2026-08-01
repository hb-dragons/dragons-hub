# @dragons/site

Public site (hbdragons.de): static Astro build with React islands, deployed as
plain files behind Apache (trailing-slash directory URLs). Reuses @dragons/ui
primitives themed by `packages/ui/src/styles/site.css` and talks to the API via
@dragons/api-client.

- Fonts: self-hosted via the Astro Fonts API (Archivo, JetBrains Mono) — no
  Google Fonts requests.
- Content/strings: German only, every UI literal lives in `src/lib/strings.ts`
  (no i18n layer).
- SEO: `@astrojs/sitemap` emits `sitemap-index.xml`; `public/robots.txt` points
  at it.

## Env

See `.env.example`: `CMS_URL` + `CMS_API_TOKEN` are build-time secrets for CMS
content reads; `PUBLIC_API_URL` is client-exposed for browser islands.

## Commands

```sh
pnpm --filter @dragons/site dev       # dev server on :4321
pnpm --filter @dragons/site build     # static build to dist/
pnpm --filter @dragons/site preview   # serve the built dist/
```

Plan: `docs/plans/2026-08-01-public-site-migration.md` (Phase C).
