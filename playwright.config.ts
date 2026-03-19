import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5784',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      // [LAW:single-enforcer] WebGPU feature-gating is centralized in the
      // browser harness so all E2E lanes execute with the same capabilities.
      args: ['--enable-unsafe-webgpu'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // [LAW:single-enforcer] The Playwright harness owns the dev-server launch
    // contract, including the exact port it binds for browser tests.
    command: 'pnpm exec vite --port 5784 --strictPort',
    port: 5784,
    reuseExistingServer: !process.env.CI,
  },
});
