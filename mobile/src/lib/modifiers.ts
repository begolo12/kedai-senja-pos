import { formatMoney } from "./money";

export type ModifierOption = {
  label: string;
  raw: string;
  priceDelta: number;
};

const PRICE_SUFFIX_RE = /\(\s*\+\s*([0-9][0-9.,]*)\s*\)$/;

export function parseOptions(options: string | null | undefined): ModifierOption[] {
  if (!options) return [];
  const seen = new Set<string>();
  const result: ModifierOption[] = [];
  for (const part of options.split(/[,;]/)) {
    const raw = part.trim();
    if (!raw) continue;
    const match = raw.match(PRICE_SUFFIX_RE);
    let label = raw;
    let priceDelta = 0;
    if (match) {
      const digits = match[1].replace(/[^\d]/g, "");
      const parsed = digits ? Number.parseInt(digits, 10) : 0;
      if (Number.isFinite(parsed) && parsed > 0) {
        priceDelta = parsed * 100;
      }
      label = raw.slice(0, match.index).trim() || raw;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ label, raw, priceDelta });
  }
  return result;
}

export function computeModifierDelta(
  options: string | null | undefined,
  note: string | null | undefined,
): number {
  if (!options || !note) return 0;
  const parsed = parseOptions(options);
  if (parsed.length === 0) return 0;

  const byKey = new Map<string, ModifierOption>();
  for (const opt of parsed) {
    byKey.set(opt.label.toLowerCase(), opt);
    byKey.set(opt.raw.toLowerCase(), opt);
  }

  const matchedLabels = new Set<string>();
  let total = 0;
  for (const token of note.split("·")) {
    const clean = token.trim().toLowerCase();
    if (!clean) continue;
    const found = byKey.get(clean);
    if (found && !matchedLabels.has(found.label.toLowerCase())) {
      matchedLabels.add(found.label.toLowerCase());
      total += found.priceDelta;
    }
  }
  return total;
}

export function formatOptionChoice(opt: ModifierOption, currency = "IDR"): string {
  return opt.priceDelta > 0
    ? `${opt.label} (+${formatMoney(opt.priceDelta, currency)})`
    : opt.label;
}
