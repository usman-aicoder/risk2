import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("loads and links to tutorial and hot-seat", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Risk II Online" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take the tutorial" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start a hot-seat game" })).toBeVisible();
  });

  test("tutorial link navigates to the tutorial", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Take the tutorial" }).click();
    await expect(page).toHaveURL(/\/tutorial$/);
  });
});
