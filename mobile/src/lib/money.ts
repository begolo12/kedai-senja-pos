export function formatMoney(minor: number, currency = "IDR") {
  const digits = currency === "IDR" ? 0 : 2;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 100);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function parseMoneyInput(input: string | number) {
  const digits = String(input).replace(/[^\d-]/g, "");
  return digits ? Number.parseInt(digits, 10) * 100 : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function computeTotals(
  lines: { unitPrice: number; qty: number }[],
  {
    discountType = null,
    discountValue = 0,
    taxRate = 0,
  }: {
    discountType?: "amount" | "percent" | null;
    discountValue?: number;
    taxRate?: number;
  } = {},
) {
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

export function formatTime(value: string | number) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function sanitize(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}