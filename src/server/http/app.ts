import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

export const api = new OpenAPIHono().basePath("/api");

api.openapi(
	createRoute({
		method: "get",
		path: "/health",
		responses: {
			200: {
				description: "Process health",
				content: {
					"application/json": { schema: z.object({ status: z.literal("ok") }) },
				},
			},
		},
	}),
	(context) => context.json({ status: "ok" as const }, 200),
);

api.doc("/openapi.json", {
	openapi: "3.1.0",
	info: { title: "ReSlot API", version: "0.0.0" },
});
