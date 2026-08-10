import { createHash } from "node:crypto";
import { type PersonaRole, Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db";
import { ApiError } from "@/server/http/errors";

type CandidateInput = { startsAt: Date; endsAt: Date };
type Actor = { workspaceId: string; role: PersonaRole; requestId: string };

function requireRole(actual: PersonaRole, expected: PersonaRole) {
	if (actual !== expected) {
		throw new ApiError(
			403,
			"ROLE_FORBIDDEN",
			`This action requires the ${expected.toLowerCase()} persona.`,
		);
	}
}

function fingerprint(value: unknown) {
	return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateCandidates(candidates: CandidateInput[]) {
	if (candidates.length < 1 || candidates.length > 3) {
		throw new ApiError(
			422,
			"CANDIDATE_COUNT",
			"Choose between one and three candidate times.",
		);
	}
	const now = Date.now();
	for (const candidate of candidates) {
		if (candidate.startsAt.getTime() <= now || candidate.endsAt <= candidate.startsAt) {
			throw new ApiError(
				422,
				"INVALID_INTERVAL",
				"Candidate intervals must be valid future times.",
			);
		}
	}
}

async function findStoredResponse(
	database: Prisma.TransactionClient,
	workspaceId: string,
	operation: string,
	key: string,
	body: unknown,
) {
	const stored = await database.idempotencyKey.findUnique({
		where: { workspaceId_operation_key: { workspaceId, operation, key } },
	});
	if (!stored) return null;
	if (stored.fingerprint !== fingerprint(body)) {
		throw new ApiError(
			409,
			"IDEMPOTENCY_MISMATCH",
			"This idempotency key was used with a different request.",
		);
	}
	return stored.response;
}

async function rememberResponse(
	database: Prisma.TransactionClient,
	params: {
		workspaceId: string;
		operation: string;
		key: string;
		body: unknown;
		response: Prisma.InputJsonValue;
	},
) {
	await database.idempotencyKey.create({
		data: {
			workspaceId: params.workspaceId,
			operation: params.operation,
			key: params.key,
			fingerprint: fingerprint(params.body),
			response: params.response,
			statusCode: 200,
			expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
		},
	});
}

export async function createRescheduleRequest(
	actor: Actor,
	input: { appointmentId: string; note?: string; candidates: CandidateInput[] },
	idempotencyKey: string,
) {
	requireRole(actor.role, "CUSTOMER");
	validateCandidates(input.candidates);
	return prisma.$transaction(
		async (database) => {
			const stored = await findStoredResponse(
				database,
				actor.workspaceId,
				"request.create",
				idempotencyKey,
				input,
			);
			if (stored) return stored;

			const appointment = await database.appointment.findFirst({
				where: {
					id: input.appointmentId,
					workspaceId: actor.workspaceId,
					status: "SCHEDULED",
				},
			});
			if (!appointment)
				throw new ApiError(404, "APPOINTMENT_NOT_FOUND", "Appointment not found.");
			const pending = await database.rescheduleRequest.findFirst({
				where: {
					workspaceId: actor.workspaceId,
					appointmentId: appointment.id,
					status: "PENDING",
				},
			});
			if (pending)
				throw new ApiError(
					409,
					"REQUEST_ALREADY_PENDING",
					"This appointment already has a pending request.",
				);

			const request = await database.rescheduleRequest.create({
				data: {
					workspaceId: actor.workspaceId,
					appointmentId: appointment.id,
					customerId: appointment.customerId,
					note: input.note,
					originalStartsAt: appointment.startsAt,
					originalEndsAt: appointment.endsAt,
					candidates: {
						create: input.candidates.map((candidate) => ({
							workspaceId: actor.workspaceId,
							...candidate,
						})),
					},
				},
			});
			await database.notificationOutbox.create({
				data: {
					workspaceId: actor.workspaceId,
					dedupeKey: `request-created:${request.id}`,
					eventType: "reschedule.requested",
					payload: { requestId: request.id, providerId: appointment.providerId },
				},
			});
			await database.auditEvent.create({
				data: {
					workspaceId: actor.workspaceId,
					actorRole: actor.role,
					action: "reschedule.requested",
					resourceType: "RescheduleRequest",
					resourceId: request.id,
					requestId: actor.requestId,
					metadata: { candidateCount: input.candidates.length },
				},
			});
			const response = { requestId: request.id, status: request.status };
			await rememberResponse(database, {
				workspaceId: actor.workspaceId,
				operation: "request.create",
				key: idempotencyKey,
				body: input,
				response,
			});
			return response;
		},
		{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
	);
}

export async function resolveRescheduleRequest(
	actor: Actor,
	input: {
		requestId: string;
		candidateId?: string;
		expectedVersion: number;
		decision: "accept" | "reject";
	},
	idempotencyKey: string,
) {
	requireRole(actor.role, "PROVIDER");
	return prisma.$transaction(
		async (database) => {
			const operation = `request.${input.decision}`;
			const stored = await findStoredResponse(
				database,
				actor.workspaceId,
				operation,
				idempotencyKey,
				input,
			);
			if (stored) return stored;
			const request = await database.rescheduleRequest.findFirst({
				where: { id: input.requestId, workspaceId: actor.workspaceId },
				include: { appointment: true, candidates: true },
			});
			if (!request)
				throw new ApiError(404, "REQUEST_NOT_FOUND", "Reschedule request not found.");
			if (request.status !== "PENDING" || request.version !== input.expectedVersion) {
				throw new ApiError(
					409,
					"STALE_DECISION",
					"This request has already changed. Refresh and try again.",
				);
			}

			let selected = null;
			if (input.decision === "accept") {
				selected = request.candidates.find(
					(candidate) => candidate.id === input.candidateId,
				);
				if (!selected)
					throw new ApiError(
						422,
						"INVALID_CANDIDATE",
						"Choose a candidate from this request.",
					);
				const overlap = await database.appointment.findFirst({
					where: {
						workspaceId: actor.workspaceId,
						providerId: request.appointment.providerId,
						status: "SCHEDULED",
						id: { not: request.appointmentId },
						startsAt: { lt: selected.endsAt },
						endsAt: { gt: selected.startsAt },
					},
				});
				if (overlap)
					throw new ApiError(
						409,
						"PROVIDER_CONFLICT",
						"The provider is no longer available at that time.",
					);
			}

			const transition = await database.rescheduleRequest.updateMany({
				where: {
					id: request.id,
					workspaceId: actor.workspaceId,
					status: "PENDING",
					version: input.expectedVersion,
				},
				data: {
					status: input.decision === "accept" ? "ACCEPTED" : "REJECTED",
					selectedCandidateId: selected?.id,
					resolvedAt: new Date(),
					version: { increment: 1 },
				},
			});
			if (transition.count !== 1)
				throw new ApiError(409, "STALE_DECISION", "Another decision won the race.");

			if (selected) {
				await database.appointment.update({
					where: { id: request.appointmentId },
					data: {
						startsAt: selected.startsAt,
						endsAt: selected.endsAt,
						version: { increment: 1 },
					},
				});
				await database.candidateSlot.updateMany({
					where: { requestId: request.id },
					data: { status: "DISMISSED" },
				});
				await database.candidateSlot.update({
					where: { id: selected.id },
					data: { status: "SELECTED" },
				});
			}

			const status = input.decision === "accept" ? "ACCEPTED" : "REJECTED";
			await database.notificationOutbox.create({
				data: {
					workspaceId: actor.workspaceId,
					dedupeKey: `request-${input.decision}:${request.id}`,
					eventType: `reschedule.${input.decision}ed`,
					payload: { requestId: request.id, customerId: request.customerId },
				},
			});
			await database.auditEvent.create({
				data: {
					workspaceId: actor.workspaceId,
					actorRole: actor.role,
					action: `reschedule.${input.decision}ed`,
					resourceType: "RescheduleRequest",
					resourceId: request.id,
					requestId: actor.requestId,
					metadata: selected ? { selectedCandidateId: selected.id } : undefined,
				},
			});
			const response = { requestId: request.id, status };
			await rememberResponse(database, {
				workspaceId: actor.workspaceId,
				operation,
				key: idempotencyKey,
				body: input,
				response,
			});
			return response;
		},
		{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
	);
}
