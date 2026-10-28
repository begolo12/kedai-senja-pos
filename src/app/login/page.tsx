import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TeraMark } from "@/components/brand";
import { ArrowUpRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { readPending } from "@/lib/session";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage() {
  const current = await getCurrentUser();
  if (current) redirect(current.role === "admin" ? "/" : "/pos");
  if (await readPending()) redirect("/select-store");

  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-14">
        <div>
          <p className="flex items-center gap-2 text-[10px] tracking-[0.24em] text-sidebar-foreground/70 uppercase">
            <TeraMark className="size-6 rounded-[3px] object-cover" />
            Tera POS · Point of sale
          </p>
          <h1 className="mt-8 max-w-md font-serif text-6xl leading-[0.98] tracking-tight xl:text-7xl">
            Antre boleh
            <br />
            <span className="text-sidebar-primary italic">panjang.</span>
            <br />
            Semua tertera.
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-sidebar-foreground/60">
            Kasir, stok, shift, dan laporan dalam satu layar. Uang laci cocok
            saat tutup hari — tanpa hitung ulang.
          </p>
        </div>

        <div className="relative mt-12 border-t border-sidebar-border pt-6">
          <div className="grid grid-cols-3 gap-6 text-[10px] tracking-[0.14em] uppercase">
            <div>
              <p className="text-sidebar-foreground/40">Kasir</p>
              <p className="mt-1.5 font-mono text-xs normal-case">&lt; 30 detik</p>
            </div>
            <div>
              <p className="text-sidebar-foreground/40">Tablet</p>
              <p className="mt-1.5 font-mono text-xs normal-case">offline-first</p>
            </div>
            <div>
              <p className="text-sidebar-foreground/40">Struk</p>
              <p className="mt-1.5 font-mono text-xs normal-case">58 · 80 mm</p>
            </div>
          </div>
          <div className="pointer-events-none absolute -top-24 right-0 hidden h-56 w-56 border border-sidebar-border/60 xl:block" />
          <div className="pointer-events-none absolute -top-16 right-10 hidden h-56 w-56 border border-sidebar-primary/25 xl:block" />
        </div>
      </section>

      <section className="flex flex-col justify-center px-6 py-14 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center justify-between lg:hidden">
            <span className="flex items-center gap-2 font-serif text-2xl">
              <TeraMark className="size-7 rounded-[4px] object-cover" />
              Tera POS
            </span>
            <span className="stamp border-border text-muted-foreground">POS</span>
          </div>

          <p className="mt-10 text-[11px] tracking-[0.18em] text-muted-foreground uppercase lg:mt-0">
            Meja kasir · Tera POS
          </p>
          <h2 className="mt-2 font-serif text-4xl tracking-tight">Selamat datang</h2>
          <p className="mt-2 mb-8 text-sm text-muted-foreground">
            Masuk dengan ID dan PIN staf. Tidak ada password.
          </p>

          <LoginForm />

          <div className="mt-10 border-t border-dashed pt-5">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ArrowUpRight className="mt-0.5 size-3.5 shrink-0" />
              Lupa PIN? Minta admin mereset dari halaman Staf. Setiap transaksi
              tercatat atas nama akun yang masuk.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}