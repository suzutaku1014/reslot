import { expect, test } from "@playwright/test";

test("customer request, provider decision, and admin delivery stay observable", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Start fictional demo" }).click();
	await expect(
		page.getByRole("heading", { name: "Upcoming appointments" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Request change" }).first().click();
	const candidate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
	candidate.setHours(14, 0, 0, 0);
	const localValue = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}T14:00`;
	await page.getByLabel("Candidate 1").fill(localValue);
	await page.getByLabel("Optional note").fill("A fictional scheduling note.");
	await page.getByRole("button", { name: "Send request" }).click();
	await expect(page.getByRole("button", { name: "Pending" })).toBeVisible();

	await page.getByRole("button", { name: "Provider Review candidates" }).click();
	await expect(page.getByRole("heading", { name: "Change requests" })).toBeVisible();
	await page
		.getByRole("button", { name: /Accept/ })
		.first()
		.click();
	await expect(
		page.getByRole("heading", { name: "No requests waiting" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Admin Inspect operations" }).click();
	await expect(
		page.getByRole("heading", { name: "Notification outbox" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Process now" }).click();
	await expect(page.getByText("DELIVERED").first()).toBeVisible();
});
