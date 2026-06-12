/** Handcrafted-state factory for focused engine tests. */

import { buildDeck } from "../src/cards.js";
import type { Card, CardDesign } from "../src/cards.js";
import { TERRITORY_CODES } from "../src/map.js";
import type { TerritoryCode } from "../src/map.js";
import type { GameState, Objective, Phase, PlayerColor, TerritoryOccupancy } from "../src/state.js";

let cardSeq = 0;

export function testCard(design: CardDesign, territory: TerritoryCode | null = null): Card {
  return { id: `test_card_${cardSeq++}`, design, territory };
}

export interface TestStateOptions {
  playerIds?: string[];
  owners?: Partial<Record<TerritoryCode, { owner: string; troops: number }>>;
  defaultOwner?: string;
  defaultTroops?: number;
  phase?: Phase;
  currentTurnPlayer?: string;
  reinforcements?: Record<string, number>;
  cards?: Record<string, Card[]>;
  cardSetCount?: number;
  objective?: Objective;
  capturedThisTurn?: boolean;
}

const COLORS: PlayerColor[] = ["red", "blue", "green", "yellow", "purple", "black"];

export function makeState(options: TestStateOptions = {}): GameState {
  const playerIds = options.playerIds ?? ["A", "B", "C"];
  const defaultOwner = options.defaultOwner ?? playerIds[playerIds.length - 1];
  if (defaultOwner === undefined) throw new Error("at least one player required");
  const territories = {} as Record<TerritoryCode, TerritoryOccupancy>;
  for (const code of TERRITORY_CODES) {
    const override = options.owners?.[code];
    territories[code] = override
      ? { owner: override.owner, troops: override.troops }
      : { owner: defaultOwner, troops: options.defaultTroops ?? 3 };
  }

  return {
    gameId: "test",
    mode: "async",
    phase: options.phase ?? "reinforce",
    currentTurnPlayer: options.currentTurnPlayer ?? (playerIds[0] as string),
    turnNumber: 1,
    cardSetCount: options.cardSetCount ?? 0,
    rngSeed: 42,
    rngDraws: 0,
    objective: options.objective ?? { kind: "domination" },
    players: playerIds.map((id, i) => ({
      playerId: id,
      displayName: id,
      color: COLORS[i] as PlayerColor,
      type: "human",
      reinforcementsPending: options.reinforcements?.[id] ?? 0,
      cards: options.cards?.[id] ?? [],
      isEliminated: false,
      turnOrder: i,
    })),
    territories,
    deck: { drawPile: buildDeck(), discardPile: [] },
    pendingAdvance: null,
    capturedThisTurn: options.capturedThisTurn ?? false,
    winner: null,
    log: [],
  };
}
