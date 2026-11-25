import assert from "node:assert/strict";
import test from "node:test";
import { computeModifierDelta, formatOptionChoice, parseOptions } from "./modifiers";

test("parseOptions handles free and paid modifiers", () => {
  const opts = parseOptions("Iced, Hot, Oat Milk (+6000); Extra Shot (+5.000)");
  assert.equal(opts.length, 4);
  assert.deepEqual(opts[0], { label: "Iced", raw: "Iced", priceDelta: 0 });
  assert.deepEqual(opts[2], { label: "Oat Milk", raw: "Oat Milk (+6000)", priceDelta: 600_000 });
  assert.deepEqual(opts[3], { label: "Extra Shot", raw: "Extra Shot (+5.000)", priceDelta: 500_000 });
});

test("computeModifierDelta sums matched paid modifiers once each", () => {
  const options = "Iced, Hot, Oat Milk (+6000), Extra Shot (+5000)";
  assert.equal(computeModifierDelta(options, "Iced · Oat Milk · Extra Shot"), 1_100_000);
  // Duplicate token in note is not double-counted
  assert.equal(computeModifierDelta(options, "Oat Milk · Oat Milk"), 600_000);
  // Free text note that doesn't match any paid option adds 0
  assert.equal(computeModifierDelta(options, "Iced · tanpa sedotan"), 0);
});

test("formatOptionChoice formats delta in rupiah", () => {
  const [free, paid] = parseOptions("Less Sugar, Oat Milk (+6000)");
  assert.equal(formatOptionChoice(free), "Less Sugar");
  assert.match(formatOptionChoice(paid), /Oat Milk \(\+Rp.*6\.000\)/);
});
