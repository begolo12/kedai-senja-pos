# Desain — Tera POS (Dark Roastery)

Dokumen ini mencatat arah visual, token, state, dan keputusan interaksi untuk **Kopi Tera / Tera POS**.

## 1. Arah: "Dark Roastery"

**Kategori:** perangkat kasir untuk kafe, coffee bar, dan restoran hybrid (layanan meja + counter).
**Pengguna di layar pertama:** kasir & barista berdiri di bar dengan pencahayaan hangat/redup; pelanggan menunggu di kasir atau meja.
**Hal pertama yang harus terbaca:** total pesanan, modifier berbayar, dan tombol bayar/tagih meja.

## 2. Token

Didefinisikan di `src/app/globals.css` (oklch, semantic, `color-scheme: dark`).

| Token | Nilai | Peran |
| --- | --- | --- |
| `--background` | `oklch(0.145 0.012 52)` | Roasted espresso gelap |
| `--foreground` | `oklch(0.945 0.014 78)` | Warm crema |
| `--card` | `oklch(0.185 0.014 52)` | Panel / kartu tiket |
| `--muted-foreground` | `oklch(0.71 0.018 70)` | Teks pendukung, kontras tinggi |
| `--border` | `oklch(0.285 0.016 55)` | Garis 1px |
| `--signal` | `oklch(0.68 0.145 55)` | Tembaga / amber hangat (CTA & modifier aktif) |
| `--signal-foreground` | `oklch(0.15 0.015 50)` | Tinta gelap di atas aksen amber |
| `--destructive` | `oklch(0.62 0.18 25)` | Refund, void/batal, stok habis |
| `--sidebar` | `oklch(0.115 0.010 50)` | Rel navigasi gelap |
| `--radius` | `0.25rem` | Sudut nyaris kotak |

Aksen digelapkan dari `oklch(0.6)` ke `oklch(0.44)` setelah pemeriksaan
kontras otomatis: teks krem di atas oksida 0.6 hanya 3.97:1.

**Tipografi**
- Judul & nama toko: Instrument Serif 400 — memberi nada editorial, bukan
  dashboard.
- UI & tabel: Geist Sans.
- Uang, SKU, nomor pesanan, waktu: Geist Mono + `font-variant-numeric:
  tabular-nums` (kelas `.tabular`).
- Label mikro: 10–11 px, uppercase, tracking 0.12–0.18em. Ini bagian dari
  bahasa "stempel buku kas", bukan eyebrow dekoratif: setiap label menandai
  blok data yang berbeda (TOTAL, SHIFT, STOK MENIPIS).

**Bentuk & ruang**
- Radius 4 px, border 1 px, bayangan hanya offset keras (`3px 3px 0`),
  tidak ada blur.
- Grid 4/8 px; padding panel 16–20 px; jarak antar-blok 16–28 px.
- Satu aksen per layar; sisanya kertas dan tinta.

## 3. Layout

**Shell** (`src/app/(app)/layout.tsx`)
- Rel kiri 240 px, tinta, item aktif ditandai garis oksida 2 px.
- Topbar 56 px: tanggal, kasir, status shift, menu pengguna.
- Mobile (<1024 px): rel menjadi sheet; topbar menyisakan menu, status,
  avatar.

**Kasir** (`/pos`)
- Desktop: `1fr / 390px`. Katalog di kiri (grid 2–4 kolom), tiket sticky di
  kanan menyerupai struk: header, pelanggan, item, diskon, totals, metode.
- Tiga tombol bayar sejajar; tunai membuka dialog dengan pintasan nominal
  dan kembalian besar.
- Mobile: katalog dulu, tiket di bawah; bar bawah tetap menampilkan jumlah
  item + total dan melompat ke `#ticket`.
- Detail kecil yang penting: kartu produk menampilkan sisa stok; produk
  habis tidak bisa diklik; qty di tiket dibatasi stok; draft bertahan
  setelah refresh.

**Tabel backoffice**
- Header uppercase 10 px, baris 40–44 px, angka rata kanan mono, status
  memakai stempel (border + uppercase), bukan badge bulat.
- Filter berupa form GET sederhana agar URL bisa dibagikan dan di-refresh.

**Struk** (`/receipt/[id]`)
- Lebar 340 px di layar, 80 mm saat print; font mono 10–11 px; garis putus-
  putus; cap "DIKEMBALIKAN" bila refund.
- Halaman struk tidak memakai shell agar bersih saat dicetak.

## 4. State yang dirancang

| State | Tampilan |
| --- | --- |
| Shift belum dibuka | Kasir terkunci + CTA buka shift; banner di dashboard |
| Katalog kosong | Kotak putus-putus + arahan, bukan tabel kosong |
| Keranjang kosong | Tiket menampilkan "Belum ada item" + arahan |
| Stok habis / menipis | Kartu redup / label sisa stok merah; tidak bisa dijual |
| Pembayaran kurang | Tombol nonaktif + pesan inline, bukan alert |
| Error validasi | Pesan di atas tombol, border kiri merah, fokus tetap |
| Sukses bayar | Halaman struk + kembalian besar + tombol cetak |
| Refund | Pesanan tetap ada dengan cap refund dan pelaku |
| Loading | Spinner di tombol; dialog tidak menutup sampai selesai |
| Sesi habis | Action mengembalikan pesan; layout mengarahkan ke login |

## 5. Motion

Tiga gerak saja, semuanya memberi umpan balik:
1. **Kartu produk** terangkat 2 px + bayangan offset saat hover; tekan
   terasa seperti mengambil barang.
2. **Baris keranjang** masuk dengan fade + slide 4 px (150 ms) agar
   penambahan terlihat, bukan melompat.
3. **Dialog / menu** memakai transisi bawaan Base UI (fade + zoom 95%);
   toast muncul di kanan bawah.

Media `prefers-reduced-motion: reduce` mematikan animasi dan transisi.
Chart memakai animasi bawaan Recharts; tidak ada animasi dekoratif lain.

## 6. Aksesibilitas

- Fokus terlihat di semua kontrol (`focus-visible` ring).
- Dialog/menu Base UI menangani focus trap, Escape, dan ARIA.
- Semua input punya label; tombol ikon punya `aria-label`.
- Pencarian `/`, Enter menambah hasil teratas; alur tidak bergantung mouse.
- Kontras teks diperiksa otomatis; tiga temuan awal diperbaiki (aksen,
  label sidebar, angka stok).
- Target sentuh utama ≥ 32 px; tombol bayar 40 px.
- Angka uang memakai locale `id-ID`, bukan potongan string manual.

## 7. Suara copy

- Bahasa Indonesia, kalimat operator: "Buka shift dulu", "Uang diterima
  kurang dari total", "Stok Cinnamon Roll tinggal 4".
- Tidak ada kata "demo", "contoh", "placeholder" di layar produksi.
- Angka dan status selalu disebut eksplisit; tidak ada "Oops!".

## 8. Bukti & batas
- Screenshot: `docs/screens/` (login, dashboard, kasir, pembayaran, struk,
  pesanan, produk, stok, pelanggan, laporan, shift, pengaturan, promo, mobile).
- Pemeriksaan otomatis: tidak ada error konsol, kontras teks lolos setelah
  token aksen digelapkan.
- Label mikro uppercase di atas judul dilaporkan oleh pemeriksa sebagai
  "eyebrow". Dipertahankan karena berfungsi sebagai penanda blok data pada
  bahasa buku kas; bukan hiasan.
- Tinjauan visual independen: lingkungan ini tidak dapat menampilkan gambar
  ke peninjau. Yang tersedia adalah inspeksi DOM, screenshot tersimpan, dan
  lint visual otomatis.
- Layar 200% zoom belum diuji terpisah; layout memakai satuan rem dan tidak
  mengunci tinggi teks.
- Identitas produk (nama, logo, tagline): `docs/BRAND.md`. Arah visual di
  dokumen ini tidak berubah; brand Tera memakai bahasa yang sama (stempel,
  struk, tinta). Nama dagang di seluruh UI: **Tera POS**; contoh data memakai
  "Warkop Berkah".

## 9. Tablet & APK

Aplikasi Android memakai bahasa visual yang sama dalam ukuran sentuh:
topbar tinta dengan status online/offline/antrean, katalog dua–empat kolom,
tiket sebagai panel kanan di tablet dan bottom-sheet di ponsel, tombol bayar
selebar panel.

State khusus offline:
- pill **Online/Offline** dan jumlah antrean selalu terlihat;
- pesanan lokal diberi cap **pending**, setelah sinkron menjadi nomor server;
- pesanan ditolak tampil dengan alasan di riwayat;
- banner pembaruan GitHub muncul di atas katalog dengan tombol unduh;
- cetak struk tetap tersedia saat offline.

Printer memakai lebar 58/80 mm dari Pengaturan; struk Android dikirim ke
Android Print Framework, struk web ke dialog cetak browser.

Bukti tablet: `docs/screens/mobile-pos.webp`.

## 10. Varian & tipe order

Produk dengan varian membuka pilihan ringkas sebelum masuk tiket (level
pedas, less sugar, dingin/panas). Pilihan + catatan menjadi satu baris
teks di tiket, struk, dan pesanan—tanpa dialog berlapis.

Tiket punya dua tombol besar **Dine-in / Bungkus** dan isian meja/nama.
Keduanya ikut tercetak. QRIS menampilkan gambar merchant yang diunggah dari
Pengaturan, bukan sekadar label metode bayar.

Impor menu memakai tempelan spreadsheet: pengguna tidak perlu mengisi satu
per satu untuk 30 menu warkop.

## 11. Multi-toko

Login berakhir di layar **Pilih toko**: kartu toko dengan kode, alamat,
pajak, dan lebar struk. Manajemen melihat semua toko; kasir hanya yang
ditugaskan. Topbar dan sidebar selalu menampilkan toko aktif, dengan tautan
**Ganti toko** tanpa logout.

Manajemen punya menu **Toko** berisi kartu statistik (produk, pesanan hari
ini, omzet), tombol buka toko, edit, tambah toko, serta opsi salin menu.
Data toko tidak pernah tercampur: katalog, stok, pesanan, shift, pelanggan,
QRIS, dan laporan difilter berdasarkan toko sesi.

Tablet mengikuti urutan yang sama: ID → PIN → pilih toko. Cache lokal
dibersihkan bila berpindah toko agar pesanan offline tidak masuk ke toko
yang salah.
