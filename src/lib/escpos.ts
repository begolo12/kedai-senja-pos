/**
 * ESC/POS builder — pure bytes, no DOM dependency.
 * Text-only receipts (code page kept ASCII) so any thermal printer works.
 */

export type EscposLine =
  | { kind: "text"; text: string; bold?: boolean; align?: "left" | "center" | "right" }
  | { kind: "rule" }
  | { kind: "spaced" };

const ESC = 0x1b;
const GS = 0x1d;

function encode(text: string): number[] {
  // Escape non-ASCII to '?' — keeps byte length predictable on any printer.
  const bytes: number[] = [];
  for (const char of text) {
    bytes.push(char.charCodeAt(0) < 128 ? char.charCodeAt(0) : 0x3f);
  }
  return bytes;
}

export function buildReceipt(lines: EscposLine[], width = 42): number[] {
  const out: number[] = [ESC, 0x40]; // init
  for (const line of lines) {
    if (line.kind === "rule") {
      out.push(...encode("-".repeat(width)), 0x0a);
      continue;
    }
    if (line.kind === "spaced") {
      out.push(0x0a);
      continue;
    }
    if (line.bold) out.push(ESC, 0x45, 0x01);
    const align = line.align ?? "left";
    out.push(ESC, 0x61, align === "center" ? 0x01 : align === "right" ? 0x02 : 0x00);
    out.push(...encode(line.text.slice(0, width * 2)), 0x0a);
    if (line.bold) out.push(ESC, 0x45, 0x00);
    out.push(ESC, 0x61, 0x00);
  }
  out.push(0x0a, 0x0a, 0x0a); // feed
  out.push(GS, 0x56, 0x42, 0x00); // partial cut
  return out;
}

/** Kick the cash drawer wired to the printer (ESC p, pin 2, 50ms on). */
export function drawerKick(): number[] {
  return [ESC, 0x70, 0x00, 0x19, 0xfa];
}

export function fmt(value: string, width: number): string {
  return value.length > width ? value.slice(0, width) : value.padEnd(width, " ");
}

export function pair(left: string, right: string, width = 42): string {
  const rightText = right.slice(0, width);
  const leftText = left.slice(0, Math.max(0, width - rightText.length));
  return leftText + " ".repeat(Math.max(0, width - leftText.length - rightText.length)) + rightText;
}
