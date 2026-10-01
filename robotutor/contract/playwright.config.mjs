import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: ".",
	testMatch: "*.spec.mjs",
	// One calculator at a time: the frame-rate check needs an otherwise idle browser.
	workers: 1,
	retries: 0,
	timeout: 60_000,
	reporter: [["list"], ["json", { outputFile: "test-results/report.json" }]],
	use: { ...devices["Desktop Chrome"], viewport: { width: 1000, height: 700 } },
});
