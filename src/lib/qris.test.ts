import assert from "node:assert/strict";
import { test } from "node:test";
import { crc16, dynamicQris } from "./qris";

test("crc16 ccitt checksum known vector", () => {
  // CRC-16/CCITT-FALSE over the ASCII string "123456789" is 0x29B1.
  const hex = Buffer.from("123456789", "ascii").toString("hex").toUpperCase();
  assert.equal(crc16(hex), "29B1");
});

test("dynamicQris inserts amount and re-signs payload", () => {
  // Payload TLV valid: tag 00 (len 2, "01"), tag 58 (len 2, "ID"), CRC 6304.
  const body = "00023031580249446304";
  const base = `${body}${crc16(body)}`;
  const dynamic = dynamicQris(base, 3_108_000);
  assert.ok(dynamic);
  assert.ok(dynamic.includes("540531080"), "nominal 31080 rupiah tersisip setelah tag 58");
  // CRC hasil harus konsisten dengan payload tanpa 4 hex terakhir.
  const resultBody = dynamic.slice(0, -4);
  const crc = dynamic.slice(-4);
  assert.equal(crc, crc16(resultBody));
});

test("dynamicQris rejects non-EMVCo payloads", () => {
  assert.equal(dynamicQris("data:image/png;base64,AAAA", 100), null);
  assert.equal(dynamicQris("", 100), null);
  assert.equal(dynamicQris("ZZZZ", 100), null);
});
