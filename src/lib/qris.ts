/**
 * QRIS dinamis: menyisipkan nominal (tag 54) ke payload QRIS statis dan
 * menghitung ulang CRC16-CCITT (tag 63). Gagal dengan null bila payload
 * bukan EMVCo TLV yang valid (mis. data URI gambar).
 */

const CRC_POLY = 0x1021;
const CRC_INIT = 0xffff;

export function crc16(payload: string): string {
  let crc = CRC_INIT;
  for (let i = 0; i < payload.length; i += 2) {
    const byte = Number.parseInt(payload.slice(i, i + 2), 16);
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ CRC_POLY) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

type Tlv = { tag: string; end: number };

function parseTlvs(payload: string): Tlv[] | null {
  const out: Tlv[] = [];
  let pos = 0;
  while (pos + 4 <= payload.length) {
    const tag = payload.slice(pos, pos + 2);
    const len = Number.parseInt(payload.slice(pos + 2, pos + 4), 10);
    if (!Number.isFinite(len) || len < 0) return null;
    // Tag 63 (CRC) dikirim sebagai 4 hex digit, bukan len*2 — khas QRIS.
    const valueHex = tag === "63" ? 4 : len * 2;
    const end = pos + 4 + valueHex;
    if (end > payload.length) return null;
    out.push({ tag, end });
    pos = end;
  }
  return pos === payload.length ? out : null;
}

/**
 * `amountMinor` dalam satuan sen (IDR: minor/100 = rupiah, tanpa desimal).
 * Nominal disisipkan setelah tag 53/58 bila ada, jika tidak di akhir payload.
 */
export function dynamicQris(base: string, amountMinor: number): string | null {
  if (!base || base.startsWith("data:")) return null;
  let payload = base.trim();
  const crcPos = payload.lastIndexOf("6304");
  if (crcPos !== -1) {
    // Buang tag CRC beserta 4 hex nilai CRC-nya.
    payload = payload.slice(0, crcPos);
  }
  const tlvs = parseTlvs(payload);
  if (!tlvs || tlvs.length === 0) return null;

  const rupiah = Math.max(0, Math.round(amountMinor / 100));
  const amount = String(rupiah);
  const field = `54${String(amount.length).padStart(2, "0")}${amount}`;

  const anchor = [...tlvs].reverse().find((t) => t.tag === "53" || t.tag === "58");
  const insertAt = anchor ? anchor.end : payload.length;
  const withAmount = payload.slice(0, insertAt) + field + payload.slice(insertAt);

  return `${withAmount}6304${crc16(`${withAmount}6304`)}`;
}
