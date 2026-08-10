import { createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { PersonaRole } from "@/generated/prisma";
import { prisma } from "@/server/db";
import { getServerEnvironment } from "@/server/env";
import { ApiError } from "@/server/http/errors";

const sessionCookie = "reslot_demo";
const sessionLifetimeSeconds = 60 * 60;

function hashToken(token: string) {
	return createHash("sha256")
		.update(`${token}:${getServerEnvironment().SESSION_PEPPER}`)
		.digest("hex");
}

export async function issueDemoSession(context: Context) {
	const token = randomBytes(32).toString("base64url");
	const now = new Date();
	const expiresAt = new Date(now.getTime() + sessionLifetimeSeconds * 1_000);
	const initialStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1_000);
	initialStart.setMinutes(0, 0, 0);
	const secondStart = new Date(initialStart.getTime() + 24 * 60 * 60 * 1_000);

	const session = await prisma.$transaction(async (database) => {
		const createdSession = await database.demoSession.create({
			data: { tokenHash: hashToken(token), expiresAt },
		});
		const workspace = await database.workspace.create({
			data: { sessionId: createdSession.id },
		});
		const [customer, provider, service] = await Promise.all([
			database.customer.create({
				data: { workspaceId: workspace.id, displayName: "Maya Chen" },
			}),
			database.provider.create({
				data: { workspaceId: workspace.id, displayName: "Jordan Lee" },
			}),
			database.service.create({
				data: {
					workspaceId: workspace.id,
					name: "Project consultation",
					durationMinutes: 60,
				},
			}),
		]);
		await database.appointment.createMany({
			data: [initialStart, secondStart].map((startsAt) => ({
				workspaceId: workspace.id,
				customerId: customer.id,
				providerId: provider.id,
				serviceId: service.id,
				startsAt,
				endsAt: new Date(startsAt.getTime() + 60 * 60 * 1_000),
			})),
		});
		await database.auditEvent.create({
			data: {
				workspaceId: workspace.id,
				actorRole: "CUSTOMER",
				action: "demo.session_created",
				resourceType: "DemoSession",
				resourceId: createdSession.id,
				requestId: context.get("requestId"),
			},
		});
		return createdSession;
	});

	setCookie(context, sessionCookie, token, {
		httpOnly: true,
		secure: getServerEnvironment().NODE_ENV === "production",
		sameSite: "Strict",
		path: "/",
		maxAge: sessionLifetimeSeconds,
	});

	return session;
}

export async function requireDemoSession(context: Context) {
	const token = getCookie(context, sessionCookie);
	if (!token)
		throw new ApiError(401, "SESSION_REQUIRED", "Start a demo session first.");

	const session = await prisma.demoSession.findUnique({
		where: { tokenHash: hashToken(token) },
		include: { workspace: true },
	});
	if (!session?.workspace || session.expiresAt <= new Date()) {
		throw new ApiError(401, "SESSION_EXPIRED", "The demo session has expired.");
	}
	return { ...session, workspace: session.workspace };
}

export async function setActiveRole(context: Context, activeRole: PersonaRole) {
	const session = await requireDemoSession(context);
	return prisma.demoSession.update({ where: { id: session.id }, data: { activeRole } });
}
