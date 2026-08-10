import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoApp } from "@/components/demo-app";

const snapshot = {
	role: "CUSTOMER",
	customers: [{ id: "customer-1", displayName: "Maya Chen" }],
	providers: [{ id: "provider-1", displayName: "Jordan Lee" }],
	appointments: [
		{
			id: "appointment-1",
			startsAt: "2030-05-01T09:00:00.000Z",
			endsAt: "2030-05-01T10:00:00.000Z",
			status: "SCHEDULED",
			version: 1,
			customer: { displayName: "Maya Chen" },
			provider: { displayName: "Jordan Lee" },
			service: { name: "Project consultation" },
		},
	],
	notifications: [],
	_count: { requests: 0, outbox: 0, auditEvents: 1 },
};

describe("DemoApp", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("starts an isolated demo before showing role-specific data", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ expiresAt: "2030-01-01" }), { status: 201 }),
			)
			.mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		render(<DemoApp />);
		fireEvent.click(screen.getByRole("button", { name: "Start fictional demo" }));

		await waitFor(() =>
			expect(screen.getByText("Upcoming appointments")).toBeInTheDocument(),
		);
		expect(screen.getByText("Project consultation")).toBeInTheDocument();
		expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/demo/sessions", {
			method: "POST",
		});
	});
});
