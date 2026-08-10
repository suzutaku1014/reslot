import { z } from "zod";

const serverEnvironmentSchema = z.object({
	DATABASE_URL: z.string().min(1),
	SESSION_PEPPER: z.string().min(32),
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export function getServerEnvironment() {
	return serverEnvironmentSchema.parse(process.env);
}
