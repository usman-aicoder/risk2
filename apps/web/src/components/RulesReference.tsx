"use client";

/** One-tap rules reference (P3) — the sacred core of Spec §2, summarized. */

import { useState } from "react";

export function RulesReference() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>📖 Rules</button>
      {open ? (
        <div
          className="overlay"
          style={{ position: "fixed", zIndex: 30 }}
          onClick={() => setOpen(false)}
        >
          <div
            className="panel"
            style={{ maxWidth: 560, maxHeight: "80vh", overflowY: "auto", textAlign: "left" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>How to play</h2>
            <h3>Your turn has three phases</h3>
            <ol>
              <li>
                <strong>Reinforce.</strong> You get <em>max(3, territories ÷ 3)</em> armies, plus
                continent bonuses, plus any card trade-in. Place them all before attacking.
              </li>
              <li>
                <strong>Attack.</strong> Attack adjacent enemy territories. You roll up to 3 dice
                (needs one more troop than dice); the defender rolls up to 2. Highest die vs highest
                die — <em>the defender wins ties</em>. Capture a territory and you must move in at
                least as many armies as dice you rolled.
              </li>
              <li>
                <strong>Fortify.</strong> One move between connected friendly territories. Then your
                turn ends — if you captured anything this turn, you draw a card.
              </li>
            </ol>
            <h3>Cards</h3>
            <p>
              Sets of 3 (same design, one of each, or any with a wild) trade for escalating armies:
              4, 6, 8, 10, 12, 15, then +5 each. Hold 5+ cards and you must trade. If a traded card
              shows a territory you own, it gains 2 bonus armies.
            </p>
            <h3>Continent bonuses</h3>
            <p className="muted">
              Australia +2 · South America +2 · Africa +3 · Europe +5 · North America +5 · Asia +7.
              You must hold <em>every</em> territory of a continent at the start of your reinforce
              phase. Few borders are easier to defend — Australia (1 border) is prized; Asia (5+) is
              the classic trap.
            </p>
            <h3>Winning</h3>
            <p>
              Conquer the world (or meet the game&apos;s selected objective). Eliminate a player by
              taking their last territory — you inherit their cards.
            </p>
            <button className="primary" onClick={() => setOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
