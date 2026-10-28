# Tera POS

POS warkop multi-toko: ricebowl, sushi, minuman bubuk, camilan. Satu akun
manajemen membuka semua toko; kasir hanya toko yang ditugaskan. Kasir web,
aplikasi Android offline-first, varian menu, dine-in/bungkus, meja, QRIS,
stok, shift, laporan per toko, dan struk thermal 58/80 mm. Semua tertera.

Fitur unggulan: tukar poin loyalitas dengan **membership tier** (kelipatan
poin otomatis dari total belanja), voucher promo berperiode dengan kuota
(kuota kembali saat refund), pembayaran campuran (split tunai + QRIS/kartu),
refund parsial per item, **meja dengan tagihan bayar-nanti + pindah/gabung
+ QR self-order pelanggan**, layar dapur (KDS) dengan status pesanan,
purchase order ke supplier (stok masuk otomatis saat diterima), **resep
bahan baku (BOM)** — produk komposit memotong stok bahannya, struk digital
via WhatsApp, cetak ESC/POS langsung lewat Bluetooth/USB + buka laci tunai,
**QRIS dinamis** (nominal tertanam otomatis), label barcode siap cetak,
katalog publik `/menu/[kode-toko]`, laporan jam sibuk per jam, nomor struk
harian `TRA-YYMMDD-NNN`.

- Web production: https://kedai-senja-pos.vercel.app
- Repo: https://github.com/begolo12/kedai-senja-pos (publik)
- APK: https://github.com/begolo12/kedai-senja-pos/releases/latest
- Rencana: [`docs/PLAN.md`](docs/PLAN.md)
- Desain: [`docs/DESIGN.md`](docs/DESIGN.md)
- Brand: [`docs/BRAND.md`](docs/BRAND.md)
- Printer: [`docs/PRINTER.md`](docs/PRINTER.md)
- Android/offline: [`docs/MOBILE.md`](docs/MOBILE.md)

## Stack

Next.js 16 App Router + React 19 + TypeScript, shadcn/ui, Tailwind v4,
PostgreSQL (Neon di production, PGlite untuk lokal) + Drizzle ORM, Zod,
auth PIN scrypt + cookie/bearer HMAC. Tablet memakai React + Capacitor +
IndexedDB (Dexie), APK dibangun di GitHub Actions.

## Jalankan lokal

```bash
pnpm install
pnpm dev
```

`pnpm dev` menjalankan PGlite (Postgres lokal, port 5433), migrasi, seed,
lalu Next.js. Buka http://localhost:3000.

Seed lokal berisi menu warkop (ricebowl, sushi, minuman bubuk, camilan,
tambahan) dengan varian seperti level pedas/less sugar.

Login memakai **ID + PIN**, lalu **pilih toko**. Tidak ada password.
Manajemen membuka semua toko; kasir hanya toko yang dicentang di menu
**Staf**. Manajemen dapat menambah toko (dengan opsi salin menu), mengganti
ID/PIN, dan menonaktifkan akun.

Akun development (database lokal kosong):

| ID Login | PIN | Akses |
| --- | --- | --- |
| `manajemen` | `123456` | semua toko, semua menu, kelola akun |
| `kasir` | `123456` | Kemang saja: POS + shift |

Seed berisi dua toko: **Warkop Berkah — Kemang** dan **Tebet**. Kasir demo
hanya ditugaskan ke Kemang.

PIN production **tidak** ada di repo: diisi lewat `SEED_ADMIN_PIN` /
`SEED_CASHIER_PIN` saat seed dan disimpan sebagai secret Vercel.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` | PGlite + migrasi + seed + Next dev |
| `pnpm build` / `pnpm start` | Build & jalankan produksi |
| `pnpm db:setup` | Migrasi + seed database dari `DATABASE_URL` |
| `pnpm db:generate` | Buat migrasi Drizzle |
| `pnpm db:reset` | Hapus PGlite lokal (jalankan ulang `pnpm dev`) |
| `pnpm test` / `pnpm lint` / `pnpm typecheck` | Uji & kualitas |
| `cd mobile && pnpm dev` | UI tablet di browser |
| `cd mobile && pnpm build` | Bundle web untuk Capacitor |

## Deploy

Production memakai Vercel + Neon. Environment yang wajib:

```
DATABASE_URL=postgresql://...neon.tech/...?sslmode=require
AUTH_SECRET=<acak ≥32 karakter>
SEED_ADMIN_PIN=<4–8 digit>
SEED_CASHIER_PIN=<4–8 digit>
```

Seed hanya dijalankan eksplisit, tidak otomatis di runtime:

```bash
DATABASE_URL="..." SEED_ADMIN_PIN="..." SEED_CASHIER_PIN="..." NODE_ENV=production pnpm db:setup
```

Neon/Vercel menyediakan `DATABASE_URL` lewat integrasi. Jangan commit nilai
apa pun; `.env.local` sudah di-ignore.

## Alur toko

1. Login ID + PIN.
2. Pilih toko. Manajemen melihat semua toko; kasir melihat yang ditugaskan.
3. Bekerja di toko itu: menu, stok, pesanan, shift, laporan, QRIS, dan
   pengaturan terpisah.
4. **Ganti toko** dari sidebar/topbar tanpa logout.
5. Manajemen: menu **Toko** → tambah toko, salin menu, edit, aktif/nonaktif,
   buka toko. Menu **Staf** → centang toko untuk setiap kasir.

## Alur FnB

- Pilih produk → varian muncul otomatis (mis. Level 1–5, Less sugar).
- Tipe **Dine-in** + nomor meja atau **Bungkus**.
- Catatan per item (mis. tanpa timun) ikut tercetak.
- Diskon, pajak, tunai/QRIS/kartu, atau **campuran** beberapa metode
  (kembalian dihitung dari porsi tunai).
- QRIS: unggah gambar QRIS merchant di Pengaturan; tampil otomatis di layar bayar.
- **Impor menu** dari tempelan Excel/CSV; kategori dibuat otomatis, produk
  dengan nama sama diperbarui.
- Manajemen: **Pembelian** — purchase order ke supplier; saat PO diterima,
  stok naik dan tercatat sebagai movement restock.
- **Refund parsial per item**: pilih item dan jumlahnya; stok, poin, dan
  total belanja dikoreksi proporsional, refund tunai mengurangi kas
  seharusnya saat tutup shift.
- Tablet: alur sama (pelanggan, voucher, tukar poin, tunda tiket), tetap
  jalan offline; sinkron membawa varian, catatan, tipe order, meja, dan
  pelanggan yang dibuat offline.

## Role

| Menu | Manajemen | Kasir |
| --- | --- | --- |
| Kasir, Shift, Dapur (KDS) | ✓ | ✓ |
| Pesanan, Produk, Stok, Pelanggan, Laporan, Staf, Pengaturan | ✓ | — |
| Meja (tagihan, pindah/gabung), Membership, Pembelian, Promo, Toko | ✓ | — |
| Refund, ubah harga/pajak/staf | ✓ | — |
| Struk | semua | hanya transaksi sendiri |

Kasir hanya melihat POS dan shift. Request langsung ke halaman manajemen
dialihkan ke POS; receipt milik kasir lain → 404.

## Android

Workflow GitHub Actions membangun APK setiap `mobile/**` berubah dan
menerbitkan GitHub Release `mobile-v1.0.<run>`. Aplikasi memeriksa release
terbaru dan menyediakan tombol **Unduh & pasang**. APK ditandatangani
dengan keystore yang hanya ada di GitHub Secrets.

Fitur tablet: login, katalog offline, jual offline, antrean sinkron,
riwayat, cetak thermal, update.

## Keamanan

- Tidak ada kredensial, keystore, `DATABASE_URL`, atau PIN production di
  repo publik.
- PIN scrypt; sesi web HttpOnly/SameSite; token mobile HMAC 90 hari.
- Semua total dihitung ulang di server; order offline idempoten `clientId`.
- CORS mobile dibatasi ke origin Capacitor; security headers + CSP aktif.
- Login dibatasi percobaan; API mobile `no-store`.
- Neon TLS; backup mengandalkan Neon PITR.

Batas yang diketahui: cetak ESC/POS langsung butuh printer Bluetooth yang
kompatibel dan browser dengan Web Bluetooth (Chrome/Edge) — jalur print
service OS tetap tersedia; penjualan offline dapat membuat stok server
negatif (oversell) dan perlu koreksi stok.
