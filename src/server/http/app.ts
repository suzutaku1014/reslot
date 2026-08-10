import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
	issueDemoSession,
	requireDemoSession,
	setActiveRole,
} from "@/server/auth/session";
import { getDemoSnapshot } from "@/server/demo/snapshot";
import { ApiError } from "@/server/http/errors";
import { processOutbox, retryOutboxEvent } from "@/server/outbox/worker";
import {
	createRescheduleRequest,
	resolveRescheduleRequest,
} from "@/server/rescheduling/service";

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

api.post("/admin/outbox/process", async (context) => {
	const session = await requireDemoSession(context);
	if (session.activeRole !== "ADMIN")
		throw new ApiError(
			403,
			"ROLE_FORBIDDEN",
			"This action requires the admin persona.",
		);
	return context.json({ results: await processOutbox(10, session.workspace.id) });
});

api.post("/admin/outbox/:outboxId/retry", async (context) => {
	const session = await requireDemoSession(context);
	if (session.activeRole !== "ADMIN")
		throw new ApiError(
			403,
			"ROLE_FORBIDDEN",
			"This action requires the admin persona.",
		);
	const retried = await retryOutboxEvent(
		session.workspace.id,
		context.req.param("outboxId"),
		context.get("requestId"),
	);
	if (!retried)
		throw new ApiError(409, "OUTBOX_NOT_RETRYABLE", "This event is not retryable.");
	return context.json({ status: "QUEUED" });
});

api.post("/internal/outbox/process", async (context) => {
	const authorization = context.req.header("authorization");
	if (
		!process.env.CRON_SECRET ||
		authorization !== `Bearer ${process.env.CRON_SECRET}`
	) {
		throw new ApiError(401, "INVALID_CRON_SECRET", "Cron authorization failed.");
	}
	return context.json({ results: await processOutbox() });
});

const candidateSchema = z.object({
	startsAt: z.iso.datetime(),
	endsAt: z.iso.datetime(),
});
const idempotencyHeader = z.string().min(8).max(100);

api.openapi(
	createRoute({
		method: "post",
		path: "/reschedule-requests",
		request: {
			headers: z.object({ "idempotency-key": idempotencyHeader }),
			body: {
				content: {
					"application/json": {
						schema: z.object({
							appointmentId: z.string().uuid(),
							note: z.string().trim().max(500).optional(),
							candidates: z.array(candidateSchema).min(1).max(3),
						}),
					},
				},
			},
		},
		responses: {
			201: { description: "Reschedule request created" },
			409: { description: "Conflict" },
			422: { description: "Invalid candidates" },
		},
	}),
	async (context) => {
		const session = await requireDemoSession(context);
		const body = context.req.valid("json");
		const response = await createRescheduleRequest(
			{
				workspaceId: session.workspace.id,
				role: session.activeRole,
				requestId: context.get("requestId"),
			},
			{
				...body,
				candidates: body.candidates.map(
					(candidate: { startsAt: string; endsAt: string }) => ({
						startsAt: new Date(candidate.startsAt),
						endsAt: new Date(candidate.endsAt),
					}),
				),
			},
			context.req.valid("header")["idempotency-key"],
		);
		return context.json(response, 201);
	},
);

api.openapi(
	createRoute({
		method: "post",
		path: "/reschedule-requests/{requestId}/decision",
		request: {
			params: z.object({ requestId: z.string().uuid() }),
			headers: z.object({ "idempotency-key": idempotencyHeader }),
			body: {
				content: {
					"application/json": {
						schema: z.discriminatedUnion("decision", [
							z.object({
								decision: z.literal("accept"),
								candidateId: z.string().uuid(),
								expectedVersion: z.number().int().positive(),
							}),
							z.object({
								decision: z.literal("reject"),
								expectedVersion: z.number().int().positive(),
							}),
						]),
					},
				},
			},
		},
		responses: {
			200: { description: "Request resolved" },
			409: { description: "Stale or conflicting decision" },
		},
	}),
	async (context) => {
		const session = await requireDemoSession(context);
		const body = context.req.valid("json");
		const response = await resolveRescheduleRequest(
			{
				workspaceId: session.workspace.id,
				role: session.activeRole,
				requestId: context.get("requestId"),
			},
			{ requestId: context.req.valid("param").requestId, ...body },
			context.req.valid("header")["idempotency-key"],
		);
		return context.json(response, 200);
	},
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
