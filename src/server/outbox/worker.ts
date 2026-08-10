import { z } from "zod";
import { prisma } from "@/server/db";

const eventPayloadSchema = z.object({
	requestId: z.string(),
	providerId: z.string().optional(),
	customerId: z.string().optional(),
});

const maxAttempts = 5;

export async function processOutbox(limit = 10, workspaceId?: string) {
	const now = new Date();
	const candidates = await prisma.notificationOutbox.findMany({
		where: {
			workspaceId,
			OR: [
				{ status: { in: ["QUEUED", "FAILED"] }, availableAt: { lte: now } },
				{ status: "PROCESSING", leaseExpiresAt: { lte: now } },
			],
		},
		orderBy: { createdAt: "asc" },
		take: Math.min(limit, 50),
	});
	const results = [];

	for (const candidate of candidates) {
		const claimed = await prisma.notificationOutbox.updateMany({
			where: {
				id: candidate.id,
				OR: [
					{ status: { in: ["QUEUED", "FAILED"] }, availableAt: { lte: now } },
					{ status: "PROCESSING", leaseExpiresAt: { lte: now } },
				],
			},
			data: {
				status: "PROCESSING",
				leaseExpiresAt: new Date(Date.now() + 30_000),
				attemptCount: { increment: 1 },
			},
		});
		if (claimed.count !== 1) continue;

		try {
			await deliver(candidate.id);
			results.push({ id: candidate.id, status: "DELIVERED" });
		} catch (error) {
			const attemptCount = candidate.attemptCount + 1;
			const terminal = attemptCount >= maxAttempts;
			await prisma.notificationOutbox.update({
				where: { id: candidate.id },
				data: {
					status: terminal ? "DEAD_LETTER" : "FAILED",
					leaseExpiresAt: null,
					lastErrorCode:
						error instanceof z.ZodError ? "INVALID_PAYLOAD" : "DELIVERY_ERROR",
					availableAt: new Date(
						Date.now() + Math.min(2 ** attemptCount * 1_000, 60_000),
					),
				},
			});
			results.push({ id: candidate.id, status: terminal ? "DEAD_LETTER" : "FAILED" });
		}
	}
	return results;
}

async function deliver(outboxId: string) {
	await prisma.$transaction(async (database) => {
		const event = await database.notificationOutbox.findUniqueOrThrow({
			where: { id: outboxId },
		});
		if (event.status !== "PROCESSING") return;
		const payload = eventPayloadSchema.parse(event.payload);
		const requested = event.eventType === "reschedule.requested";
		const accepted = event.eventType === "reschedule.accepted";
		await database.inAppNotification.create({
			data: {
				workspaceId: event.workspaceId,
				providerId: requested ? payload.providerId : undefined,
				customerId: requested ? undefined : payload.customerId,
				role: requested ? "PROVIDER" : "CUSTOMER",
				type: event.eventType,
				title: requested
					? "New change request"
					: accepted
						? "New time confirmed"
						: "Change request declined",
				body: requested
					? "A customer proposed new appointment times."
					: accepted
						? "Your appointment has been moved to the selected time."
						: "The provider could not accept the proposed times.",
			},
		});
		await database.notificationOutbox.update({
			where: { id: event.id },
			data: {
				status: "DELIVERED",
				deliveredAt: new Date(),
				leaseExpiresAt: null,
				lastErrorCode: null,
			},
		});
	});
}

export async function retryOutboxEvent(
	workspaceId: string,
	outboxId: string,
	requestId: string,
) {
	return prisma.$transaction(async (database) => {
		const updated = await database.notificationOutbox.updateMany({
			where: {
				id: outboxId,
				workspaceId,
				status: { in: ["FAILED", "DEAD_LETTER"] },
			},
			data: {
				status: "QUEUED",
				availableAt: new Date(),
				leaseExpiresAt: null,
				lastErrorCode: null,
			},
		});
		if (updated.count === 1) {
			await database.auditEvent.create({
				data: {
					workspaceId,
					actorRole: "ADMIN",
					action: "outbox.retry_requested",
					resourceType: "NotificationOutbox",
					resourceId: outboxId,
					requestId,
				},
			});
		}
		return updated.count === 1;
	});
}

export async function cleanupExpiredDemoSessions() {
	return prisma.demoSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
