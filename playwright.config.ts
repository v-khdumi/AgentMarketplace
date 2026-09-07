import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const port = process.env.MARKETPLACE_E2E_PORT ?? "3107";
const baseURL = `http://localhost:${port}`;
process.env.MARKETPLACE_E2E_DATA_DIR ??= path.join(tmpdir(), `marketplace-e2e-${randomUUID()}`);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, browserName: "chromium", viewport: { width: 1440, height: 900 }, actionTimeout: 20000, navigationTimeout: 60000, trace: "retain-on-failure", screenshot: "only-on-failure" },
  globalTeardown: "./tests/e2e/teardown.ts",
  webServer: {
    command: `"${process.execPath}" node_modules/next/dist/bin/next dev --hostname localhost --port ${port}`,
    url: `${baseURL}/api/marketplace/bootstrap`,
    reuseExistingServer: false,
    timeout: 180000,
    stdout: "pipe",
    env: { NODE_ENV: "development", DEMO_MODE: "true", SEED_EXAMPLES: "false", NEXTAUTH_URL: baseURL, NEXTAUTH_SECRET: "isolated-test-session-secret-not-for-production", MARKETPLACE_DATA_DIR: process.env.MARKETPLACE_E2E_DATA_DIR, NEXT_DIST_DIR: `.next-e2e-${port}`, GRAPH_AUTH_MODE: "", AZURE_STORAGE_ACCOUNT: "", ENTRA_CLIENT_ID: "", ENTRA_CLIENT_SECRET: "", ENTRA_TENANT_ID: "" },
  },
});