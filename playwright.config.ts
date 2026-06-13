import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (Phase 6).
 *
 * By default these run against a locally started production build of the web
 * app — no database or external services needed, because the covered flows
 * (tutorial, hot-seat vs bots) run the engine entirely in the browser.
 *
 * Point at any deployment by setting BASE_URL, e.g.
 *   BASE_URL=https://risk2-web.vercel.app pnpm exec playwright test
 * (no local server is started in that case).
 */

const baseURL = process.env.BASE_URL ?? "http://localhost:3100";
const useExternal = Boolean(process.env.BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // CI builds first and sets E2E_SERVER_CMD to `start`; locally this falls
  // back to the dev server so `pnpm e2e` works with no prior build. When
  // BASE_URL points at a remote deployment, no local server is started.
  ...(useExternal
    ? {}
    : {
        webServer: {
          command: process.env.E2E_SERVER_CMD ?? "pnpm --filter @risk2/web dev --port 3100",
          url: baseURL,
          timeout: 180_000,
          reuseExistingServer: !process.env.CI,
        },
      }),
});
