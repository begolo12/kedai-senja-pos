# Desain — Kedai Senja POS

Dokumen ini mencatat arah visual, token, state, dan keputusan interaksi.
Rencana produk ada di `docs/PLAN.md`.

## 1. Arah: "Counter Ledger"

**Kategori:** perangkat kasir untuk kedai kopi satu lokasi.
**Pengguna di layar pertama:** kasir berdiri, satu tangan di layar sentuh,
satu tangan memegang produk; pelanggan menunggu.
**Hal pertama yang harus terbaca:** total pesanan dan tombol bayar.
**Benchmark:** Square/Toast (kecepatan, hierarki jelas) dan buku kas fisik
(kepercayaan, jejak, tipografi angka).

Arah yang dipertimbangkan:

| Arah | Gagasan | Kenapa tidak dipilih |
| --- | --- | --- |
| SaaS biru default | Bersih, familiar, mengikuti template dashboard | Tidak membedakan apa pun; terlalu "produk software", bukan "meja kedai" |
| Gelap neon | Kontras tinggi, terasa kafe malam | Sulit dibaca di ruang terang; aksen neon mengalahkan angka uang |
| **Counter Ledger** | Kertas hangat, tinta, aksen oksida, serif untuk judul, mono untuk uang, garis putus-putus struk | Dipilih: cepat dipindai, terasa seperti alat kerja nyata, tidak generik |

Prinsipnya: **satu layar, satu pekerjaan**. Katalog dan tiket tidak berebut;
uang selalu mono dan tabular; warna hanya untuk status (oksida = aksi,
hijau zaitun = data, merah = risiko).

Yang sengaja dihindari: gradien, glassmorphism, sudut bulat besar, ikon
emoji, ilustrasi dekoratif, kartu di dalam kartu, label berbahasa Inggris.

## 2. Token

Didefinisikan di `src/app/globals.css` (oklch, semantic).

| Token | Nilai | Peran |
| --- | --- | --- |
| `--background` | `oklch(0.963 0.013 82)` | Kertas hangat |
| `--foreground` | `oklch(0.235 0.014 55)` | Tinta |
| `--card` | `oklch(0.988 0.007 82)` | Tiket / panel |
| `--muted` | `oklch(0.928 0.014 82)` | Latar sekunder |
| `--muted-foreground` | `oklch(0.49 0.018 62)` | Teks pendukung, lolos 4.5:1 |
| `--border` | `oklch(0.865 0.017 82)` | Garis 1px |
| `--primary` | `oklch(0.25 0.014 55)` | Tinta pekat / tombol utama |
| `--signal` | `oklch(0.44 0.135 38)` | Aksen oksida; CTA dan angka risiko |
| `--destructive` | `oklch(0.46 0.16 28)` | Refund, hapus, stok habis |
| `--sidebar` | `oklch(0.225 0.013 55)` | Rel navigasi |
| `--radius` | `0.25rem` | Sudut nyaris kotak |
| `--chart-1…5` | oksida, tinta, zaitun, gandum, baja | Grafik |

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
  pesanan, produk, stok, pelanggan, laporan, shift, staf, pengaturan, mobile).
- Pemeriksaan otomatis: tidak ada error konsol, overflow horizontal, atau
  gambar gagal muat; kontras lolos setelah perbaikan token.
- Label mikro uppercase di atas judul dilaporkan oleh pemeriksa sebagai
  "eyebrow". Dipertahankan karena berfungsi sebagai penanda blok data pada
  bahasa buku kas; bukan hiasan.
- Tinjauan visual independen belum dilakukan: lingkungan ini tidak dapat
  menampilkan gambar ke peninjau. Yang tersedia adalah inspeksi DOM,
  screenshot tersimpan, dan lint visual otomatis.
- Layar 200% zoom belum diuji terpisah; layout memakai satuan rem dan tidak
  mengunci tinggi teks.
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
