import assert from "node:assert/strict";
import { evaluateContinuity } from "../src/lib/continuity-watchdog";
import type { DeckSnapshot } from "../src/lib/audio-engine";
const deck=(patch:Partial<DeckSnapshot>={}):DeckSnapshot=>({ready:false,playing:false,currentTime:0,duration:200,buffered:0,playbackRate:1,peak:0,...patch});
assert.equal(evaluateContinuity({A:deck(),B:deck()},"A",false).level,"idle");
assert.equal(evaluateContinuity({A:deck({ready:true,playing:true,buffered:1}),B:deck({ready:true})},"A",true).level,"healthy");
const failover=evaluateContinuity({A:deck({ready:true}),B:deck({ready:true})},"A",true);assert.equal(failover.level,"critical");assert.equal(failover.fallback,"B");
assert.equal(evaluateContinuity({A:deck({ready:true,playing:true,buffered:1}),B:deck()},"A",true).level,"degraded");
console.log("Continuity watchdog: OK");
