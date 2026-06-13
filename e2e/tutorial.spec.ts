import { expect, test } from "@playwright/test";
import { placeAllReinforcements } from "./helpers";

test.describe("tutorial (P3 onboarding)", () => {
  test("guides a first-timer through one full turn vs the bot", async ({ page }) => {
    await page.goto("/tutorial");

    // Board renders and the first step explains reinforcement.
    await expect(page.getByTestId("game-board")).toBeVisible();
    await expect(page.getByText(/Step 1 — Reinforce/)).toBeVisible();

    await placeAllReinforcements(page);

    // Step 2: attack phase.
    await page.getByRole("button", { name: /To attack/ }).click();
    await expect(page.getByText(/Step 2 — Attack/)).toBeVisible();
    await page.getByRole("button", { name: /End attack/ }).click();

    // Step 3: fortify, then end the turn.
    await expect(page.getByText(/Step 3 — Fortify/)).toBeVisible();
    await page.getByRole("button", { name: "End turn" }).click();

    // The bot takes over — the tutorial says so.
    await expect(page.getByText("The bot is playing")).toBeVisible();
  });
});
