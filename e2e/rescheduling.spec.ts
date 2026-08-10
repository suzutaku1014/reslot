import { expect, test } from "@playwright/test";

test("customer request, provider decision, and admin delivery stay observable", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "デモをはじめる" }).click();
	await expect(page.getByRole("heading", { name: "今後の予約" })).toBeVisible();

	await page.getByRole("button", { name: "日程を変更" }).first().click();
	const candidate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
	candidate.setHours(14, 0, 0, 0);
	const localValue = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(candidate.getDate()).padStart(2, "0")}T14:00`;
	await page.getByLabel("候補 1").fill(localValue);
	await page.getByLabel("メモ（任意）").fill("架空の日程調整メモです。");
	await page.getByRole("button", { name: "申請する" }).click();
	await expect(page.getByRole("button", { name: "確認待ち" })).toBeVisible();

	await page.getByRole("button", { name: "担当者", exact: true }).click();
	await expect(page.getByRole("heading", { name: "日程変更の申請" })).toBeVisible();
	await page
		.getByRole("button", { name: /この日時で承認/ })
		.first()
		.click();
	await expect(
		page.getByRole("heading", { name: "確認待ちの申請はありません" }),
	).toBeVisible();

	await page.getByRole("button", { name: "管理者", exact: true }).click();
	await expect(page.getByRole("heading", { name: "通知キュー" })).toBeVisible();
	await page.getByRole("button", { name: "今すぐ処理" }).click();
	await expect(page.getByText("配信済み").first()).toBeVisible();
});
