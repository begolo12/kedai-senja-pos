export type DurationUnit = "months" | "years";

export type SubscriptionStatus =
  | "inactive"
  | "permanent"
  | "expired"
  | "expiring"
  | "active";

const JAKARTA_TZ = "Asia/Jakarta";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tambah durasi bulan/tahun tanpa loncat ke bulan berikutnya di tanggal akhir bulan (mis. 31 Jan + 1 bln -> 28/29 Feb). */
export function addSubscriptionDuration(
  base: Date,
  amount: number,
  unit: DurationUnit,
): Date {
  const safeAmount = Math.max(1, Math.floor(amount));
  const monthsToAdd = unit === "years" ? safeAmount * 12 : safeAmount;

  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const hours = base.getUTCHours();
  const minutes = base.getUTCMinutes();
  const seconds = base.getUTCSeconds();
  const ms = base.getUTCMilliseconds();

  const targetMonthIndex = month + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(
    Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, seconds, ms),
  );
}

/** Perpanjang langganan: jika masih aktif di masa depan, sambung dari tanggal berakhirnya; jika sudah lewat/kosong, mulai dari sekarang. */
export function computeExtendedExpiry(
  currentExpiresAt: Date | null,
  amount: number,
  unit: DurationUnit,
  now = new Date(),
): Date {
  const anchor =
    currentExpiresAt && currentExpiresAt.getTime() > now.getTime()
      ? currentExpiresAt
      : now;
  return addSubscriptionDuration(anchor, amount, unit);
}

export function isUserExpired(
  user: { role: string; expiresAt: Date | null },
  now = Date.now(),
): boolean {
  if (user.role === "admin" || !user.expiresAt) return false;
  return user.expiresAt.getTime() <= now;
}

export function getSubscriptionInfo(
  user: { role: string; active: boolean; expiresAt: Date | null },
  now = Date.now(),
): { status: SubscriptionStatus; daysLeft: number | null } {
  if (!user.active) {
    return { status: "inactive", daysLeft: null };
  }
  if (user.role === "admin" || !user.expiresAt) {
    return { status: "permanent", daysLeft: null };
  }
  const diffMs = user.expiresAt.getTime() - now;
  if (diffMs <= 0) {
    return { status: "expired", daysLeft: 0 };
  }
  const daysLeft = Math.ceil(diffMs / DAY_MS);
  if (daysLeft <= 7) {
    return { status: "expiring", daysLeft };
  }
  return { status: "active", daysLeft };
}

export function formatExpiryDate(date: Date | null): string {
  if (!date) return "Tanpa batas";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: JAKARTA_TZ,
  }).format(date);
}
