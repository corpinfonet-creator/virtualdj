import assert from "node:assert/strict";
import {
  driveSlotFromSource,
  driveStoragePrefix,
  validDriveSlot,
} from "../src/server/providers/drive-slots";

assert.equal(driveStoragePrefix("01"), "drive:");
assert.equal(driveStoragePrefix("02"), "drive02:");
assert.equal(driveStoragePrefix("03"), "drive03:");
assert.notEqual(driveStoragePrefix("01"), driveStoragePrefix("02"));
assert.notEqual(driveStoragePrefix("02"), driveStoragePrefix("03"));
assert.equal(validDriveSlot("02"), "02");
assert.equal(validDriveSlot("03"), "03");
assert.equal(validDriveSlot("invalid"), "01");
assert.equal(driveSlotFromSource("drive01"), "01");
assert.equal(driveSlotFromSource("drive02"), "02");
assert.equal(driveSlotFromSource("drive03"), "03");
assert.equal(driveSlotFromSource("local"), null);

console.log("Drive slot isolation: OK");
