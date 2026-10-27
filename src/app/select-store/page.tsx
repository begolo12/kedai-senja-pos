import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MapPin, Store as StoreIcon } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getAllowedStores } from "@/lib/auth";
import { readPending, readSession } from "@/lib/session";
import { chooseStoreAction } from "@/lib/actions/stores";
import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Pilih toko" };

export default async function SelectStorePage({
  searchParams,
}: PageProps<"/select-store">) {
  const params = await searchParams;
  const pending = await readPending();
  const session = await readSession();

  const userId = pending?.userId ?? session?.userId;
  if (!userId) redirect("/login");

  const found = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = found[0];
  if (!user || !user.active) redirect("/login");

  const available = await getAllowedStores(user);
  const error = params.error === "1";

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-sidebar px-5 py-6 text-sidebar-foreground sm:px-10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] tracking-[0.22em] text-sidebar-foreground/60 uppercase">
              Kasir Senja · {pending ? "Masuk" : "Ganti toko"}
            </p>
            <h1 className="mt-2 font-serif text-4xl leading-none">Pilih toko</h1>
            <p className="mt-2 text-sm text-sidebar-foreground/60">
              {user.name} · {user.role === "admin" ? "Manajemen" : "Kasir"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {user.role === "admin" ? (
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={<Link href="/stores" />}
                className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"
              >
                Kelola toko
              </Button>
            ) : null}
            <form action={logoutAction}>
              <Button
                variant="ghost"
                size="sm"
                type="submit"
                className="text-sidebar-foreground/70 hover:text-sidebar-foreground"
              >
                Keluar
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-10">
        {error ? (
          <p className="mb-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Toko tidak tersedia untuk akun ini.
          </p>
        ) : null}

        {available.length === 0 ? (
          <div className="border border-dashed px-6 py-16 text-center">
            <StoreIcon className="mx-auto size-6 text-muted-foreground" strokeWidth={1.4} />
            <h2 className="mt-3 font-serif text-2xl">Belum ada toko</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {user.role === "admin"
                ? "Buat toko pertama lewat menu Toko."
                : "Minta manajemen menugaskan akun ini ke minimal satu toko."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {available.map((store) => {
              const current = session?.storeId === store.id;
              return (
                <div
                  key={store.id}
                  className="flex flex-col justify-between border border-border bg-card p-5 shadow-[3px_3px_0_0_var(--border)]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                          {store.code}
                        </p>
                        <h2 className="mt-1 font-serif text-2xl leading-tight">{store.name}</h2>
                      </div>
                      {current ? (
                        <span className="stamp border-signal/40 text-signal">Aktif</span>
                      ) : null}
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span>{store.address || "Alamat belum diisi"}</span>
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      Pajak {(store.taxRate / 100).toLocaleString("id-ID")}% ·{" "}
                      {store.receiptWidth} mm
                    </p>
                  </div>
                  <form action={chooseStoreAction} className="mt-5">
                    <input type="hidden" name="storeId" value={store.id} />
                    <Button
                      type="submit"
                      className="w-full bg-signal text-signal-foreground hover:bg-signal/90"
                    >
                      Buka {store.name} <ArrowRight />
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        {!pending ? (
          <Link
            href={user.role === "admin" ? "/" : "/pos"}
            className="mt-6 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Kembali tanpa mengganti toko
          </Link>
        ) : null}
      </main>
    </div>
  );
}