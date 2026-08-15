import assert from "node:assert/strict";
import { parseSessionInstruction } from "../src/lib/session-intent";

const intent=parseSessionInstruction("Pon música tranquila durante 20 minutos. Después vuelve automáticamente a cumbia y sube progresivamente la energía.");
assert.equal(intent.blocks.length,2);
assert.equal(intent.blocks[0].durationMinutes,20);
assert.ok(intent.blocks[0].targetEnergy<.5);
assert.equal(intent.blocks[1].preferredGenre,"Cumbia");
assert.equal(intent.blocks[1].energyDirection,"up");
console.log("Session intent parser: OK");
