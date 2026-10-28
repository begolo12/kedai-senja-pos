# Rencana Produk — Tera POS

POS untuk kedai kopi satu lokasi: kasir cepat di meja, kontrol stok yang bisa
diaudit, laporan harian, dan tablet kasir offline-first. Web memakai
PostgreSQL (Neon di production); tablet memakai IndexedDB + sinkronisasi.
Multi-toko: semua data operasional dipisah per toko, satu akun manajemen
dapat membuka semua toko.

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
- Pembayaran tunai (kembalian + pintasan nominal), QRIS, kartu, atau
  **campuran** (split): beberapa metode sekaligus; kembalian dihitung dari
  porsi tunai, baris pembayaran tersimpan di `order_payments`.
- Idempotensi lewat `clientId` UUID: klik ganda tidak membuat dua pesanan.
- Struk 80 mm siap cetak (print CSS), menampilkan kembalian besar setelah
  pembayaran.

### 3.2 Pesanan
- Daftar dengan filter tanggal, status (selesai/refund parsial/refund),
  pencarian nomor/pelanggan.
- Detail pesanan: item, totals, kasir, shift, pelanggan, modal, laba, poin.
- Refund khusus admin: **penuh atau parsial per item** — pilih item dan
  jumlahnya; stok dikembalikan, poin dan total belanja pelanggan dikoreksi
  proporsional, status (`refunded` / `partially_refunded`) dan pelaku
  tercatat.
- Cetak ulang struk.

### 3.3 Produk & kategori (admin)
- CRUD produk: nama, SKU unik, barcode unik, kategori, harga, modal, stok,
  batas stok rendah, satuan, status jual.
- Dua mode: aktif/nonaktif (riwayat tetap), bukan hapus.
- CRUD kategori dengan warna; kategori terpakai tidak bisa dihapus.
- Varian/pilihan per produk (satu grup, dipisah koma).
- Impor massal: nama, kategori, harga, modal, stok, satuan, pilihan.
- Tabel menampilkan margin dan nilai stok.

### 3.3b Pembelian (purchase order)
- CRUD supplier (manajemen, menu Pembelian): nama unik per toko, telepon,
  catatan, aktif/nonaktif.
- Buat PO: supplier, tanggal estimasi tiba, item (produk, qty, harga beli).
- Terima PO: stok naik otomatis + movement `restock` refType `purchase`;
  batalkan PO selama belum diterima.

### 3.4 Stok
- Daftar stok dengan status aman/menipis/habis.
- Penyesuaian manual: tambah/kurangi + alasan (restock, koreksi, rusak) +
  catatan; stok tidak boleh minus.
- Jejak audit 40 pergerakan terakhir beserta pelaku.
- Penjualan dan refund otomatis menulis pergerakan stok.

### 3.5 Pelanggan & loyalitas
- CRUD nama, telepon unik, email; poin dan total belanja.
- Poin otomatis saat checkout; dikurangi saat refund.
- **Tukar poin**: potongan checkout dari poin pelanggan; nilai tukar per
  1 poin diatur di Pengaturan (0 = fitur mati). Refund mengembalikan poin
  yang ditukar dan mengurangi poin yang didapat.
- Pencarian nama/telepon, ringkasan poin beredar.

### 3.5b Promo (voucher)
- CRUD voucher kode (manajemen, menu Promo): persen/nominal, belanja minimal,
  periode berlaku, batas pemakaian, aktif/nonaktif (bukan hapus).
- Kasir mengetik kode di tiket; potongan digabung dengan diskon manual dan
  tukar poin; total potongan tidak melebihi subtotal. Semua divalidasi ulang
  di server. Refund membebaskan kuota kembali.

### 3.6 Shift
- Satu shift terbuka per kasir; buka dengan kas awal.
- Ringkasan penjualan, tunai masuk (dari `order_payments`), transaksi,
  kas seharusnya.
- Tutup shift: hitung uang fisik, selisih otomatis, catatan. **Refund tunai
  mengurangi kas seharusnya** (proporsional porsi tunai pesanan).
- Riwayat 12 shift terakhir; admin melihat semua kasir.

### 3.7 Laporan (admin)
- Rentang: hari ini, 7 hari, 30 hari, atau tanggal kustom.
- KPI: pendapatan, laba kotor, rata-rata pesanan, refund.
- Tren harian (chart), komposisi metode bayar, pendapatan per kategori,
  produk terlaris, performa kasir.
- **Jam sibuk**: pendapatan per jam (zona Asia/Jakarta) + label jam tersibuk.
- Ekspor CSV (pesanan + item) dengan BOM untuk Excel.

### 3.7b Tiket tertunda & struk digital
- **Tunda tiket**: tiket aktif disimpan di perangkat (tahan refresh), bisa
  diambil atau dibuang; berguna saat pelanggan kembali atau rombongan
  bergantian bayar.
- Struk digital via **WhatsApp** dari halaman struk (butuh nomor pelanggan;
  nomor 08 dinormalisasi ke 62).

### 3.8 Pengaturan & staf (admin)
- Identitas toko, alamat, telepon, footer struk.
- Pajak (basis poin 1/100 %), aturan poin, mata uang (IDR).
- CRUD staf: nama, ID login, role, PIN, aktif/nonaktif, penugasan toko
  untuk kasir; tidak bisa menonaktifkan diri sendiri atau menghapus admin
  aktif terakhir.
- CRUD toko: tambah, salin menu/kategori/stok dari toko aktif, edit,
  aktif/nonaktif, pilih toko. Konfigurasi pajak, QRIS, footer, poin per toko.
- Login hanya ID + PIN (tanpa password). Manajemen dapat mengganti PIN
  lewat tombol PIN dengan konfirmasi ulang.

### 3.10 Meja & self-order QR (P2)
- CRUD meja (admin, menu Meja): nama unik, jumlah kursi, aktif/nonaktif.
- **Tagihan meja**: kasir membuka tagihan lewat tombol "Tagih nanti (meja)"
  atau pelanggan lewat QR; pesanan berstatus `open`, stok langsung dipotong,
  pajak diterapkan saat tagihan dibuka (konsisten dengan checkout langsung),
  muncul di KDS; dibayar (settle) di halaman Meja dengan poin tier.
- **Pindah meja** dan **gabung tagihan** (admin) untuk tagihan terbuka;
  gabung memindahkan item dan menghitung ulang total.
- **Self-order QR** per meja: `/order/[code]?table=N` — katalog publik +
  kirim pesanan ke `/api/public/order`; nomor pesanan ditampilkan ke
  pelanggan. Laporan dan kas shift mengabaikan pesanan `open`/`merged`.

### 3.11 KDS / layar dapur (P2)
- `/kds` (kasir+): antrian pesanan hari ini per kartu — item, catatan, meja,
  menit berjalan; pesanan > 10 menit disorot merah; auto-refresh 10 detik.
- Tombol **Siap** (preparing → ready) dan **Sudah diangkat** (ready → served);
  status tampil di detail pesanan.

### 3.12 Membership tier (P2)
- CRUD tier (admin, menu Membership): nama, ambang total belanja, kelipatan
  poin (100 = normal), benefit, aktif/nonaktif.
- Tier dihitung otomatis dari `customers.totalSpent` sebelum transaksi;
  berlaku di checkout web, settle meja, dan sync tablet. Badge tier di
  halaman Pelanggan.

### 3.13 QRIS, resep/BOM, label barcode, katalog publik (P2)
- **QRIS**: gambar QR dari alat/bank Anda diunggah di Pengaturan (opsi
  unggah gambar; maks 300 KB) dan ditampilkan apa adanya saat pembayaran —
  QR milik merchant berjalan lokal, tanpa pembuatan QR dinamis dan tanpa
  gateway eksternal.
- **Resep/BOM**: produk berresep memotong stok bahan saat terjual (checkout,
  tagihan meja, self-order, sync tablet) dan mengembalikannya saat refund;
  editor resep di form produk.
- **Label barcode**: `/products/labels` — lembar label 40×25 mm dengan
  Code128B SVG (encoder sendiri, teruji), nama, harga, nama toko.
- **Katalog publik**: `/menu/[code]` — menu read-only untuk dibagikan, CTA
  WhatsApp.

### 3.14 Dashboard
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
| `categories` | storeId, name, color, sortOrder | unik per toko |
| `products` | storeId, sku, barcode, name, categoryId, price, cost, stock, lowStockAt, unit, options, active | SKU/barcode unik per toko |
| `customers` | storeId, name, phone, email, points, totalSpent | telepon unik per toko |
| `shifts` | storeId, userId, openedAt, closedAt, openingFloat, countedCash, expectedCash, status | Satu `open` per user+toko |
| `orders` | storeId, number, clientId unik, shiftId, userId, customerId, subtotal, discount*, taxAmount, total, costTotal, pointsEarned, orderType, tableLabel, paymentMethod, amountPaid, changeDue, status, refunded* | nomor unik per toko, harian `TRA-YYMMDD-NNN` |
| `order_items` | orderId, productId, name, sku, unitPrice, cost, qty, note, lineTotal | Snapshot nama/harga + varian/catatan |
| `stock_movements` | storeId, productId, delta, reason, refType/refId, userId, note | Audit append-only per toko |
| `stores` | code unik, name, address, phone, taxRate, receiptWidth, qrisPayload, receiptFooter, pointsPerAmount, active | Konfigurasi + identitas per toko |
| `user_stores` | userId, storeId | Penugasan kasir ke toko |
| `order_payments` | orderId, method, amount | Rincian split payment; tunai = nilai bersih setelah kembalian |
| `vouchers` | storeId, code unik, type, value, minSubtotal, periode, usageLimit, usedCount, active | Diskon kode di checkout |
| `suppliers` | storeId, name unik, phone, note, active | Mitra pembelian |
| `purchase_orders` | storeId, supplierId, status ordered/received/cancelled, totalCost, expectedAt | PO ke supplier |
| `purchase_order_items` | purchaseOrderId, productId, name, qty, unitCost, receivedQty | Snapshot item PO |
| `tiers` | storeId, name unik, minTotalSpent, pointsMultiplier (100=1×), perks, active | Membership tier |
| `tables` | storeId, name unik, seats, active | Denah meja + QR self-order |
| `recipe_items` | productId, ingredientId, qty | BOM: produk memotong stok bahan |
| `login_attempts` | username, success, createdAt | Throttle login lintas instance |

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
| `checkoutAction`, `refundOrderAction`, `refundOrderItemsAction` | `actions/sales.ts` | kasir+ (refund admin) |
| `saveProductAction`, `toggleProductAction`, `saveCategoryAction`, `deleteCategoryAction` | `actions/catalog.ts` | admin |
| `adjustStockAction` | `actions/inventory.ts` | admin |
| `saveCustomerAction` | `actions/customers.ts` | kasir+ |
| `openShiftAction`, `closeShiftAction` | `actions/shifts.ts` | kasir+ |
| `saveSupplierAction`, `toggleSupplierAction`, `createPurchaseOrderAction`, `receivePurchaseOrderAction`, `cancelPurchaseOrderAction` | `actions/purchases.ts` | admin |
| `saveTierAction`, `toggleTierAction` | `actions/tiers.ts` | admin |
| `saveTableAction`, `toggleTableAction`, `createOpenOrderAction`, `settleOrderAction`, `moveOrderTableAction`, `mergeOrdersAction` | `actions/tables.ts` | admin / kasir+ |
| `setKitchenStatusAction` | `actions/kitchen.ts` | kasir+ |
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
- Throttle login 6 percobaan / 5 menit per username, tersimpan di tabel
  `login_attempts` (berlaku lintas instance serverless) + cache memori.
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

### P1 — selesai
Split payment/pembayaran campuran, refund sebagian per item, purchase
order/supplier, refund tunai mempengaruhi kas seharusnya, audit login gagal
lintas instance (tabel `login_attempts` + cron Vercel
`/api/maintenance/login-attempts`), cetak ESC/POS langsung Bluetooth **dan
USB** (WebUSB) + cash drawer, sinkron dua arah pelanggan yang dibuat
offline, dan paritas tablet (tukar poin, voucher, tunda tiket, pelanggan
baru offline) — semua sudah masuk.

### P2 — selesai
Meja (denah, status, tagihan, pindah/gabung) & self-order QR, KDS / order
display dapur, membership tier (campaign promo ditanggung voucher + tier),
QRIS gambar merchant lokal (unggah gambar, tanpa pembuatan dinamis), resep
& bahan baku (BOM), label barcode printing, dan toko online / katalog
publik — semua sudah masuk.

### Tersisa — butuh layanan eksternal
- e-Faktur / integrasi akuntansi pajak: perlu kredensial DJP atau partner
  API berbayar; tidak bisa dijalankan mandiri.
- Payment gateway QRIS dinamis (nominal server-side + notifikasi
  pembayaran): QR memakai gambar QR merchant milik sendiri sesuai keputusan
  pemilik; integrasi gateway (Midtrans/Xendit dsb.) menunggu keputusan
  akun.

### P3 — gagasan lanjutan
- Denah meja visual (posisi meja digambar), integrasi KDS ke printer dapur.
- Sinkron tablet untuk tagihan meja/self-order (saat ini web-only).

## 12. Batasan yang diketahui

- Nomor pesanan berurutan per hari dan bergantung pada zona Asia/Jakarta.
- Refund tidak mengubah kas seharusnya shift (lihat P1).
- Throttle login hilang saat cold start serverless.
- Throttle self-order (10 pesanan/menit/IP) juga hilang saat cold start serverless.
- Laporan memakai SQL agregasi PostgreSQL (`to_char(... AT TIME ZONE)`).
- Penjualan offline dapat menyebabkan oversell; stok dikoreksi manual.
- Data pelanggan tidak memiliki alamat; cukup untuk loyalitas dasar.
- APK memakai signing key di GitHub Secrets; update hanya dari repo publik.
- Cetak thermal lewat print service OS/Android, bukan ESC/POS mentah.