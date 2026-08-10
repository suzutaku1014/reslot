import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
	issueDemoSession,
	requireDemoSession,
	setActiveRole,
} from "@/server/auth/session";
import { getDemoSnapshot } from "@/server/demo/snapshot";
import { ApiError } from "@/server/http/errors";

export const api = new OpenAPIHono<{ Variables: { requestId: string } }>().basePath(
	"/api",
);

api.use("*", async (context, next) => {
	context.set("requestId", crypto.randomUUID());
	context.header("X-Request-Id", context.get("requestId"));
	await next();
});

api.onError((error, context) => {
	if (error instanceof ApiError) {
		return context.json(
			{
				error: { code: error.code, message: error.message },
				requestId: context.get("requestId"),
			},
			error.status,
		);
	}
	console.error("Unhandled API error", { requestId: context.get("requestId"), error });
	return context.json(
		{
			error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
			requestId: context.get("requestId"),
		},
		500,
	);
});

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

const roleSchema = z.enum(["CUSTOMER", "PROVIDER", "ADMIN"]);

api.openapi(
	createRoute({
		method: "post",
		path: "/demo/sessions",
		responses: {
			201: {
				description: "Ephemeral fictional demo session",
				content: {
					"application/json": { schema: z.object({ expiresAt: z.string() }) },
				},
			},
		},
	}),
	async (context) => {
		const session = await issueDemoSession(context);
		return context.json({ expiresAt: session.expiresAt.toISOString() }, 201);
	},
);

api.openapi(
	createRoute({
		method: "get",
		path: "/demo",
		responses: {
			200: {
				description: "Role-scoped demo snapshot",
				content: { "application/json": { schema: z.any() } },
			},
		},
	}),
	async (context) => {
		const session = await requireDemoSession(context);
		return context.json(
			await getDemoSnapshot(session.workspace.id, session.activeRole),
			200,
		);
	},
);

api.openapi(
	createRoute({
		method: "post",
		path: "/demo/role",
		request: {
			body: {
				content: { "application/json": { schema: z.object({ role: roleSchema }) } },
			},
		},
		responses: {
			200: {
				description: "Active fictional persona",
				content: { "application/json": { schema: z.object({ role: roleSchema }) } },
			},
			422: { description: "Invalid role" },
		},
	}),
	async (context) => {
		const { role } = context.req.valid("json");
		await setActiveRole(context, role);
		return context.json({ role }, 200);
	},
);

api.doc("/openapi.json", {
	openapi: "3.1.0",
	info: { title: "ReSlot API", version: "0.0.0" },
});
