/**
 * All money is stored as integer minor units (sen for IDR, cents for USD).
 * No floats anywhere in the money path.
 */


function currencyDigits(currency: string) {
  return currency === "IDR" ? 0 : 2;
}

export function formatMoney(
  minor: number,
  currency = "IDR",
  opts: { compact?: boolean } = {},
) {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    notation: opts.compact ? "compact" : "standard",
  }).format(minor / 100);
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function formatDateTime(value: Date | number) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

export function formatTime(value: Date | number) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

export function formatDate(value: Date | number) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

/** "22.000" / "22000" / "Rp 22.000" -> 2200000 minor units. */
export function parseMoneyInput(input: string | number): number {
  const digits = String(input).replace(/[^\d-]/g, "");
  if (!digits) return 0;
  return Number.parseInt(digits, 10) * 100;
}



export type DiscountType = "amount" | "percent";

export type CartTotals = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
};

/**
 * Server and client share this so the ticket always matches the charge.
 * Discount is capped at the subtotal; tax applies after discount.
 */
export function computeTotals(
  lines: { unitPrice: number; qty: number }[],
  {
    discountType = null,
    discountValue = 0,
    taxRate = 0,
  }: {
    discountType?: DiscountType | null;
    discountValue?: number;
    taxRate?: number;
  } = {},
): CartTotals {
  const subtotal = lines.reduce(
    (sum, line) => sum + Math.round(line.unitPrice) * line.qty,
    0,
  );

  const rawDiscount =
    discountType === "percent"
      ? Math.round((subtotal * clamp(discountValue, 0, 100)) / 100)
      : discountType === "amount"
        ? Math.max(0, Math.round(discountValue))
        : 0;
  const discountAmount = Math.min(subtotal, rawDiscount);
  const taxable = subtotal - discountAmount;
  const taxAmount = Math.round((taxable * clamp(taxRate, 0, 10000)) / 10000);

  return {
    subtotal,
    discountAmount,
    taxAmount,
    total: taxable + taxAmount,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Fixed daily sequence: KDj-YYMMDD-001. Caller passes today's count. */
export function orderNumber(date: Date, seq: number, prefix = "KDJ") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return `${prefix}-${parts.replaceAll("-", "")}-${String(seq).padStart(3, "0")}`;
}