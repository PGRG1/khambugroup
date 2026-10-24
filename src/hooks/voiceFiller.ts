// Pure rules for Bani's spoken acknowledgements during a voice turn.
// - Only real lookups emit fillers (the server sends them on tool calls).
// - "first": at most one per turn, never before FIRST_FILLER_MIN_MS of wait,
//   so quick answers get no filler at all.
// - "more": at most one per turn, only while still thinking (lookup not done).
// - Fillers never count toward the 3-sentence summary budget.
export const FIRST_FILLER_MIN_MS = 1500;

export type FillerStage = "first" | "more";

export type FillerContext = {
  stage: FillerStage;
  state: string; // current VoiceState
  summaryArrived: boolean;
  firstUsed: boolean;
  moreUsed: boolean;
  fillerPlaying: boolean;
  sinceTurnEndMs: number;
};

export type FillerDecision = { play: false } | { play: true; delayMs: number };

export function decideFiller(c: FillerContext): FillerDecision {
  if (c.summaryArrived || c.state !== "thinking") return { play: false };
  if (c.stage === "first") {
    if (c.firstUsed) return { play: false };
    return { play: true, delayMs: Math.max(0, FIRST_FILLER_MIN_MS - c.sinceTurnEndMs) };
  }
  if (c.moreUsed || c.fillerPlaying) return { play: false };
  return { play: true, delayMs: 0 };
}

/** Final check right before audio starts: the lookup must still be running. */
export function fillerStillWanted(state: string, summaryArrived: boolean): boolean {
  return state === "thinking" && !summaryArrived;
}
