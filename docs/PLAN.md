# Rencana Produk — Kedai Senja POS

POS untuk kedai kopi satu lokasi: kasir cepat di meja, kontrol stok yang bisa
diaudit, laporan harian, dan tablet kasir offline-first. Web memakai
PostgreSQL (Neon di production); tablet memakai IndexedDB + sinkronisasi.

Status: **P0 selesai dan terverifikasi** (lihat `docs/DESIGN.md` dan
`README.md` untuk cara jalan).

## 1. Pengguna & tugas utama

| Peran | Datang untuk | Ukuran sukses |
| --- | --- | --- |
| Kasir | Menyelesaikan pesanan < 30 detik, uang kembalian benar | Nol salah hitung, keranjang tidak hilang saat refresh |
| Admin / pemilik | Menutup shift, mengecek penjualan, stok, dan selisih laci | Selisih shift terlihat per kasir, laporan cocok dengan uang |
| Barista (tidak login) | — | Struk jelas, pesanan tidak dobel |

Batas produk: satu kedai, satu terminal utama, satu mata uang (IDR), satu
pembayaran per pesanan. Multi-outlet, split bill, dan pembayaran campuran
sengaja di luar P0 (lihat §11).

## 2. Stack dan alasan

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Framework | Next.js 16 App Router, React 19, TypeScript | Server Components memuat data langsung dari DB; server actions menghapus lapisan API untuk mutasi; satu proses untuk deploy lokal |
| UI | Tailwind CSS v4 + shadcn/ui (base-nova, Base UI) | Komponen milik sendiri, aksesibel (fokus, dialog, menu), mudah diubah tanpa override tema pihak ketiga |
| Data | PostgreSQL + Drizzle ORM | Neon serverless di production, PGlite (Postgres WASM) untuk pengembangan lokal. Transaksi ACID, row lock, dan advisory lock untuk nomor pesanan |
| Validasi | Zod | Semua input server divalidasi ulang; klien tidak dipercaya |
| Auth | Username + PIN, scrypt, cookie HMAC HttpOnly | Staf lapangan tidak memakai email; PIN 4–8 digit cukup untuk terminal bersama. Tanpa dependensi auth eksternal |
| Grafik | Recharts | Cukup untuk tren harian; tidak menarik library chart besar |
| Test | `node:test` via tsx | Satu file, tanpa framework tambahan |

Tidak dipakai: Prisma (Drizzle sudah cukup dan lebih ringan), NextAuth/Clerk
(alur PIN lebih sederhana), state manager global (server components +
`useState` cukup), tRPC (server actions sudah typed).

**Mobile:** React + Vite + Capacitor + Dexie/IndexedDB. APK dibangun GitHub
Actions, update dari GitHub Releases. Detail: `docs/MOBILE.md`.

**Deploy:** Vercel (web) + Neon (Postgres). Migrasi dan seed dijalankan
eksplisit lewat `pnpm db:setup`; tidak ada DDL otomatis di request path.

## 3. Fitur P0 (semua terimplementasi)

### 3.1 Kasir
- Login username + PIN, sesi 12 jam, logout.
- Shift wajib: kasir terkunci sampai shift dibuka dengan kas awal.
- Katalog aktif + filter kategori + pencarian nama/SKU/barcode.
- Pindai barcode: fokus otomatis, Enter menambah produk yang cocok; `/`
  memfokuskan pencarian.
- Keranjang: tambah, ubah qty, hapus, kosongkan; draft tersimpan di
  `localStorage` dan dipulihkan setelah refresh.
- Pelanggan opsional dari daftar; poin ditampilkan.
- Tipe pesanan dine-in/bungkus + nomor meja/nama; tercetak di struk.
- Varian menu (level pedas, less sugar, dingin/panas) per produk.
- Catatan per item (tanpa timun, extra sambal).
- Diskon pesanan: persen atau nominal, dibatasi subtotal.
- QRIS merchant: unggah gambar di Pengaturan, tampil saat pembayaran.
- Impor menu CSV/Excel paste; kategori otomatis; update by nama.
- Pajak dari pengaturan, dihitung setelah diskon.
- Pembayaran tunai (kembalian + pintasan nominal), QRIS, kartu.
- Idempotensi lewat `clientId` UUID: klik ganda tidak membuat dua pesanan.
- Struk 80 mm siap cetak (print CSS), menampilkan kembalian besar setelah
  pembayaran.

### 3.2 Pesanan
- Daftar dengan filter tanggal, status, pencarian nomor/pelanggan.
- Detail pesanan: item, totals, kasir, shift, pelanggan, modal, laba, poin.
- Refund khusus admin: stok dikembalikan, poin dan total belanja pelanggan
  dikurangi, status dan pelaku tercatat.
- Cetak ulang struk.

### 3.3 Produk & kategori (admin)
- CRUD produk: nama, SKU unik, barcode unik, kategori, harga, modal, stok,
  batas stok rendah, satuan, status jual.
- Dua mode: aktif/nonaktif (riwayat tetap), bukan hapus.
- CRUD kategori dengan warna; kategori terpakai tidak bisa dihapus.
- Varian/pilihan per produk (satu grup, dipisah koma).
- Impor massal: nama, kategori, harga, modal, stok, satuan, pilihan.
- Tabel menampilkan margin dan nilai stok.

### 3.4 Stok
- Daftar stok dengan status aman/menipis/habis.
- Penyesuaian manual: tambah/kurangi + alasan (restock, koreksi, rusak) +
  catatan; stok tidak boleh minus.
- Jejak audit 40 pergerakan terakhir beserta pelaku.
- Penjualan dan refund otomatis menulis pergerakan stok.

### 3.5 Pelanggan
- CRUD nama, telepon unik, email; poin dan total belanja.
- Poin otomatis saat checkout; dikurangi saat refund.
- Pencarian nama/telepon, ringkasan poin beredar.

### 3.6 Shift
- Satu shift terbuka per kasir; buka dengan kas awal.
- Ringkasan penjualan, tunai masuk, transaksi, kas seharusnya.
- Tutup shift: hitung uang fisik, selisih otomatis, catatan.
- Riwayat 12 shift terakhir; admin melihat semua kasir.

### 3.7 Laporan (admin)
- Rentang: hari ini, 7 hari, 30 hari, atau tanggal kustom.
- KPI: pendapatan, laba kotor, rata-rata pesanan, refund.
- Tren harian (chart), komposisi metode bayar, pendapatan per kategori,
  produk terlaris, performa kasir.
- Ekspor CSV (pesanan + item) dengan BOM untuk Excel.

### 3.8 Pengaturan & staf (admin)
- Identitas toko, alamat, telepon, footer struk.
- Pajak (basis poin 1/100 %), aturan poin, mata uang (IDR).
- CRUD staf: nama, username, role, PIN, aktif/nonaktif; tidak bisa
  menonaktifkan diri sendiri atau menghapus admin aktif terakhir.

### 3.9 Dashboard
- Ringkasan hari ini vs kemarin, laba kotor, stok menipis.
- Chart 7 hari, pesanan terbaru, produk terlaris hari ini.
- Peringatan bila shift belum dibuka.

## 4. Alur kritis

### 4.1 Penjualan
```
buka shift → pilih produk → (pelanggan) → (diskon) → pilih metode
→ bayar → struk + kembalian → stok turun + movement + poin
```
Semua perhitungan uang diulang di server dari harga DB. Klien hanya
mengirim `productId` + `qty`; harga, diskon, pajak, dan total tidak pernah
dipercaya dari klien.

### 4.2 Refund (admin)
```
buka pesanan → refund + alasan → stok kembali + movement refund
→ poin & totalSpent pelanggan dikoreksi → status refunded
```
Pesanan tidak dihapus. Laporan memisahkan nilai refund.

### 4.3 Tutup shift
```
kas seharusnya = kas awal + total tunai pesanan selesai pada shift
selisih = uang dihitung − kas seharusnya
```
Refund tidak mengurangi kas seharusnya (uang refund fisik dicatat sebagai
catatan operasional di P0); lihat §11.

## 5. Model data

File: `src/lib/db/schema.ts`. Uang = integer minor unit (sen), waktu =
epoch milidetik.

| Tabel | Kolom penting | Catatan |
| --- | --- | --- |
| `users` | name, username unik, pinHash (scrypt), role, active | Role `admin`/`cashier` |
| `categories` | name unik, color, sortOrder | Warna dipakai sebagai penanda |
| `products` | sku unik, barcode unik, name, categoryId, price, cost, stock, lowStockAt, unit, options, active | `options` = varian dipisah koma |
| `customers` | name, phone unik, email, points, totalSpent | Poin = turunan transaksi |
| `shifts` | userId, openedAt, closedAt, openingFloat, countedCash, expectedCash, status | Satu `open` per user (dijaga action) |
| `orders` | number unik, clientId unik, shiftId, userId, customerId, subtotal, discount*, taxAmount, total, costTotal, pointsEarned, orderType, tableLabel, paymentMethod, amountPaid, changeDue, status, refunded* | Nomor harian `KDJ-YYMMDD-NNN` |
| `order_items` | orderId, productId, name, sku, unitPrice, cost, qty, note, lineTotal | Snapshot nama/harga + varian/catatan |
| `stock_movements` | productId, delta, reason, refType/refId, userId, note | Audit append-only |
| `settings` | id=1, storeName, address, phone, currency, taxRate, pointsPerAmount, receiptWidth, qrisPayload, receiptFooter | Satu baris; QRIS berupa payload/gambar |

**Invarian**
1. `stock >= 0`; penyesuaian yang membuat minus ditolak.
2. Total pesanan dihitung ulang di server dari `products.price` saat itu.
3. Diskon ≤ subtotal; pajak dihitung dari subtotal setelah diskon.
4. `orders.clientId` unik → retry tidak menggandakan transaksi.
5. Stok dan pesanan ditulis dalam satu transaksi PostgreSQL; baris produk dikunci `FOR UPDATE`.
6. Refund hanya sekali; `status` menjadi `refunded`.
7. Poin didapat disimpan di `orders.pointsEarned`, sehingga refund memakai angka saat transaksi, bukan tarif poin terbaru.

## 6. Arsitektur kode

```
src/
  app/
    (app)/            shell login-protected: dashboard, pos, orders, products,
                      inventory, customers, reports, shift, staff, settings
    login/            layar masuk
    receipt/[id]/     struk 80 mm (print CSS)
    api/reports/export/route.ts   CSV (admin)
  components/
    ui/               shadcn base-nova (dimiliki proyek)
    pos/              terminal kasir
    products/ inventory/ customers/ staff/ shift/ orders/ settings/ receipt/
    charts/           Recharts
    shared/           PageHeader, EmptyState
  lib/
    db/               schema, koneksi, migrasi otomatis, seed demo
    actions/          server actions per domain
    auth.ts session.ts pin.ts
    money.ts dates.ts validation.ts csv.ts settings.ts shifts.ts
  drizzle/            SQL migrasi (dibuat drizzle-kit)
docs/                 rencana, desain, screenshot
.pgdata/              PGlite lokal (gitignored)
```

Aturan: halaman server membaca DB langsung; mutasi lewat server actions;
komponen interaktif memanggil action dan `router.refresh()`; tidak ada API
internal tambahan selain ekspor CSV.

## 7. Kontrak action (otorisasi)

| Action | File | Akses |
| --- | --- | --- |
| `loginAction`, `logoutAction` | `actions/auth.ts` | publik / sesi |
| `checkoutAction`, `refundOrderAction` | `actions/sales.ts` | kasir+ (refund admin) |
| `saveProductAction`, `toggleProductAction`, `saveCategoryAction`, `deleteCategoryAction` | `actions/catalog.ts` | admin |
| `adjustStockAction` | `actions/inventory.ts` | admin |
| `saveCustomerAction` | `actions/customers.ts` | kasir+ |
| `openShiftAction`, `closeShiftAction` | `actions/shifts.ts` | kasir+ |
| `updateSettingsAction` | `actions/settings.ts` | admin |
| `saveStaffAction`, `toggleStaffAction` | `actions/staff.ts` | admin |

Setiap action memvalidasi Zod dan memeriksa sesi/role sendiri; layout hanya
lapisan UX, bukan pengaman.

## 8. Desain

Arah visual, token, states, dan keputusan aksesibilitas ada di
`docs/DESIGN.md`. Ringkas: "Counter Ledger" — kertas hangat, rel tinta,
aksen oksida, serif untuk judul, mono tabular untuk uang, sudut nyaris
kotak, garis putus-putus seperti struk.

## 9. Keamanan & operasi

- PIN di-hash scrypt + salt acak; perbandingan `timingSafeEqual`.
- Sesi: HMAC-SHA256 atas payload `{uid, exp}`, cookie HttpOnly, SameSite
  Lax, Secure di produksi, umur 12 jam. Secret dari `AUTH_SECRET`
  (wajib ≥ 16 karakter di produksi).
- Throttle login 6 percobaan / 5 menit per username (in-memory; lihat §11).
- Otorisasi diperiksa di setiap action, bukan hanya di UI.
- CSP/header keamanan belum dipasang (P1), karena deployment awal lokal.
- Backup: Neon PITR/backup otomatis; untuk ekspor manual gunakan
  `pg_dump` dengan `DATABASE_URL_UNPOOLED`.
- Database kosong selalu diisi data contoh kedai; ganti PIN staf sebelum
  dipakai nyata dan jangan buka instance demo ke internet.
- Serverless Vercel + Neon; pool `pg` dibatasi 5 koneksi per instance.

## 10. Verifikasi yang sudah dijalankan

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (7 test uang/CSV/nomor).
- PostgreSQL: migrasi Neon, seed production dengan PIN env, health API,
  login web/mobile, transaksi, refund, laporan, CSV.
- Android: build APK lewat GitHub Actions, release stabil, update check.
- Browser nyata: login admin & kasir, buka shift, pindai barcode, draft
  bertahan setelah reload, checkout tunai & QRIS, stok turun, refund admin,
  produk/kategori, penyesuaian stok, pelanggan, staf baru, batas role
  (kasir diarahkan dari halaman admin), simpan pengaturan, ekspor CSV,
  struk, layout 1440 & 390 tanpa overflow.
- Pemeriksaan visual otomatis: tidak ada error konsol, kontras teks lolos
  setelah token aksen digelapkan.
- Bukti: `docs/screens/*.png`.

## 11. Di luar P0 & roadmap

### P1 — operasional berikutnya
- Split payment dan pembayaran campuran.
- Redemption poin (saat ini poin hanya dikumpulkan).
- Refund sebagian per item.
- Purchase order / supplier dan stok masuk terjadwal.
- Cetak ESC/POS langsung (USB/Bluetooth) + cash drawer.
- Audit login gagal lintas instance (Redis/Upstash).
- Backoffice multi-outlet (tambahkan `outletId` di produk/order/shift).
- Retur penjualan mempengaruhi kas seharusnya di tutup shift.
- Sinkron dua arah untuk pelanggan yang dibuat offline.

### P2 — pertumbuhan
- Meja & self-order QR.
- Membership tier, voucher, dan campaign.
- Integrasi akuntansi/pajak (e-Faktur), payment gateway QRIS dinamis.
- Barcode label printing, resep & bahan baku (Bill of Materials).

## 12. Batasan yang diketahui

- Nomor pesanan berurutan per hari dan bergantung pada zona Asia/Jakarta.
- Refund tidak mengubah kas seharusnya shift (lihat P1).
- Throttle login hilang saat cold start serverless.
- Laporan memakai SQL agregasi PostgreSQL (`to_char(... AT TIME ZONE)`).
- Penjualan offline dapat menyebabkan oversell; stok dikoreksi manual.
- Data pelanggan tidak memiliki alamat; cukup untuk loyalitas dasar.
- APK memakai signing key di GitHub Secrets; update hanya dari repo publik.
- Cetak thermal lewat print service OS/Android, bukan ESC/POS mentah.