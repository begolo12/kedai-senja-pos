/**
 * Code128 (subset B) — pola 11-bit per simbol (107 entri), plus stop 13-bit.
 * Referensi: tabel pola Code128 (GS1 GenSpecs).
 */
const CODE128B = [
  11011001100, 11001101100, 11001100110, 10010011000, 10010001100, 10001001100,
  10011001000, 10011000100, 10001100100, 11001001000, 11001000100, 11000100100,
  10110011100, 10011011100, 10011001110, 10111001100, 10011101100, 10011100110,
  11001110010, 11001011100, 11001001110, 11011100100, 11001110100, 11101101110,
  11101001100, 11100101100, 11100100110, 11101100100, 11100110100, 11100110010,
  11011011000, 11011000110, 11000110110, 10100011000, 10001011000, 10001000110,
  10110001000, 10001101000, 10001100010, 11010001000, 11000101000, 11000100010,
  10110111000, 10110001110, 10001101110, 10111011000, 10111000110, 10001110110,
  11101110110, 11010001110, 11000101110, 11011101000, 11011100010, 11011101110,
  11101011000, 11101000110, 11100010110, 11101101000, 11101100010, 11100011010,
  11101111010, 11001000010, 11110001010, 10100110000, 10100001100, 10010110000,
  10010000110, 10000101100, 10000100110, 10110010000, 10110000100, 10011010000,
  10011000010, 10000110100, 10000110010, 11000010010, 11001010000, 11110111010,
  11000010100, 10001111010, 10100111100, 10010111100, 10010011110, 10111100100,
  10011110100, 10011110010, 11110100100, 11110010100, 11110010010, 11011011110,
  11011110110, 11110110110, 10101111000, 10100011110, 10001011110, 10111101000,
  10111100010, 11110101000, 11110100010, 10111011110, 10111101110, 11101011110,
  11110101110, 11010000100, 11010010000, 11010011100, 11000111010,
];

const START_B = 104;
const STOP_PATTERN = 1100011101011;

export type BarcodeBar = { x: number; width: number };

/** Render Code128B: mengembalikan posisi bar dalam satuan modul. */
export function code128Bars(text: string): BarcodeBar[] | null {
  const clean = text.replace(/[^\x20-\x7e]/g, "");
  if (!clean) return null;

  const codes: number[] = [START_B];
  for (const char of clean) {
    codes.push(char.charCodeAt(0) - 32);
  }
  let checksum = START_B;
  for (let i = 1; i < codes.length; i++) {
    checksum += codes[i] * i;
  }
  codes.push(checksum % 103);

  const bits: number[] = [];
  for (const code of codes) {
    const pattern = CODE128B[code];
    for (let shift = 10; shift >= 0; shift--) {
      bits.push((pattern >> shift) & 1);
    }
  }
  for (let shift = 12; shift >= 0; shift--) {
    bits.push((STOP_PATTERN >> shift) & 1);
  }

  const bars: BarcodeBar[] = [];
  let position = 0;
  while (position < bits.length) {
    if (bits[position] === 0) {
      position++;
      continue;
    }
    let width = 0;
    while (position + width < bits.length && bits[position + width] === 1) {
      width++;
    }
    bars.push({ x: position, width });
    position += width;
  }
  return bars;
}

/** Total lebar dalam modul — dipakai untuk menghitung skala SVG. */
export function barcodeModules(bars: BarcodeBar[]): number {
  const last = bars[bars.length - 1];
  return last ? last.x + last.width : 0;
}
