import { Capacitor, registerPlugin } from "@capacitor/core";
import { formatMoney, formatTime, sanitize } from "./money";
import type { PendingOrder, Settings } from "./types";

interface ThermalPrintPlugin {
  print(options: { html: string; jobName?: string; widthMm?: string }): Promise<void>;
}

const ThermalPrint = registerPlugin<ThermalPrintPlugin>("ThermalPrint");

export function receiptHtml(order: PendingOrder, settings: Settings) {
  const width = settings.receiptWidth === "58" ? "58mm" : "80mm";
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td>${sanitize(item.name)}${item.note ? `<br><span class="note">${sanitize(item.note)}</span>` : ""}<br><span class="muted">${item.qty} × ${formatMoney(item.unitPrice)}</span></td>
          <td class="right">${formatMoney(item.unitPrice * item.qty)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: ${width} auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { width: ${width}; margin: 0 auto; font-family: ui-monospace, "Courier New", monospace; color: #1e1b16; font-size: 11px; }
  h1 { font-family: Georgia, serif; font-size: 20px; text-align: center; margin: 0; }
  .center { text-align: center; }
  .muted { color: #6b6257; font-size: 9px; }
  .note { color: #8a5a1e; font-size: 9px; }
  .rule { border-top: 1px dashed #c9c0b1; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 0; }
  .right { text-align: right; white-space: nowrap; }
  .total { border-top: 1px solid #1e1b16; font-size: 13px; font-weight: 700; padding-top: 5px; }
  .row { display: flex; justify-content: space-between; padding: 1px 0; }
  .stamp { border: 1px solid #1e1b16; text-align: center; padding: 3px; letter-spacing: 2px; font-size: 9px; margin-top: 8px; }
</style></head><body>
  <h1>${sanitize(settings.storeName)}</h1>
  <div class="center muted">${sanitize(settings.address)}<br>${sanitize(settings.phone)}</div>
  <div class="rule"></div>
  <div class="row"><span>${sanitize(order.serverNumber ?? "OFFLINE")}</span><span>${formatTime(order.createdAt)}</span></div>
  <div class="row"><span>${order.orderType === "takeaway" ? "Bungkus" : "Dine-in"} ${sanitize(order.tableLabel ?? "")}</span><span>${order.paymentMethod.toUpperCase()}</span></div>
  <div class="row"><span>${order.status === "pending" ? "Belum sinkron" : "Tersinkron"}</span></div>
  <div class="rule"></div>
  <table>${rows}</table>
  <div class="rule"></div>
  <div class="row"><span>Subtotal</span><span>${formatMoney(order.subtotal)}</span></div>
  ${order.discountAmount > 0 ? `<div class="row"><span>Diskon</span><span>−${formatMoney(order.discountAmount)}</span></div>` : ""}
  <div class="row"><span>Pajak</span><span>${formatMoney(order.taxAmount)}</span></div>
  <div class="row total"><span>TOTAL</span><span>${formatMoney(order.total)}</span></div>
  <div class="row"><span>Dibayar</span><span>${formatMoney(order.amountPaid)}</span></div>
  <div class="row"><span>Kembali</span><span>${formatMoney(order.changeDue)}</span></div>
  <div class="rule"></div>
  <div class="center muted">${sanitize(settings.receiptFooter)}</div>
  ${order.status === "pending" ? `<div class="stamp">MENUNGGU SINKRON</div>` : ""}
</body></html>`;
}

export async function printOrder(order: PendingOrder, settings: Settings) {
  const html = receiptHtml(order, settings);
  if (Capacitor.isNativePlatform()) {
    await ThermalPrint.print({
      html,
      jobName: order.serverNumber ?? "Struk Kasir Senja",
      widthMm: settings.receiptWidth,
    });
    return;
  }

  const win = window.open("", "_blank", "width=380,height=700");
  if (!win) {
    window.print();
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}