import assert from "node:assert/strict";
import { test } from "node:test";
import { computeTotals, orderNumber, parseMoneyInput } from "./money";
import { toCsv } from "./csv";

const latte = { unitPrice: 2_800_000, qty: 2 };

test("subtotal, tax, and total use integer minor units", () => {
  const totals = computeTotals([latte], { taxRate: 1100 });
  assert.deepEqual(totals, {
    subtotal: 5_600_000,
    discountAmount: 0,
    taxAmount: 616_000,
    total: 6_216_000,
  });
});

test("percent discount applies before tax and rounds once", () => {
  const totals = computeTotals([latte, { unitPrice: 1_800_000, qty: 1 }], {
    discountType: "percent",
    discountValue: 10,
    taxRate: 1100,
  });
  assert.equal(totals.subtotal, 7_400_000);
  assert.equal(totals.discountAmount, 740_000);
  assert.equal(totals.taxAmount, 732_600);
  assert.equal(totals.total, 7_392_600);
});

test("amount discount cannot exceed the subtotal", () => {
  const totals = computeTotals([latte], {
    discountType: "amount",
    discountValue: 999_000_000,
    taxRate: 0,
  });
  assert.equal(totals.discountAmount, 5_600_000);
  assert.equal(totals.total, 0);
});

test("fixed discount stacks with manual discount and tax applies after", () => {
  const totals = computeTotals([latte], {
    discountType: "amount",
    discountValue: 100_000,
    fixedDiscount: 250_000,
    taxRate: 1100,
  });
  assert.equal(totals.discountAmount, 350_000);
  assert.equal(totals.taxAmount, 577_500);
  assert.equal(totals.total, 5_827_500);
});

test("stacked discounts cannot exceed the subtotal", () => {
  const totals = computeTotals([latte], {
    discountType: "percent",
    discountValue: 50,
    fixedDiscount: 9_999_999,
    taxRate: 1100,
  });
  assert.equal(totals.discountAmount, 5_600_000);
  assert.equal(totals.taxAmount, 0);
  assert.equal(totals.total, 0);
});

test("tax rate clamps to a sane bound", () => {
  const totals = computeTotals([latte], { taxRate: 99_999 });
  assert.equal(totals.taxAmount, 5_600_000);
});

test("money input tolerates rupiah formatting", () => {
  assert.equal(parseMoneyInput("Rp 22.000"), 2_200_000);
  assert.equal(parseMoneyInput("1.000.000"), 100_000_000);
  assert.equal(parseMoneyInput(""), 0);
});

test("order numbers roll over at Jakarta midnight", () => {
  const lateNight = new Date("2026-10-27T16:30:00Z"); // 23:30 WIB
  const afterMidnight = new Date("2026-10-27T17:30:00Z"); // 00:30 WIB next day
  assert.equal(orderNumber(lateNight, 7), "TRA-261027-007");
  assert.equal(orderNumber(afterMidnight, 1), "TRA-261028-001");
});

test("csv escapes delimiters, quotes, and newlines", () => {
  const csv = toCsv(["name", "note"], [["Kopi, susu", 'kata "kunci"'], ["Teh", "baris\nbaru"]]);
  assert.equal(
    csv,
    'name,note\n"Kopi, susu","kata ""kunci"""\nTeh,"baris\nbaru"',
  );
});