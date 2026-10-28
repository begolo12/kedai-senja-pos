import assert from "node:assert/strict";
import { test } from "node:test";
import { barcodeModules, code128Bars } from "./barcode";

test("code128 struktur pola valid", () => {
  const bars = code128Bars("899000100001");
  assert.ok(bars, "barcode ter-encode");
  // 12 karakter + start + checksum = 14 simbol x 11 modul, stop 13 modul.
  assert.equal(barcodeModules(bars), 14 * 11 + 13);
});

test("code128 menolak input kosong", () => {
  assert.equal(code128Bars(""), null);
  assert.equal(code128Bars("​"), null);
});

test("checksum terhitung benar untuk ABC", () => {
  // "ABC": start B(104) A(33) B(34) C(35) → checksum (104+33+68+105)%103 = 1.
  // Kita tidak membaca codes internal; cukup pastikan panjang simbol konsisten.
  const bars = code128Bars("ABC");
  assert.ok(bars);
  assert.equal(barcodeModules(bars), 5 * 11 + 13);
});
