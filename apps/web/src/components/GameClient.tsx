"use client";

/**
 * The playable game screen (P3): phase-aware interaction on the board,
 * staged reinforcements with undo, card trading, single/fast combat with
 * dice display, the mandatory advance, fortify, and an activity feed.
 * All legality comes from the engine's validator running client-side;
 * outcomes only ever come from the server's authoritative state (P4).
 */

import type { Action, DiceRoll, GameEvent, TerritoryCode } from "@risk2/engine";
import { TERRITORY_NAMES, isValidSet, tradeValue, validateAction } from "@risk2/engine";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  attackSources,
  attackTargets,
  fortifySources,
  fortifyTargets,
  reinforceTargets,
  viewToValidationState,
} from "@/lib/legalMoves";
import { PLAYER_COLOR_HEX } from "@/lib/mapLayout";
import type { PlayerView, RedactedLogEntry } from "@/lib/redact";
import type { Highlight } from "./GameBoard";
import { GameBoard } from "./GameBoard";

export interface ActResult {
  ok: boolean;
  events?: GameEvent[];
  error?: string;
}

export interface GameClientProps {
  view: PlayerView;
  onAction: (action: Action) => Promise<ActResult>;
  /** Extra banner content (e.g. hot-seat "pass the device"). */
  banner?: ReactNode;
  onRestart?: () => void;
}

interface BattleDisplay {
  from: TerritoryCode;
  to: TerritoryCode;
  rolls: DiceRoll[];
  captured: boolean;
}

export function GameClient({ view, onAction, banner, onRestart }: GameClientProps) {
  const [selected, setSelected] = useState<TerritoryCode | null>(null);
  const [target, setTarget] = useState<TerritoryCode | null>(null);
  const [staged, setStaged] = useState<Record<string, number>>({});
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [lastBattle, setLastBattle] = useState<BattleDisplay | null>(null);
  const [moveArmies, setMoveArmies] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const me = view.players.find((p) => p.playerId === view.you) ?? null;
  const myTurn = view.you !== null && view.currentTurnPlayer === view.you && !view.winner;
  const vstate = useMemo(() => viewToValidationState(view), [view]);
  const names = useMemo(
    () => new Map(view.players.map((p) => [p.playerId, p.displayName])),
    [view.players],
  );

  // New phase or turn: clear transient interaction state.
  useEffect(() => {
    setSelected(null);
    setTarget(null);
    setStaged({});
    setSelectedCards([]);
    setMoveArmies(1);
  }, [view.phase, view.turnNumber, view.currentTurnPlayer]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(t);
  }, [error]);

  const stagedTotal = Object.values(staged).reduce((a, b) => a + b, 0);
  const pendingLeft = (me?.reinforcementsPending ?? 0) - stagedTotal;

  const act = async (action: Action): Promise<ActResult> => {
    setBusy(true);
    try {
      const result = await onAction(action);
      if (!result.ok) {
        setError(result.error ?? "That move is not allowed.");
      } else {
        const battle = result.events?.find((e) => e.type === "battle");
        if (battle && battle.type === "battle") setLastBattle(battle);
      }
      return result;
    } finally {
      setBusy(false);
    }
  };

  // ----- highlights -----
  const highlights = useMemo(() => {
    const out: Partial<Record<TerritoryCode, Highlight>> = {};
    if (!myTurn || !view.you || view.pendingAdvance) return out;
    const you = view.you;
    if (view.phase === "reinforce") {
      if (pendingLeft > 0) for (const code of reinforceTargets(vstate, you)) out[code] = "source";
    } else if (view.phase === "attack") {
      for (const code of attackSources(vstate, you)) out[code] = "source";
      if (selected) {
        for (const code of attackTargets(vstate, you, selected)) out[code] = "target";
        out[selected] = "selected";
      }
    } else if (view.phase === "fortify") {
      for (const code of fortifySources(vstate, you)) out[code] = "source";
      if (selected) {
        for (const code of fortifyTargets(vstate, you, selected)) out[code] = "target";
        out[selected] = "selected";
      }
    }
    if (target) out[target] = "target";
    return out;
  }, [myTurn, view.you, view.phase, view.pendingAdvance, vstate, selected, target, pendingLeft]);

  // ----- board interaction -----
  const handleClick = (code: TerritoryCode) => {
    if (!myTurn || busy || !view.you || view.pendingAdvance) return;
    const you = view.you;
    if (view.phase === "reinforce") {
      if (pendingLeft > 0 && reinforceTargets(vstate, you).has(code)) {
        setStaged((s) => ({ ...s, [code]: (s[code] ?? 0) + 1 }));
      }
      return;
    }
    if (view.phase === "attack") {
      if (selected && attackTargets(vstate, you, selected).has(code)) {
        setTarget(code);
      } else if (attackSources(vstate, you).has(code)) {
        setSelected(code === selected ? null : code);
        setTarget(null);
      }
      return;
    }
    if (view.phase === "fortify") {
      if (selected && fortifyTargets(vstate, you, selected).has(code)) {
        setTarget(code);
        setMoveArmies(1);
      } else if (fortifySources(vstate, you).has(code)) {
        setSelected(code === selected ? null : code);
        setTarget(null);
      }
    }
  };

  const handleAltClick = (code: TerritoryCode) => {
    if (view.phase !== "reinforce") return;
    setStaged((s) => {
      const current = s[code] ?? 0;
      if (current <= 1) {
        const rest = { ...s };
        delete rest[code];
        return rest;
      }
      return { ...s, [code]: current - 1 };
    });
  };

  // ----- phase actions -----
  const confirmPlacement = async () => {
    for (const [territory, armies] of Object.entries(staged)) {
      if (armies <= 0) continue;
      const r = await act({ type: "reinforce", territory: territory as TerritoryCode, armies });
      if (!r.ok) return;
    }
    setStaged({});
  };

  const tradeSelected = async () => {
    const r = await act({ type: "tradeCards", cardIds: selectedCards });
    if (r.ok) setSelectedCards([]);
  };

  const attack = async (mode: "single" | "fast") => {
    if (!selected || !target) return;
    const r = await act({ type: "attack", from: selected, to: target, mode });
    if (r.ok) {
      const captured = r.events?.some((e) => e.type === "battle" && e.captured);
      if (captured) setTarget(null);
    }
  };

  const endPhase = async () => {
    const r = await act({ type: "endPhase" });
    if (r.ok) {
      setSelected(null);
      setTarget(null);
    }
  };

  const endPhaseCheck = view.you
    ? validateAction(vstate, view.you, { type: "endPhase" })
    : { ok: false as const, message: "" };

  const selectedCardObjects = (me?.cards ?? []).filter((c) => selectedCards.includes(c.id));
  const canTrade = selectedCardObjects.length === 3 && isValidSet(selectedCardObjects);
  const mustTrade = (me?.cards?.length ?? 0) >= 5 && view.phase === "reinforce";

  const advance = view.pendingAdvance;
  const advanceMax = advance ? view.territories[advance.from].troops - 1 : 1;
  const fortifyMax = selected ? view.territories[selected].troops - 1 : 1;

  const winnerName = view.winner ? (names.get(view.winner) ?? view.winner) : null;

  return (
    <div className="game-screen">
      <div className="board-wrap">
        <GameBoard
          view={view}
          staged={staged}
          highlights={highlights}
          onTerritoryClick={handleClick}
          onTerritoryAltClick={handleAltClick}
        />
        {error ? <div className="toast">{error}</div> : null}

        {advance && myTurn ? (
          <div className="overlay">
            <div className="panel">
              <h3>
                Captured {TERRITORY_NAMES[advance.to]}! Move in at least {advance.minArmies}{" "}
                {advance.minArmies === 1 ? "army" : "armies"}.
              </h3>
              <ArmySlider
                min={advance.minArmies}
                max={Math.max(advance.minArmies, advanceMax)}
                value={Math.min(Math.max(moveArmies, advance.minArmies), advanceMax)}
                onChange={setMoveArmies}
              />
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act({
                    type: "advance",
                    from: advance.from,
                    to: advance.to,
                    armies: Math.min(Math.max(moveArmies, advance.minArmies), advanceMax),
                  })
                }
              >
                Advance
              </button>
            </div>
          </div>
        ) : null}

        {winnerName ? (
          <div className="overlay">
            <div className="panel">
              <h2>
                {winnerName} wins
                {view.objective.kind === "domination" ? " by world domination" : ""}!
              </h2>
              <p className="muted">
                {view.turnNumber} turns played · {view.feed.length} actions
              </p>
              {onRestart ? (
                <button className="primary" onClick={onRestart}>
                  Rematch
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="sidebar">
        {banner}
        <div className="hud-banner">
          <PhaseStepper phase={view.phase} />
        </div>

        <div className="hud-section">
          <h3>Players</h3>
          {[...view.players]
            .sort((a, b) => a.turnOrder - b.turnOrder)
            .map((p) => (
              <div
                key={p.playerId}
                className={`player-chip${p.playerId === view.currentTurnPlayer ? " current" : ""}${p.isEliminated ? " eliminated" : ""}`}
              >
                <span
                  className="swatch"
                  style={{ background: PLAYER_COLOR_HEX[p.color] ?? "#888" }}
                />
                <span>
                  {p.displayName}
                  {p.playerId === view.you ? " (you)" : ""}
                </span>
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {territoryCount(view, p.playerId)} terr · {p.cardCount} cards
                </span>
              </div>
            ))}
        </div>

        {myTurn ? (
          <div className="hud-section">
            <h3>Your move</h3>
            {view.phase === "reinforce" ? (
              <>
                <p style={{ margin: "0 0 8px" }}>
                  {pendingLeft > 0
                    ? `Place ${pendingLeft} more ${pendingLeft === 1 ? "army" : "armies"} — click your territories.`
                    : stagedTotal > 0
                      ? "Confirm your placements."
                      : "All armies placed."}
                  {mustTrade ? " You hold 5+ cards and must trade a set." : ""}
                </p>
                <div className="row">
                  <button disabled={busy || stagedTotal === 0} onClick={() => setStaged({})}>
                    Undo
                  </button>
                  <button
                    className="primary"
                    disabled={busy || stagedTotal === 0}
                    onClick={() => void confirmPlacement()}
                  >
                    Confirm placement
                  </button>
                  <button
                    disabled={busy || !endPhaseCheck.ok || stagedTotal > 0}
                    onClick={() => void endPhase()}
                    title={endPhaseCheck.ok ? "" : endPhaseCheck.message}
                  >
                    To attack ▸
                  </button>
                </div>
              </>
            ) : null}

            {view.phase === "attack" ? (
              <>
                <p style={{ margin: "0 0 8px" }}>
                  {selected && target
                    ? `${TERRITORY_NAMES[selected]} → ${TERRITORY_NAMES[target]}`
                    : selected
                      ? "Pick an adjacent enemy territory."
                      : "Pick one of your territories (gold ring) to attack from."}
                </p>
                <div className="row">
                  <button
                    className="danger"
                    disabled={busy || !selected || !target}
                    onClick={() => void attack("single")}
                  >
                    Roll once
                  </button>
                  <button
                    className="danger"
                    disabled={busy || !selected || !target}
                    onClick={() => void attack("fast")}
                    title="Attack until captured or unable to continue (P3 fast-resolve)"
                  >
                    Fast attack
                  </button>
                  <button disabled={busy || !endPhaseCheck.ok} onClick={() => void endPhase()}>
                    End attack ▸
                  </button>
                </div>
              </>
            ) : null}

            {view.phase === "fortify" ? (
              <>
                <p style={{ margin: "0 0 8px" }}>
                  {selected && target
                    ? `Move armies: ${TERRITORY_NAMES[selected]} → ${TERRITORY_NAMES[target]}`
                    : "One tactical move (optional), then your turn ends."}
                </p>
                {selected && target ? (
                  <ArmySlider
                    min={1}
                    max={Math.max(1, fortifyMax)}
                    value={Math.min(moveArmies, fortifyMax)}
                    onChange={setMoveArmies}
                  />
                ) : null}
                <div className="row">
                  <button
                    className="primary"
                    disabled={busy || !selected || !target}
                    onClick={() =>
                      selected && target
                        ? void act({
                            type: "fortify",
                            from: selected,
                            to: target,
                            armies: Math.min(moveArmies, fortifyMax),
                          })
                        : undefined
                    }
                  >
                    Fortify &amp; end turn
                  </button>
                  <button disabled={busy} onClick={() => void endPhase()}>
                    End turn
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="hud-section">
            <h3>Waiting</h3>
            <p className="muted" style={{ margin: 0 }}>
              {winnerName
                ? "Game over."
                : `${names.get(view.currentTurnPlayer) ?? "Someone"} is taking their turn.`}
            </p>
          </div>
        )}

        {me?.cards && me.cards.length > 0 && view.phase === "reinforce" && myTurn ? (
          <div className="hud-section">
            <h3>
              Your cards — next set is worth {tradeValue(view.cardSetCount + 1)}{" "}
              {mustTrade ? "(trade required)" : ""}
            </h3>
            <div className="row">
              {me.cards.map((card) => (
                <div
                  key={card.id}
                  className={`card-tile${selectedCards.includes(card.id) ? " selected" : ""}`}
                  onClick={() =>
                    setSelectedCards((ids) =>
                      ids.includes(card.id)
                        ? ids.filter((i) => i !== card.id)
                        : ids.length < 3
                          ? [...ids, card.id]
                          : ids,
                    )
                  }
                >
                  <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{card.design}</div>
                  <div className="muted">
                    {card.territory ? TERRITORY_NAMES[card.territory] : "Wild"}
                  </div>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="primary"
                disabled={busy || !canTrade}
                onClick={() => void tradeSelected()}
              >
                Trade set
              </button>
            </div>
          </div>
        ) : null}

        {lastBattle ? (
          <div className="hud-section">
            <h3>
              Battle: {TERRITORY_NAMES[lastBattle.from]} → {TERRITORY_NAMES[lastBattle.to]}
              {lastBattle.captured ? " — captured!" : ""}
            </h3>
            <DiceRow roll={lastBattle.rolls[lastBattle.rolls.length - 1]} />
            {lastBattle.rolls.length > 1 ? (
              <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
                {lastBattle.rolls.length} rolls (fast resolve)
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="hud-section" style={{ flex: 1, minHeight: 120 }}>
          <h3>Activity</h3>
          <div className="feed">
            {view.feed
              .slice(-60)
              .reverse()
              .flatMap((entry) =>
                formatEntry(entry, names).map((line, i) => (
                  <div key={`${entry.seq}-${i}`}>{line}</div>
                )),
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

function territoryCount(view: PlayerView, playerId: string): number {
  return Object.values(view.territories).filter((t) => t.owner === playerId).length;
}

function PhaseStepper({ phase }: { phase: PlayerView["phase"] }) {
  const phases = ["reinforce", "attack", "fortify"] as const;
  return (
    <span>
      {phases.map((p, i) => (
        <span key={p}>
          {i > 0 ? <span className="muted"> → </span> : null}
          <span style={phase === p ? { color: "var(--accent)" } : { color: "var(--muted)" }}>
            {p[0]?.toUpperCase()}
            {p.slice(1)}
          </span>
        </span>
      ))}
    </span>
  );
}

function ArmySlider({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="row" style={{ margin: "10px 0" }}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <strong style={{ width: 32, textAlign: "right" }}>{value}</strong>
    </div>
  );
}

function DiceRow({ roll }: { roll: DiceRoll | undefined }) {
  if (!roll) return null;
  return (
    <div className="row">
      <span>
        {roll.attacker.map((d, i) => (
          <span key={`a${i}`} className="dice attacker">
            {d}
          </span>
        ))}
      </span>
      <span className="muted">vs</span>
      <span>
        {roll.defender.map((d, i) => (
          <span key={`d${i}`} className="dice defender">
            {d}
          </span>
        ))}
      </span>
    </div>
  );
}

function formatEntry(entry: RedactedLogEntry, names: Map<string, string>): string[] {
  const name = (id: string) => names.get(id) ?? id;
  const lines: string[] = [];
  for (const e of entry.events) {
    switch (e.type) {
      case "reinforced":
        lines.push(`${name(e.playerId)} placed ${e.armies} in ${TERRITORY_NAMES[e.territory]}.`);
        break;
      case "cardsTraded":
        lines.push(`${name(e.playerId)} traded a card set for ${e.armies} armies.`);
        break;
      case "battle": {
        const a = e.rolls.reduce((n, r) => n + r.attackerLosses, 0);
        const d = e.rolls.reduce((n, r) => n + r.defenderLosses, 0);
        lines.push(
          `Battle ${TERRITORY_NAMES[e.from]} → ${TERRITORY_NAMES[e.to]}: ` +
            `${d} defender / ${a} attacker losses${e.captured ? " — captured!" : "."}`,
        );
        break;
      }
      case "advanced":
        lines.push(`${e.armies} armies advanced into ${TERRITORY_NAMES[e.to]}.`);
        break;
      case "fortified":
        lines.push(
          `Fortified ${e.armies} from ${TERRITORY_NAMES[e.from]} to ${TERRITORY_NAMES[e.to]}.`,
        );
        break;
      case "cardAwarded":
        lines.push(`${name(e.playerId)} earned a territory card.`);
        break;
      case "playerEliminated":
        lines.push(`${name(e.playerId)} was eliminated by ${name(e.by)}!`);
        break;
      case "turnStarted":
        lines.push(`— ${name(e.playerId)}'s turn (${e.reinforcements} reinforcements) —`);
        break;
      case "gameOver":
        lines.push(`🏆 ${name(e.winner)} wins the game!`);
        break;
      case "phaseChanged":
        break;
    }
  }
  return lines;
}
