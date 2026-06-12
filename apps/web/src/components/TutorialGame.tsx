"use client";

/** First-game tutorial (P3): one guided turn vs an easy bot, fixed seed. */

import type { GameState } from "@risk2/engine";
import { tutorialStep } from "@/lib/tutorial";
import { HotSeatGame } from "./HotSeatGame";

function TutorialBanner({ state }: { state: GameState }) {
  const step = tutorialStep(state, "p0");
  return (
    <div className="hud-banner" style={{ borderLeft: "6px solid var(--accent)" }}>
      <div>{step.title}</div>
      <div className="muted" style={{ fontWeight: 400, fontSize: 13, marginTop: 4 }}>
        {step.text}
      </div>
    </div>
  );
}

export function TutorialGame() {
  return (
    <HotSeatGame
      preset={{
        seats: [
          { name: "You", kind: "human" },
          { name: "Tutor Bot", kind: "easy" },
        ],
        seed: 20260612,
      }}
      banner={(state) => <TutorialBanner state={state} />}
    />
  );
}
