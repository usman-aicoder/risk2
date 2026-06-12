/**
 * Territory cards and trade-in escalation (P1).
 *
 * 42 territory cards (14 infantry / 14 cavalry / 14 artillery) plus 2 wilds.
 * Matching sets trade for escalating armies driven by the game-global
 * cardSetCount; if a traded card shows a territory the player owns, that
 * territory immediately gains 2 extra armies (classic rule).
 */

import type { TerritoryCode } from "./map.js";
import { TERRITORY_CODES } from "./map.js";
import type { Rng } from "./rng.js";
import { shuffleInPlace } from "./rng.js";

export type CardDesign = "infantry" | "cavalry" | "artillery" | "wild";

export interface Card {
  id: string;
  design: CardDesign;
  /** null for wild cards. */
  territory: TerritoryCode | null;
}

export interface DeckState {
  drawPile: Card[];
  discardPile: Card[];
}

const DESIGNS: readonly CardDesign[] = ["infantry", "cavalry", "artillery"];

/** All 44 cards in a fixed canonical order (shuffle separately). */
export function buildDeck(): Card[] {
  const cards: Card[] = TERRITORY_CODES.map((territory, i) => ({
    id: `card_${territory}`,
    design: DESIGNS[i % 3] as CardDesign,
    territory,
  }));
  cards.push({ id: "card_wild_1", design: "wild", territory: null });
  cards.push({ id: "card_wild_2", design: "wild", territory: null });
  return cards;
}

/**
 * A set is 3 cards: all the same design, or all different designs.
 * Wilds match anything, so any 3 cards including a wild form a set.
 */
export function isValidSet(cards: readonly Card[]): boolean {
  if (cards.length !== 3) return false;
  const designs = cards.map((c) => c.design);
  if (designs.includes("wild")) return true;
  const unique = new Set(designs).size;
  return unique === 1 || unique === 3;
}

/**
 * Armies for the nth set traded game-wide (1-based), classic escalation:
 * 4, 6, 8, 10, 12, 15, then +5 for each set after that.
 */
export function tradeValue(setNumber: number): number {
  if (setNumber <= 5) return 2 + 2 * setNumber;
  if (setNumber === 6) return 15;
  return 15 + 5 * (setNumber - 6);
}

/**
 * First valid set in a hand, or null. With 5+ cards a set always exists
 * (pigeonhole over the three designs, wilds only help).
 */
export function findTradeableSet(cards: readonly Card[]): Card[] | null {
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        const set = [cards[i] as Card, cards[j] as Card, cards[k] as Card];
        if (isValidSet(set)) return set;
      }
    }
  }
  return null;
}

/**
 * Draw the top card, reshuffling the discard pile (with the seeded RNG) when
 * the draw pile is empty. Returns null only when every card is held by players.
 */
export function drawCard(deck: DeckState, rng: Rng): Card | null {
  if (deck.drawPile.length === 0) {
    if (deck.discardPile.length === 0) return null;
    deck.drawPile = shuffleInPlace(deck.discardPile, rng);
    deck.discardPile = [];
  }
  return deck.drawPile.pop() ?? null;
}
