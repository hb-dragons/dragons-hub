import path from "node:path";

import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Monorepo root. Without this, Turbopack infers the root from lockfile
  // locations and picks the wrong tree when running inside a git worktree.
  turbopack: { root: path.join(import.meta.dirname, "../..") },
};

export default withPayload(nextConfig);
