"use client";

import { QRCodeSVG } from "qrcode.react";

/** QR self-order per meja: pelanggan pindai → menu publik + kirim pesanan. */
export function TableQr({ storeCode, tableId, tableName }: { storeCode: string; tableId: number; tableName: string }) {
  const url =
    typeof window === "undefined"
      ? `/order/${storeCode}?table=${tableId}`
      : `${window.location.origin}/order/${storeCode}?table=${tableId}`;
  return (
    <div className="flex flex-col items-center gap-1">
      <QRCodeSVG value={url} size={96} className="bg-white p-1" />
      <a
        href={url}
        className="font-mono text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        target="_blank"
        rel="noopener noreferrer"
      >
        Pesan dari {tableName}
      </a>
    </div>
  );
}
