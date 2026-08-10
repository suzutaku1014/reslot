import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
	schema: "prisma/schema.prisma",
	datasource: {
		url:
			process.env.DIRECT_URL ??
			process.env.DATABASE_URL_UNPOOLED ??
			process.env.DATABASE_URL,
	},
	migrations: { seed: "tsx prisma/seed.ts" },
});
