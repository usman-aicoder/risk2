// @vitest-environment jsdom

import { createGame, TERRITORY_CODES } from "@risk2/engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameBoard } from "@/components/GameBoard";
import { redactState } from "@/lib/redact";

afterEach(cleanup);

function view() {
  const state = createGame({
    gameId: "g",
    mode: "async",
    rngSeed: 9,
    players: [
      { id: "u1", name: "Alice", color: "red", type: "human" },
      { id: "u2", name: "Bob", color: "blue", type: "human" },
    ],
  });
  return redactState(state, "u1");
}

describe("GameBoard", () => {
  it("renders all 42 territories with troop counts", () => {
    const v = view();
    render(<GameBoard view={v} />);
    for (const code of TERRITORY_CODES) {
      expect(screen.getByTestId(`territory-${code}`)).toBeTruthy();
    }
  });

  it("invokes the click handler with the territory code", () => {
    const v = view();
    const onClick = vi.fn();
    render(<GameBoard view={v} onTerritoryClick={onClick} />);
    fireEvent.click(screen.getByTestId("territory-alaska"));
    expect(onClick).toHaveBeenCalledWith("alaska");
  });

  it("shows staged reinforcement badges", () => {
    const v = view();
    render(<GameBoard view={v} staged={{ brazil: 3 }} />);
    expect(screen.getByText("+3")).toBeTruthy();
  });
});
