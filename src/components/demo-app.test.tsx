import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
	requests: [],
	outbox: [],
	auditEvents: [],
	_count: { requests: 0, outbox: 0, auditEvents: 1 },
};

describe("DemoApp", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("starts an isolated demo before showing role-specific data", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ expiresAt: "2030-01-01" }), { status: 201 }),
			)
			.mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		render(<DemoApp />);
		fireEvent.click(screen.getByRole("button", { name: "デモをはじめる" }));

		await waitFor(() => expect(screen.getByText("今後の予約")).toBeInTheDocument());
		expect(screen.getByText("プロジェクト相談")).toBeInTheDocument();
		expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/demo/sessions", {
			method: "POST",
		});
	});

	it("keeps the request values when submission fails", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ expiresAt: "2030-01-01" }), { status: 201 }),
			)
			.mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { status: 200 }))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR" } }), {
					status: 500,
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		render(<DemoApp />);
		fireEvent.click(screen.getByRole("button", { name: "デモをはじめる" }));
		await screen.findByRole("heading", { name: "今後の予約" });

		fireEvent.click(screen.getByRole("button", { name: "日程を変更" }));
		expect(screen.getByRole("heading", { name: "日程変更を申請" })).toBeInTheDocument();

		const date = screen.getByLabelText("候補 1の日付");
		const time = screen.getByLabelText("候補 1の開始時刻");
		const note = screen.getByLabelText("メモ（任意）");
		fireEvent.change(date, { target: { value: "2030-05-08" } });
		fireEvent.change(time, { target: { value: "14:00" } });
		fireEvent.change(note, { target: { value: "入力内容を保持" } });
		fireEvent.click(screen.getByRole("button", { name: "申請する" }));

		await screen.findByRole("alert");
		expect(date).toHaveValue("2030-05-08");
		expect(time).toHaveValue("14:00");
		expect(note).toHaveValue("入力内容を保持");
		expect(
			screen.getByText(
				"サーバーで問題が発生しました。時間をおいてもう一度お試しください。",
			),
		).toBeInTheDocument();
	});
});
