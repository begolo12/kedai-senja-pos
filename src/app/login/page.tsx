import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
            <span className="inline-block h-px w-8 bg-sidebar-primary" />
            Sejak 2019 · Jakarta
          </p>
          <h1 className="mt-8 max-w-md font-serif text-6xl leading-[0.98] tracking-tight xl:text-7xl">
            Senja selalu
            <br />
            <span className="text-sidebar-primary italic">ramai.</span>
            <br />
            Kasirnya tenang.
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-sidebar-foreground/60">
            Satu layar untuk pesanan, stok, dan uang laci. Tanpa pindah tab, tanpa
            hitung ulang.
          </p>
        </div>

        <div className="relative mt-12 border-t border-sidebar-border pt-6">
          <div className="grid grid-cols-3 gap-6 text-[10px] tracking-[0.14em] uppercase">
            <div>
              <p className="text-sidebar-foreground/40">Jam buka</p>
              <p className="mt-1.5 font-mono text-xs normal-case">07.00 — 22.00</p>
            </div>
            <div>
              <p className="text-sidebar-foreground/40">Lokasi</p>
              <p className="mt-1.5 text-xs normal-case">Kebayoran Baru</p>
            </div>
            <div>
              <p className="text-sidebar-foreground/40">Meja</p>
              <p className="mt-1.5 font-mono text-xs normal-case">01 — 12</p>
            </div>
          </div>
          <div className="pointer-events-none absolute -top-24 right-0 hidden h-56 w-56 border border-sidebar-border/60 xl:block" />
          <div className="pointer-events-none absolute -top-16 right-10 hidden h-56 w-56 border border-sidebar-primary/25 xl:block" />
        </div>
      </section>

      <section className="flex flex-col justify-center px-6 py-14 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center justify-between lg:hidden">
            <span className="font-serif text-2xl">{"Kasir Senja"}</span>
            <span className="stamp border-border text-muted-foreground">POS</span>
          </div>

          <p className="mt-10 text-[11px] tracking-[0.18em] text-muted-foreground uppercase lg:mt-0">
            Meja kasir · {"Kasir Senja"}
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