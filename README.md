# Kedai Senja POS

Point of sale lokal untuk kedai: kasir cepat, shift & laci, stok yang bisa
diaudit, pelanggan berpoin, dan laporan harian. Satu proses Next.js, satu
file SQLite. Tanpa layanan eksternal.

- Rencana produk lengkap: [`docs/PLAN.md`](docs/PLAN.md)
- Arah desain & token: [`docs/DESIGN.md`](docs/DESIGN.md)

## Jalankan

```bash
pnpm install
pnpm dev
```

Buka http://localhost:3000. Database dibuat otomatis di `data/pos.db`,
migrasi dijalankan saat start, dan data contoh (14 hari penjualan, 24 produk)
diisi bila database masih kosong.

**Akun contoh**

| Username | PIN | Role |
| --- | --- | --- |
| `rani` | `1234` | admin |
| `bima` | `5678` | kasir |

Buka **Shift** dulu sebelum transaksi pertama.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` | Server pengembangan |
| `pnpm build` / `pnpm start` | Build & jalankan produksi |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Test uang, nomor pesanan, CSV |
| `pnpm db:generate` | Buat migrasi Drizzle setelah ubah schema |
| `pnpm db:reset` | Hapus database lokal (seed ulang saat start) |

## Konfigurasi

Salin `.env.example` menjadi `.env.local` untuk produksi:

```
AUTH_SECRET=string-acak-minimal-32-karakter
# DATABASE_PATH=./data/pos.db
# COOKIE_SECURE=0   # hanya untuk LAN HTTP tepercaya
```

- `AUTH_SECRET` wajib di production; tanpa itu aplikasi menolak membuat sesi.
- Cookie sesi `Secure` di production. Bila terminal diakses lewat HTTP di LAN
  tepercaya, set `COOKIE_SECURE=0`; untuk akses jaringan sebaiknya tetap HTTPS.
- Database memakai WAL. Backup saat aplikasi berhenti, atau gunakan
  `sqlite3 data/pos.db ".backup backup.db"`.
- Database kosong selalu diisi data contoh kedai (termasuk akun demo).
  Ganti PIN staf sebelum dipakai nyata, dan jangan buka instance demo ke internet.

## Fitur

- **Kasir** — filter kategori, cari/pindai barcode, draft keranjang tahan
  refresh, diskon persen/nominal, pajak, tunai/QRIS/kartu, kembalian, struk
  80 mm.
- **Shift** — kas awal, penjualan tunai, kas seharusnya, tutup shift dengan
  selisih, riwayat.
- **Pesanan** — filter, detail, cetak ulang, refund admin (stok & poin
  kembali).
- **Produk & kategori** — CRUD, margin, aktif/nonaktif.
- **Stok** — penyesuaian beralasan + jejak audit.
- **Pelanggan** — poin otomatis, total belanja.
- **Laporan** — rentang tanggal, tren, metode bayar, kategori, produk,
  kasir, ekspor CSV.
- **Staf & pengaturan** — role admin/kasir, PIN, identitas toko, pajak, poin.

## Struktur

```
src/app/(app)      halaman setelah login
src/app/login      layar masuk
src/app/receipt    struk cetak
src/lib/db         schema, koneksi, migrasi, seed
src/lib/actions    server actions (validasi + otorisasi)
src/components/ui  shadcn/ui
docs               rencana, desain, screenshot
```

## Catatan operasional

- Uang disimpan sebagai integer minor unit; semua total dihitung ulang di
  server. Klien tidak pernah mengirim harga.
- Satu shift terbuka per kasir; checkout ditolak tanpa shift.
- Aplikasi ini untuk satu terminal/satu file SQLite. Untuk beberapa terminal
  paralel, pindahkan data ke Postgres (Drizzle) sebelum menambah instance.
- Refund P0 mengembalikan stok dan poin, tetapi belum mengurangi “kas
  seharusnya” pada shift; catat di note shift bila ada uang keluar.
- Rate limit login bersifat per proses dan hilang saat restart.