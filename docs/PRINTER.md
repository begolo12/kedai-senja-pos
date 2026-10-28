# Printer Thermal

Aplikasi mendukung printer thermal 58 mm dan 80 mm yang umum dijual di
Indonesia: Epson TM-T82/T88/T20, Xprinter XP-58IIH/XP-80C, RPP02N, Sunmi
built-in, dan printer yang menyediakan driver/print service Android.

## 1. Atur lebar kertas

Masuk sebagai **manajemen** → **Pengaturan** → **Lebar kertas** → pilih
**58 mm** atau **80 mm** → simpan. Buka **Tes cetak** untuk memastikan hasil.

Lebar ini dipakai di struk web dan struk aplikasi Android.

## 2. Web / komputer kasir

1. Pasang driver printer dari vendor, lalu pair (USB/Bluetooth/LAN).
2. Set ukuran kertas printer ke 58 mm atau 80 mm.
3. Buka struk, tekan **Cetak struk**.
4. Di dialog Chrome: pilih printer, **Margins: None**, **Scale: 100%**,
   matikan **Headers and footers**, aktifkan **Background graphics** bila
   perlu. Jangan pakai "Fit to page".

Tidak perlu aplikasi tambahan. Print berjalan lewat driver OS, jadi semua
printer yang tampil di Windows/macOS/Linux bisa dipakai.

## 3. Tablet Android (APK)

APK memakai **Android Print Framework** lewat plugin native. Cetak akan
membuka dialog print Android, sama seperti aplikasi kasir lain.

1. Pasang print service printer di tablet: **Epson iPrint**, **Xprinter**,
   **RawBT**, **Mopria**, atau aplikasi vendor.
2. Pair printer lewat Bluetooth/USB/LAN di pengaturan Android.
3. Di aplikasi Tera POS, selesaikan pembayaran → **Cetak struk**.
4. Pilih printer → cetak.

Plugin mengirim HTML struk ke print service dengan ukuran media sesuai
Pengaturan. Print service yang mendukung 58/80 mm akan memotong kertas
sesuai printer.

## 4. Masalah umum

| Gejala | Perbaikan |
| --- | --- |
| Teks terpotong kanan | Lebar di Pengaturan harus sama dengan kertas; margin printer 0; skala 100% |
| Struk kekecilan / kegedean | Set paper size di driver, bukan "fit" |
| Dialog cetak tidak muncul (APK) | Belum ada print service Android; pasang Epson iPrint/RawBT |
| Bluetooth tidak muncul | Pair dulu di pengaturan Android, bukan dari aplikasi |
| Kertas tidak terpotong | Auto-cut diatur printer/driver, bukan aplikasi |
| Cetak kosong | Coba Tes cetak; ganti kabel/USB; pastikan printer default benar |

## 5. Batasan

- Print lewat browser/Android Print Framework; aplikasi tidak mengirim
  ESC/POS mentah dan tidak membuka cash drawer.
- Untuk integrasi ESC/POS langsung (drawer, QR, logo) dibutuhkan bridge
  lokal/USB—masuk roadmap, bukan perilaku saat ini.
- Cetak web memakai dialog browser; tidak ada silent print. Untuk kiosk,
  jalankan Chrome dengan `--kiosk-printing` di komputer kasir.
## ESC/POS langsung (Bluetooth) — baru

Halaman struk web punya tombol **Thermal** dan **Laci**:

- **Thermal**: pasangkan printer thermal Bluetooth sekali (Web Bluetooth,
  Chrome/Edge desktop atau Android). Struk teks ESC/POS dikirim langsung,
  diakhiri auto-cut, lalu laci tunai ditendang otomatis (ESC p, pin 2).
- **Laci**: hanya menendang cash drawer lewat printer yang tersambung.
- Layout mengikuti lebar kertas pengaturan toko (58/80 mm). Teks ASCII;
  karakter non-ASCII ditulis sebagai `?` agar panjang byte aman di semua
  printer.
- Service/characteristic BLE: `0x18F0` / `0x2AF1` (umum di Epson, Xprinter,
  Rongta). Printer yang memakai UUID lain jatuh ke jalur print service OS.
