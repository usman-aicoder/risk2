/**
 * Runs Drizzle migrations during the Vercel build when a database is
 * configured; no-ops otherwise (CI, local builds without env).
 */

import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("[migrate] DATABASE_URL not set — skipping migrations.");
  process.exit(0);
}

console.log("[migrate] applying Drizzle migrations…");
execSync("drizzle-kit migrate", { stdio: "inherit" });
console.log("[migrate] done.");
