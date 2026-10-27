import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/receipt/print-button";

export default async function PrintTestPage() {
  await requireAdmin();
  const settings = await getSettings();
  const paper = settings.receiptWidth === "58" ? "58" : "80";

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center bg-background px-4 py-8 print:block print:bg-white print:p-0">
      <style>{`@media print { @page { size: ${paper}mm auto; margin: 3mm; } .receipt-sheet { width: ${paper}mm !important; max-width: none !important; } }`}</style>
      <div className="no-print mb-4 flex w-full max-w-md items-center justify-between gap-2">
        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href="/settings" />}>
          <ArrowLeft /> Pengaturan
        </Button>
        <PrintButton label={`Tes cetak ${paper}mm`} />
      </div>

      <article
        className="receipt-sheet w-full border border-border bg-[#fffdf8] px-6 py-7 text-[#1e1b16] shadow-[4px_4px_0_0_var(--border)] print:border-0 print:shadow-none"
        style={{ maxWidth: paper === "58" ? 300 : 340 }}
      >
        <header className="text-center">
          <h1 className="font-serif text-2xl">{settings.storeName}</h1>
          <p className="mt-1 text-[10px] leading-relaxed text-[#6b6257]">{settings.address}</p>
          <p className="text-[10px] text-[#6b6257]">{settings.phone}</p>
        </header>
        <div className="my-4 border-t border-dashed border-[#c9c0b1]" />
        <p className="text-center font-mono text-[11px] tracking-[0.2em] uppercase">
          Tes printer {paper} mm
        </p>
        <div className="mt-3 space-y-1 font-mono text-[11px]">
          <div className="flex justify-between"><span>Contoh item</span><span>1 × {formatMoney(2_800_000)}</span></div>
          <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(2_800_000)}</span></div>
          <div className="flex justify-between"><span>Pajak 11%</span><span>{formatMoney(308_000)}</span></div>
          <div className="flex justify-between border-t border-[#1e1b16] pt-1 text-[13px] font-semibold">
            <span>Total</span><span>{formatMoney(3_108_000)}</span>
          </div>
        </div>
        <div className="my-4 border-t border-dashed border-[#c9c0b1]" />
        <p className="text-center font-mono text-[9px] leading-relaxed text-[#6b6257]">
          Jika teks terpotong, ubah lebar kertas, margin printer, atau skala cetak ke 100%.
        </p>
        <p className="mt-2 text-center font-mono text-[9px] tracking-[0.24em] uppercase">
          {settings.receiptFooter}
        </p>
      </article>
    </div>
  );
}