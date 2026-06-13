import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Place all pending reinforcements onto legal (highlighted) territories. */
export async function placeAllReinforcements(page: Page): Promise<void> {
  // The reinforce HUD shows "Place N more armies …" until everything is staged.
  for (let guard = 0; guard < 60; guard++) {
    const source = page.locator('[data-testid^="territory-"][data-highlight="source"]').first();
    if ((await source.count()) === 0) break;
    await source.click({ position: { x: 0, y: 0 } });
    // Once nothing is left to place, the prompt switches away from "Place".
    const stillPlacing = await page.getByText(/Place \d+ more/).count();
    if (stillPlacing === 0) break;
  }
  await page.getByRole("button", { name: "Confirm placement" }).click();
  await expect(page.getByText("All armies placed.")).toBeVisible();
}

/** Resolve the mandatory advance overlay if a capture popped it open. */
export async function resolveAdvanceIfPresent(page: Page): Promise<void> {
  const advance = page.getByRole("button", { name: "Advance" });
  if (await advance.isVisible().catch(() => false)) {
    await advance.click();
  }
}
