import assert from "node:assert/strict";
import { TransitionEngine } from "../src/services/audio/TransitionEngine";

const context = { currentTime: 100 } as AudioContext;
const engine = new TransitionEngine(context);
const beatGrid = {
  bpm: 100,
  firstBeatTime: 0.1,
  beatDuration: 0.6,
  beats: [],
  downbeats: [0.1, 2.5, 4.9, 7.3, 9.7, 12.1, 14.5, 16.9, 19.3],
  confidence: 0.9,
};

assert.equal(engine.getNextBeat(3, beatGrid), 3.1);
assert.equal(engine.getNextDownbeat(3, beatGrid), 4.9);
assert.ok(engine.getNextPhrase(3, beatGrid, 4) >= 3);

const plan = engine.prepareTransition({
  sourceDeck: "A",
  targetDeck: "B",
  sourcePosition: 3,
  targetPosition: 0,
  sourceBpm: 100,
  targetBpm: 102,
  sourceAnalysis: { bpm: 100, beatGrid },
  targetAnalysis: { bpm: 102, beatGrid: { ...beatGrid, bpm: 102 } },
});

assert.equal(plan.fallback, false);
assert.equal(plan.syncBpm, 100);
assert.equal(plan.bassSwapDuration, 0.15);
assert.ok(plan.startTime < plan.bassSwapTime);
assert.ok(plan.bassSwapTime < plan.endTime);
assert.ok(
  Math.abs(plan.bassSwapTime - plan.startTime - plan.introBeats * 0.6) < 1e-9,
);

const fallback = engine.prepareTransition({
  sourceDeck: "B",
  targetDeck: "A",
  sourcePosition: 1,
  targetPosition: 0,
  sourceBpm: 94,
  targetBpm: 95,
});
assert.equal(fallback.fallback, true);
assert.equal(fallback.introBeats, 16);
assert.equal(fallback.outroBeats, 16);

assert.equal(plan.genreFamily, "neutral");

const electronicPlan = engine.prepareTransition({
  sourceDeck: "A",
  targetDeck: "B",
  sourcePosition: 3,
  targetPosition: 0,
  sourceBpm: 100,
  targetBpm: 102,
  sourceAnalysis: { bpm: 100, beatGrid },
  targetAnalysis: { bpm: 102, beatGrid: { ...beatGrid, bpm: 102 } },
  genreFamily: "electronic",
});
assert.equal(electronicPlan.genreFamily, "electronic");
// Electronic profile shortens the bass swap relative to the neutral plan.
assert.ok(electronicPlan.bassSwapDuration < plan.bassSwapDuration);

console.log("Transition Engine planning: OK");
