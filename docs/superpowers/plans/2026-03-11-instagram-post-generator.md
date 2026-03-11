# Instagram Post Generator — Plan Overview

This feature is split into 3 independent sub-plans, implemented in order:

1. **[Part 1: Foundation & Asset Management](./2026-03-11-instagram-post-generator-part1.md)** — DB schema, GCS storage, upload/download/delete endpoints for player photos and backgrounds, match query service
2. **[Part 2: Image Generation](./2026-03-11-instagram-post-generator-part2.md)** — Satori JSX templates, Sharp compositing pipeline, `/generate` endpoint (depends on Part 1)
3. **[Part 3: Frontend Wizard](./2026-03-11-instagram-post-generator-part3.md)** — Next.js admin UI with 4-step wizard, react-rnd drag/resize, download flow (depends on Part 1 + 2)

**Design spec:** `docs/superpowers/specs/2026-03-11-instagram-post-generator-design.md`

## Import Conventions (all parts)

```ts
// Database client — always from config
import { db } from "../../config/database";

// Schema tables — always from @dragons/db/schema
import { playerPhotos } from "@dragons/db/schema";

// Route exports — always named exports
export { socialRoutes };
```
