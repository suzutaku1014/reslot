import type { PersonaRole } from "@/generated/prisma";
import { prisma } from "@/server/db";

export async function getDemoSnapshot(workspaceId: string, role: PersonaRole) {
	const workspace = await prisma.workspace.findUniqueOrThrow({
		where: { id: workspaceId },
		select: {
			customers: { select: { id: true, displayName: true } },
			providers: { select: { id: true, displayName: true } },
			appointments: {
				orderBy: { startsAt: "asc" },
				select: {
					id: true,
					startsAt: true,
					endsAt: true,
					status: true,
					version: true,
					customer: { select: { displayName: true } },
					provider: { select: { displayName: true } },
					service: { select: { name: true } },
				},
			},
			notifications: {
				where: { role },
				orderBy: { createdAt: "desc" },
				take: 10,
				select: { id: true, title: true, body: true, readAt: true, createdAt: true },
			},
			requests: {
				orderBy: { createdAt: "desc" },
				select: {
					id: true,
					status: true,
					note: true,
					version: true,
					createdAt: true,
					appointment: {
						select: { id: true, providerId: true, service: { select: { name: true } } },
					},
					candidates: {
						orderBy: { startsAt: "asc" },
						select: { id: true, startsAt: true, endsAt: true, status: true },
					},
				},
			},
			outbox: {
				orderBy: { createdAt: "desc" },
				take: 20,
				select: {
					id: true,
					eventType: true,
					status: true,
					attemptCount: true,
					lastErrorCode: true,
					createdAt: true,
				},
			},
			auditEvents: {
				orderBy: { createdAt: "desc" },
				take: 20,
				select: {
					id: true,
					actorRole: true,
					action: true,
					resourceType: true,
					resourceId: true,
					requestId: true,
					createdAt: true,
				},
			},
			_count: { select: { requests: true, outbox: true, auditEvents: true } },
		},
	});
	return { role, ...workspace };
}
