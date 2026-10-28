# Brand — Tera POS

Identitas produk untuk aplikasi di repo ini. Keputusan desain interaksi tetap
di `docs/DESIGN.md`, rencana fitur di `docs/PLAN.md`.

## 1. Nama

**Tera POS.** Dipilih setelah audit konflik Google Play/pasar:

| Kandidat | Status | Keputusan |
| --- | --- | --- |
| Laci | Dipakai ("Laci - POS Kasir", Herbs, Play Store) | gugur |
| Laris | Dipakai ("Laris POS", Solis Logic, 100 rb+ unduhan) | gugur |
| Nyala | Bersih | runner-up |
| Untung, Panen, Laba | Bersih, makna lebih lemah | cadangan |
| **Tera** | **Bersih di ranah POS Indonesia** | **dipakai** |

Makna bertingkat (semuanya kasir-native):

1. **Tanda tera** — stempel resmi di timbangan pasar yang membuktikan timbangan jujur. Simbol kepercayaan paling dikenal pedagang Indonesia.
2. **Tertera** — tagline *build-in*: "Semua tertera." Janji produk: tiap rupiah, stok, shift, dan refund tercatat dan bisa diaudit.
3. Bunyi: dua suku kata, tegas, mudah diucapkan dan dieja.

Aturan pakai: **Tera** (produk), **Tera POS** (lengkap/app). Jangan: TERA, terapos, TeraPos.

## 2. Tagline & suara

- **Tagline:** *Semua tertera.*
- **Hero login:** "Antre boleh panjang. / Semua tetap tertera." (web + Android sama).
- **Suara:** Bahasa Indonesia operator, kalimat pendek, angka eksplisit. Lanjutkan gaya `docs/DESIGN.md` §7: "Uang diterima kurang dari total", "Stok Cinnamon Roll tinggal 4". Tidak ada "Oops!", tidak ada "demo/contoh".

## 3. Logo

`src/components/brand.tsx` — segel cap melingkar, satu warna (`currentColor`):

- **Lingkaran luar** tegas + **lingkaran dalam putus-putus** (perforasi struk),
- **huruf T** sebagai tally — kaki tegak, palang datar,
- **garis total putus-putus** di bawah T (baris total di struk).

Favicon: `src/app/icon.svg` (segel oksida `#8d2f0c` di atas koin krem).
Android: nama "Tera POS", appId `id.terapos.pos` (`mobile/capacitor.config.ts`).

Lockup: mark + "Tera" serif italic + chip "POS" (komponen `TeraWordmark` tersedia;
login memakai teks langsung agar tracking bisa diatur per konteks).

## 4. Arah visual

Diteruskan dari "Counter Ledger" (`docs/DESIGN.md`): kertas hangat, rel tinta,
aksen oksida, serif judul (Instrument Serif), mono tabular untuk uang, radius 4 px,
garis putus-putus struk. Brand Tera justru memperkuat bahasa yang sudah ada —
aplikasi ini memang sudah memakai "stempel" (`stamp`), cap refund, dan
tipografi buku kas. Yang berubah hanya nama dan narasi, bukan sistem visual.

Perbandingan kompetitor yang dihindari: Moka (biru royal `#2E53AF`, lowercase
`sans`), majoo (gradien teal–lime `#47BAB3→#A1CF7E`), POST. (monokrom + biru
elektrik `#155DFC`, wordmark italic). Tera menempati teritori yang kosong:
**kertas–tinta–oksida, stempel, editorial.**

## 5. Fitur yang diadaptasi dari referensi

Fitur di bawah ini dipilih karena gabungan tiga kriteria: (a) dipasarkan agresif
oleh ≥2 dari Moka/majoo/POST., (b) bisa dikerjakan dalam arsitektur repo ini
(Next.js + Postgres + server actions), (c) langsung terasa di meja kasir.

| # | Fitur | Sumber | Status di Tera |
| --- | --- | --- | --- |
| 1 | Tukar poin saat checkout (loyalty cardless) | Moka loyalty ★, majoo membership+poin ★, POST loyalty | **sudah ada** (`pointsValue` di Pengaturan; baris "Tukar N poin" di tiket, struk, detail pesanan) |
| 2 | Voucher kode berperiode, syarat belanja, kuota | majoo kupon/voucher ★, Moka promo berperiode | **sudah ada** (menu Promo, admin; refund mengembalikan kuota) |
| 3 | Tunda tiket (open bill / save bill) | Moka save bill, majoo simpan order | **sudah ada** (tombol jeda di tiket; tersimpan lokal, tahan refresh; max tidak dibatasi UI, masuk akal < 20) |
| 4 | Struk digital via WhatsApp | Moka e-receipt ★, majoo notifikasi WA, POST (rekomendasi eksplisit) | **sudah ada** (tombol WhatsApp di halaman struk bila pelanggan punya nomor; nomor dinormalisasi 08→62) |
| 5 | Laporan jam sibuk (tren per jam) | Moka "jam ramai", majoo waktu teramai (Advance+), POST tren per jam | **sudah ada** (bagian "Jam sibuk" di Laporan + KPI tersibuk) |

Aturan main yang sama untuk semua: server menghitung ulang (voucher/poin/tukar
tidak dipercaya dari klien), refund membalikkan semuanya (poin dikembalikan,
kuota voucher dibebaskan, stok kembali).

## 6. Roadmap (sengaja belum diambil)

Ditemukan di riset, bernilai, tetapi di luar arsitektur/sesi ini:

| Fitur | Sumber | Kenapa ditunda |
| --- | --- | --- |
| Split payment & split bill | Moka ★, majoo (semua paket) | Butuh tabel pembayaran per pesanan; pecah bill = pecah pesanan. Desain skema ada, belum diimplementasi. |
| Manajemen meja (denah, status, pindah/gabung) | Moka ★ table management, majoo Advance+ | Butuh modul denah + status realtime; `tableLabel` string hari ini cukup untuk warung kecil. |
| QR order dine-in / self-order | Moka Order ★, majoo e-menu/Prime | Butuh rute publik + pembayaran online; prasyarat gateway QRIS dinamis. |
| Resep/BOM + HPP | Moka premium, majoo resep ★ | Butuh tabel bahan + relasi produk; mengubah seluruh jalur checkout. |
| Supplier & purchase order | Moka Basic PO, majoo Advance+ | Modul admin baru; stok masuk hari ini via penyesuaian manual. |
| KDS / order display | majoo Prime | Butuh channel realtime (SSE/WebSocket) ke layar dapur. |
| Toko online / GoStore | POST toko online gratis, majoo Order | Butuh rute publik + katalog publik; arsitektur siap (Next.js), produk belum. |
| Split-bill Android, tukar poin & voucher di tablet | paritas mobile | Tiket web dulu; kontrak sync mobile tidak berubah (field baru opsional, default aman). |

Lihat `docs/PLAN.md` §11 untuk P1/P2 operasional lainnya.
