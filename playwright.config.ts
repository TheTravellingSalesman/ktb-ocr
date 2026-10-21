import { defineConfig, devices } from "@playwright/test";

// E2E tests run against the production build, so the service worker is real
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The full suite runs in Chromium. Other engines run a smoke test of the core flow
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /browsers\.spec\.ts/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /browsers\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
