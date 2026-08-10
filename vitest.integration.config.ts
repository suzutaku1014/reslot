import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		environment: "node",
		include: ["src/**/*.integration.test.ts"],
		setupFiles: ["src/test/integration-setup.ts"],
		testTimeout: 30_000,
		hookTimeout: 30_000,
		fileParallelism: false,
	},
});
