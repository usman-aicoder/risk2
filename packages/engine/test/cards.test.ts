import { describe, expect, it } from "vitest";
import { buildDeck, drawCard, isValidSet, tradeValue } from "../src/cards.js";
import type { Card, CardDesign } from "../src/cards.js";
import { createRng } from "../src/rng.js";

function card(design: CardDesign, id = `${design}_${Math.random()}`): Card {
  return { id, design, territory: design === "wild" ? null : "alaska" };
}

describe("deck composition (P1)", () => {
  it("has 44 cards: 14 of each design plus 2 wilds, each territory once", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(44);
    const byDesign = new Map<CardDesign, number>();
    for (const c of deck) byDesign.set(c.design, (byDesign.get(c.design) ?? 0) + 1);
    expect(byDesign.get("infantry")).toBe(14);
    expect(byDesign.get("cavalry")).toBe(14);
    expect(byDesign.get("artillery")).toBe(14);
    expect(byDesign.get("wild")).toBe(2);
    const territories = deck.map((c) => c.territory).filter((t) => t !== null);
    expect(new Set(territories).size).toBe(42);
  });
});

describe("set validation (P1)", () => {
  it("accepts three of a kind", () => {
    expect(isValidSet([card("infantry"), card("infantry"), card("infantry")])).toBe(true);
  });
  it("accepts one of each design", () => {
    expect(isValidSet([card("infantry"), card("cavalry"), card("artillery")])).toBe(true);
  });
  it("accepts any set containing a wild", () => {
    expect(isValidSet([card("wild"), card("infantry"), card("cavalry")])).toBe(true);
    expect(isValidSet([card("wild"), card("infantry"), card("infantry")])).toBe(true);
  });
  it("rejects two-and-one mixes", () => {
    expect(isValidSet([card("infantry"), card("infantry"), card("cavalry")])).toBe(false);
  });
  it("rejects wrong sizes", () => {
    expect(isValidSet([card("infantry"), card("infantry")])).toBe(false);
  });
});

describe("trade-in escalation (P1: source values)", () => {
  it("follows 4, 6, 8, 10, 12, 15, then +5", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(tradeValue)).toEqual([4, 6, 8, 10, 12, 15, 20, 25, 30]);
  });
});

describe("drawCard", () => {
  it("reshuffles the discard pile when the draw pile empties", () => {
    const rng = createRng(1);
    const deck = { drawPile: [card("infantry", "a")], discardPile: [card("cavalry", "b")] };
    expect(drawCard(deck, rng)?.id).toBe("a");
    expect(drawCard(deck, rng)?.id).toBe("b");
    expect(drawCard(deck, rng)).toBeNull();
  });
});
