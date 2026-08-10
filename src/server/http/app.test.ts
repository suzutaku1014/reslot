import { describe, expect, it } from "vitest";
import { api } from "./app";

describe("API application", () => {
	it("reports process health", async () => {
		const response = await api.request("/api/health");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ status: "ok" });
	});

	it("publishes an OpenAPI contract", async () => {
		const response = await api.request("/api/openapi.json");
		const body = await response.json();
		expect(body.openapi).toBe("3.1.0");
		expect(body.paths).toHaveProperty("/api/health");
	});
});
