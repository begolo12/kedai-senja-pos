import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader, SectionLabel } from "@/components/shared/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SettingsForm } from "@/components/settings/settings-form";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const { store } = await requireAdmin();
  const settings = await getSettings(store.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={`Konfigurasi · ${store.name}`}
        title="Pengaturan"
        description="Identitas toko, pajak, dan aturan poin. Perubahan berlaku untuk transaksi berikutnya."
        actions={
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/print-test" />}>
            Tes cetak
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="border border-border bg-card p-5">
          <SectionLabel>Identitas & aturan</SectionLabel>
          <SettingsForm settings={settings} />
        </section>

        <section className="space-y-4">
          <div className="border border-border bg-card p-5">
            <SectionLabel>Contoh struk</SectionLabel>
            <div className="border border-border bg-[#fffdf8] px-4 py-5 text-[#1e1b16]">
              <p className="text-center font-serif text-xl">{settings.storeName}</p>
              <p className="mt-1 text-center text-[10px] leading-relaxed text-[#6b6257]">
                {settings.address || "Alamat toko"}
              </p>
              <p className="text-center text-[10px] text-[#6b6257]">{settings.phone}</p>
              <div className="my-3 border-t border-dashed border-[#c9c0b1]" />
              <div className="space-y-1 font-mono text-[10px]">
                <p>Caffè Latte · 1 × {formatMoney(2800000)}</p>
                <div className="flex justify-between pt-1">
                  <span>Total</span>
                  <span>{formatMoney(3108000)}</span>
                </div>
              </div>
              <div className="my-3 border-t border-dashed border-[#c9c0b1]" />
              <p className="text-center font-mono text-[9px] leading-relaxed text-[#6b6257]">
                {settings.receiptFooter}
              </p>
            </div>
          </div>

          <div className="border border-border bg-card p-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Catatan operasional</p>
            <ul className="mt-2 space-y-2 text-[13px]">
              <li>Pajak dihitung setelah diskon, dibulatkan ke rupiah terdekat.</li>
              <li>Poin dihitung dari total setelah pajak, dibulatkan ke bawah.</li>
              <li>Harga tidak pernah dikirim dari klien; kasir menghitung ulang di server.</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}