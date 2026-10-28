import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { MessageCircle } from "lucide-react";
import { db } from "@/lib/db";
import { categories, products, stores } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";

type PageProps = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const found = await db
    .select({ name: stores.name })
    .from(stores)
    .where(and(eq(stores.code, code.toLowerCase()), eq(stores.active, true)))
    .limit(1);
  return { title: found[0] ? `Menu · ${found[0].name}` : "Menu", robots: { index: true } };
}

/** Katalog publik: menu toko untuk dibagikan (toko online minimal). */
export default async function PublicMenuPage({ params }: PageProps) {
  const { code } = await params;
  const storeCode = code.toLowerCase();

  const found = await db
    .select()
    .from(stores)
    .where(and(eq(stores.code, storeCode), eq(stores.active, true)))
    .limit(1);
  const store = found[0];
  if (!store) notFound();

  const [catalog, cats] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        price: products.price,
        unit: products.unit,
        options: products.options,
        categoryId: products.categoryId,
      })
      .from(products)
      .where(and(eq(products.storeId, store.id), eq(products.active, true)))
      .orderBy(asc(products.name)),
    db
      .select({ id: categories.id, name: categories.name, color: categories.color, sortOrder: categories.sortOrder })
      .from(categories)
      .where(eq(categories.storeId, store.id))
      .orderBy(asc(categories.sortOrder)),
  ]);

  const byCategory = cats.map((cat) => ({
    ...cat,
    items: catalog.filter((item) => item.categoryId === cat.id),
  }));
  const uncategorized = catalog.filter((item) => item.categoryId === null);
  const waOrder = store.phone
    ? `https://wa.me/${store.phone.replace(/\D/g, "").replace(/^0/, "62")}`
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-8">
      <header className="mb-6 flex items-center gap-3 border-b border-border pb-5">
        <img
          src="/logo-96.jpg"
          alt={store.name}
          className="size-12 rounded-[6px] object-cover"
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl leading-none">{store.name}</h1>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {store.address}
            {store.phone ? ` · ${store.phone}` : ""}
          </p>
        </div>
      </header>

      {waOrder ? (
        <a
          href={waOrder}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-6 flex items-center justify-center gap-2 border border-signal/50 bg-signal/5 px-4 py-3 text-sm text-signal"
        >
          <MessageCircle className="size-4" />
          Pesan lewat WhatsApp
        </a>
      ) : null}

      {byCategory.map((cat) =>
        cat.items.length === 0 ? null : (
          <section key={cat.id} className="mb-7">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              <span className="size-2 rounded-full" style={{ background: cat.color }} />
              {cat.name}
            </h2>
            <ul className="divide-y divide-dashed divide-border">
              {cat.items.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="text-[15px]">{item.name}</span>
                    {item.options ? (
                      <span className="block text-[11px] text-muted-foreground">
                        pilihan: {item.options}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular">
                    {formatMoney(item.price, store.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}

      {uncategorized.length > 0 ? (
        <section className="mb-7">
          <h2 className="mb-3 text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            Lainnya
          </h2>
          <ul className="divide-y divide-dashed divide-border">
            {uncategorized.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="text-[15px]">{item.name}</span>
                <span className="shrink-0 font-mono text-sm tabular">
                  {formatMoney(item.price, store.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {catalog.length === 0 ? (
        <p className="border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          Menu belum tersedia.
        </p>
      ) : null}

      <footer className="mt-10 border-t border-dashed pt-4 text-center text-[11px] text-muted-foreground">
        Harga dapat berubah. Pesan langsung di kasir atau lewat QR meja.
      </footer>
    </div>
  );
}
