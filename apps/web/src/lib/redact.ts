/**
 * Per-viewer redaction (P4): clients receive only what their player may see.
 *
 * Hidden from everyone: rngSeed / rngDraws (would let players predict dice)
 * and the draw pile's order and faces. Hidden from opponents: a player's hand
 * (only the count is public) and which card a capture awarded. Public: the
 * board, the discard pile (sets are traded face up), and the battle log.
 */

import type { Card, GameEvent, GameState, Objective, PendingAdvance, Phase } from "@risk2/engine";

export type RedactedEvent =
  | Exclude<GameEvent, { type: "cardAwarded" }>
  | { type: "cardAwarded"; playerId: string; cardId: string | null };

export interface RedactedLogEntry {
  seq: number;
  playerId: string;
  action: unknown;
  events: RedactedEvent[];
}

export interface RedactedPlayer {
  playerId: string;
  displayName: string;
  color: string;
  type: "human" | "ai";
  reinforcementsPending: number;
  isEliminated: boolean;
  turnOrder: number;
  cardCount: number;
  /** Only present for the viewer's own player. */
  cards: Card[] | null;
}

export interface PlayerView {
  gameId: string;
  mode: "live" | "async";
  phase: Phase;
  currentTurnPlayer: string;
  turnNumber: number;
  cardSetCount: number;
  objective: Objective;
  players: RedactedPlayer[];
  territories: GameState["territories"];
  pendingAdvance: PendingAdvance | null;
  capturedThisTurn: boolean;
  winner: string | null;
  drawPileCount: number;
  discardPile: Card[];
  /** The viewer's engine player id; null for spectators. */
  you: string | null;
  feed: RedactedLogEntry[];
}

function redactEvent(event: GameEvent, viewerId: string | null): RedactedEvent {
  if (event.type === "cardAwarded" && event.playerId !== viewerId) {
    return { type: "cardAwarded", playerId: event.playerId, cardId: null };
  }
  return event;
}

export function redactState(state: GameState, viewerId: string | null): PlayerView {
  return {
    gameId: state.gameId,
    mode: state.mode,
    phase: state.phase,
    currentTurnPlayer: state.currentTurnPlayer,
    turnNumber: state.turnNumber,
    cardSetCount: state.cardSetCount,
    objective: state.objective,
    players: state.players.map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      color: p.color,
      type: p.type,
      reinforcementsPending: p.reinforcementsPending,
      isEliminated: p.isEliminated,
      turnOrder: p.turnOrder,
      cardCount: p.cards.length,
      cards: p.playerId === viewerId ? p.cards : null,
    })),
    territories: state.territories,
    pendingAdvance: state.pendingAdvance,
    capturedThisTurn: state.capturedThisTurn,
    winner: state.winner,
    drawPileCount: state.deck.drawPile.length,
    discardPile: state.deck.discardPile,
    you: viewerId,
    feed: state.log.map((entry) => ({
      seq: entry.seq,
      playerId: entry.playerId,
      action: entry.action,
      events: entry.events.map((e) => redactEvent(e, viewerId)),
    })),
  };
}
