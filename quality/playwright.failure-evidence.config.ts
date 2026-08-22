import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './demonstrations',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: 'failure-evidence-report' }],
    ['json', { outputFile: 'failure-evidence-results/results.json' }]
  ],
  outputDir: 'failure-evidence-results/artifacts',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  projects: [{ name: 'chromium' }]
});
