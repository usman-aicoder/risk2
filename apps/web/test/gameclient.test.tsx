// @vitest-environment jsdom

/**
 * Phase 3 acceptance: a player can take a complete reinforce -> attack ->
 * fortify turn through the UI alone. Drives GameClient against the real
 * engine (like hot-seat mode) and checks the turn passes to the next player.
 */

import type { Action, GameState } from "@risk2/engine";
import { applyAction, createGame, ownedTerritories } from "@risk2/engine";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ActResult } from "@/components/GameClient";
import { GameClient } from "@/components/GameClient";
import { redactState } from "@/lib/redact";

afterEach(cleanup);

function freshGame(): GameState {
  return createGame({
    gameId: "t",
    mode: "live",
    rngSeed: 4242,
    players: [
      { id: "p0", name: "Alice", color: "red", type: "human" },
      { id: "p1", name: "Bob", color: "blue", type: "human" },
    ],
  });
}

function Harness({ initial }: { initial: GameState }) {
  const [state, setState] = useState(initial);
  const latest = useRef(initial);
  const onAction = (action: Action): Promise<ActResult> => {
    const result = applyAction(latest.current, latest.current.currentTurnPlayer, action);
    if (!result.ok) return Promise.resolve({ ok: false, error: result.message });
    latest.current = result.state;
    setState(result.state);
    return Promise.resolve({ ok: true, events: result.events });
  };
  return <GameClient view={redactState(state, state.currentTurnPlayer)} onAction={onAction} />;
}

describe("GameClient full turn (P3 acceptance)", () => {
  it("reinforce -> attack -> fortify -> next player's turn", async () => {
    const initial = freshGame();
    const me = "p0";
    const pending = initial.players.find((p) => p.playerId === me)?.reinforcementsPending ?? 0;
    expect(pending).toBeGreaterThanOrEqual(3);
    const target = ownedTerritories(initial, me)[0];
    if (!target) throw new Error("no owned territory");

    render(<Harness initial={initial} />);

    // Stage all reinforcements on one territory, then confirm.
    const node = screen.getByTestId(`territory-${target}`);
    for (let i = 0; i < pending; i++) fireEvent.click(node);
    expect(screen.getByText(`+${pending}`)).toBeTruthy();

    fireEvent.click(screen.getByText("Confirm placement"));
    await waitFor(() => {
      expect(screen.getByText("All armies placed.")).toBeTruthy();
    });

    // Into the attack phase; skip combat for determinism.
    fireEvent.click(screen.getByText("To attack ▸"));
    await screen.findByText("Roll once");

    fireEvent.click(screen.getByText("End attack ▸"));
    await screen.findByText("End turn");

    // End the turn without fortifying: Bob is up.
    fireEvent.click(screen.getByText("End turn"));
    await screen.findByText(/Bob's turn/);
  });

  it("undo clears staged placements before committing (P3)", () => {
    const initial = freshGame();
    const target = ownedTerritories(initial, "p0")[0];
    if (!target) throw new Error("no owned territory");
    render(<Harness initial={initial} />);

    fireEvent.click(screen.getByTestId(`territory-${target}`));
    expect(screen.getByText("+1")).toBeTruthy();
    fireEvent.click(screen.getByText("Undo"));
    expect(screen.queryByText("+1")).toBeNull();
  });
});
