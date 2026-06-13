import { expect, test } from "@playwright/test";
import { placeAllReinforcements, resolveAdvanceIfPresent } from "./helpers";

test.describe("hot-seat play", () => {
  test("two humans: a full reinforce → attack → fortify turn passes to player 2", async ({
    page,
  }) => {
    await page.goto("/play");
    await page.getByRole("button", { name: "Start game" }).click();

    await expect(page.getByTestId("game-board")).toBeVisible();
    await expect(page.getByText(/Player 1's turn/)).toBeVisible();

    await placeAllReinforcements(page);
    await page.getByRole("button", { name: /To attack/ }).click();
    await page.getByRole("button", { name: /End attack/ }).click();
    await page.getByRole("button", { name: "End turn" }).click();

    await expect(page.getByText(/Player 2's turn/)).toBeVisible();
  });

  test("an attack rolls dice and reports the battle in the feed", async ({ page }) => {
    await page.goto("/play");
    await page.getByRole("button", { name: "Start game" }).click();

    await placeAllReinforcements(page);
    await page.getByRole("button", { name: /To attack/ }).click();

    // Pick a legal source (gold ring) then a legal target (red ring).
    await page.locator('[data-testid^="territory-"][data-highlight="source"]').first().click();
    const target = page.locator('[data-testid^="territory-"][data-highlight="target"]').first();
    await expect(target).toBeVisible();
    await target.click();

    await page.getByRole("button", { name: "Fast attack" }).click();
    await resolveAdvanceIfPresent(page);

    // A battle line appears in the activity feed.
    await expect(page.getByText(/Battle .* losses|captured/).first()).toBeVisible();
  });

  test("solo vs a bot: the bot takes its turn automatically", async ({ page }) => {
    await page.goto("/play");
    // Make player 2 an easy bot.
    await page.locator("select").last().selectOption("easy");
    await page.getByRole("button", { name: "Start game" }).click();

    await placeAllReinforcements(page);
    await page.getByRole("button", { name: /To attack/ }).click();
    await page.getByRole("button", { name: /End attack/ }).click();
    await page.getByRole("button", { name: "End turn" }).click();

    // The bot plays itself (banner shows it thinking), then control returns
    // to player 1 for turn 2 — proving the autoplay loop works end to end.
    await expect(page.getByText(/Player 1's turn/)).toBeVisible({ timeout: 30_000 });
  });

  test("rules reference opens and closes", async ({ page }) => {
    await page.goto("/play");
    await page.getByRole("button", { name: "Start game" }).click();
    await page.getByRole("button", { name: /Rules/ }).click();
    await expect(page.getByRole("heading", { name: "How to play" })).toBeVisible();
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByRole("heading", { name: "How to play" })).toBeHidden();
  });

  test("undo clears staged reinforcements", async ({ page }) => {
    await page.goto("/play");
    await page.getByRole("button", { name: "Start game" }).click();

    await page.locator('[data-testid^="territory-"][data-highlight="source"]').first().click();
    await expect(page.getByText(/^\+\d+$/).first()).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText(/^\+\d+$/)).toHaveCount(0);
  });
});
