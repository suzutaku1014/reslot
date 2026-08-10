import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
	createRescheduleRequest,
	resolveRescheduleRequest,
} from "@/server/rescheduling/service";

async function fixture() {
	const session = await prisma.demoSession.create({
		data: {
			tokenHash: crypto.randomUUID().replaceAll("-", ""),
			expiresAt: new Date(Date.now() + 3_600_000),
		},
	});
	const workspace = await prisma.workspace.create({ data: { sessionId: session.id } });
	const customer = await prisma.customer.create({
		data: { workspaceId: workspace.id, displayName: "Test customer" },
	});
	const provider = await prisma.provider.create({
		data: { workspaceId: workspace.id, displayName: "Test provider" },
	});
	const service = await prisma.service.create({
		data: { workspaceId: workspace.id, name: "Consultation", durationMinutes: 60 },
	});
	const start = new Date(Date.now() + 3 * 24 * 3_600_000);
	start.setMinutes(0, 0, 0);
	const appointment = await prisma.appointment.create({
		data: {
			workspaceId: workspace.id,
			customerId: customer.id,
			providerId: provider.id,
			serviceId: service.id,
			startsAt: start,
			endsAt: new Date(start.getTime() + 3_600_000),
		},
	});
	return { workspace, customer, provider, service, appointment, start };
}

describe("rescheduling transaction", () => {
	beforeEach(async () => {
		await prisma.demoSession.deleteMany();
	});
	afterAll(async () => {
		await prisma.$disconnect();
	});

	it("allows only one concurrent decision to resolve a request", async () => {
		const data = await fixture();
		const candidateStart = new Date(data.start.getTime() + 3_600_000);
		const created = await createRescheduleRequest(
			{
				workspaceId: data.workspace.id,
				role: "CUSTOMER",
				requestId: crypto.randomUUID(),
			},
			{
				appointmentId: data.appointment.id,
				candidates: [
					{
						startsAt: candidateStart,
						endsAt: new Date(candidateStart.getTime() + 3_600_000),
					},
				],
			},
			crypto.randomUUID(),
		);
		if (!("requestId" in created)) throw new Error("Expected a new request");
		const request = await prisma.rescheduleRequest.findUniqueOrThrow({
			where: { id: created.requestId },
			include: { candidates: true },
		});
		const decide = (key: string) =>
			resolveRescheduleRequest(
				{
					workspaceId: data.workspace.id,
					role: "PROVIDER",
					requestId: crypto.randomUUID(),
				},
				{
					requestId: request.id,
					candidateId: request.candidates[0].id,
					expectedVersion: 1,
					decision: "accept",
				},
				key,
			);
		const outcomes = await Promise.allSettled([
			decide(crypto.randomUUID()),
			decide(crypto.randomUUID()),
		]);
		expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(
			1,
		);
		expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
		const resolved = await prisma.rescheduleRequest.findUniqueOrThrow({
			where: { id: request.id },
		});
		expect(resolved.status).toBe("ACCEPTED");
		expect(
			await prisma.notificationOutbox.count({
				where: { workspaceId: data.workspace.id },
			}),
		).toBe(2);
	});

	it("rejects a candidate that overlaps another provider appointment", async () => {
		const data = await fixture();
		const conflictingStart = new Date(data.start.getTime() + 2 * 3_600_000);
		await prisma.appointment.create({
			data: {
				workspaceId: data.workspace.id,
				customerId: data.customer.id,
				providerId: data.provider.id,
				serviceId: data.service.id,
				startsAt: conflictingStart,
				endsAt: new Date(conflictingStart.getTime() + 3_600_000),
			},
		});
		const created = await createRescheduleRequest(
			{
				workspaceId: data.workspace.id,
				role: "CUSTOMER",
				requestId: crypto.randomUUID(),
			},
			{
				appointmentId: data.appointment.id,
				candidates: [
					{
						startsAt: conflictingStart,
						endsAt: new Date(conflictingStart.getTime() + 3_600_000),
					},
				],
			},
			crypto.randomUUID(),
		);
		if (!("requestId" in created)) throw new Error("Expected a new request");
		const request = await prisma.rescheduleRequest.findUniqueOrThrow({
			where: { id: created.requestId },
			include: { candidates: true },
		});
		await expect(
			resolveRescheduleRequest(
				{
					workspaceId: data.workspace.id,
					role: "PROVIDER",
					requestId: crypto.randomUUID(),
				},
				{
					requestId: request.id,
					candidateId: request.candidates[0].id,
					expectedVersion: 1,
					decision: "accept",
				},
				crypto.randomUUID(),
			),
		).rejects.toMatchObject({ code: "PROVIDER_CONFLICT" });
	});
});
