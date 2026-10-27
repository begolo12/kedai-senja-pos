export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight in Jakarta (UTC+7), returned as a UTC epoch ms. */
export function dayStart(now: number | Date = Date.now()) {
  const t = new Date(now).getTime() + WIB_OFFSET_MS;
  return t - (t % DAY_MS) - WIB_OFFSET_MS;
}

export function isoDate(value: number | Date) {
  const d = new Date(new Date(value).getTime() + WIB_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

export function todayIso(now: number | Date = Date.now()) {
  return isoDate(now);
}

export function shiftDays(days: number, now: number = Date.now()) {
  return new Date(now - (days - 1) * DAY_MS);
}

export function defaultRange(preset: string | undefined, now = Date.now()) {
  const today = todayIso(now);
  switch (preset) {
    case "7d":
      return { from: isoDate(shiftDays(7, now)), to: today, preset: "7d" };
    case "30d":
      return { from: isoDate(shiftDays(30, now)), to: today, preset: "30d" };
    case "today":
      return { from: today, to: today, preset: "today" };
    default:
      return { from: today, to: today, preset: "today" };
  }
}

/** Validates YYYY-MM-DD from search params; falls back to today. */
export function readDateRange(params: {
  from?: string;
  to?: string;
  range?: string;
}) {
  const preset = params.range;
  if (preset === "today" || preset === "7d" || preset === "30d") {
    return defaultRange(preset);
  }
  const valid = (v?: string) =>
    v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
  const today = todayIso();
  const from = valid(params.from) ?? today;
  const to = valid(params.to) ?? today;
  return from <= to
    ? { from, to, preset: "custom" as const }
    : { from: to, to: from, preset: "custom" as const };
}