# Aplikasi Android & Mode Offline

Aplikasi tablet: `mobile/` (React + Vite + Capacitor). APK dibangun oleh
GitHub Actions dan dipublikasikan sebagai GitHub Release.

## Fitur

- Login username + PIN (butuh internet pada login pertama).
- Katalog, kategori, pelanggan, pengaturan tersimpan di IndexedDB tablet.
- Jual offline: varian menu, catatan item, dine-in/bungkus + meja,
  pembayaran tunai/QRIS/kartu (gambar QRIS ikut tersinkron), struk.
- Antrean pesanan offline; sinkron otomatis saat online.
- Tombol **Update** memeriksa GitHub Releases, mengunduh APK, lalu membuka
  installer Android.
- Cetak struk thermal 58/80 mm lewat Android Print Framework.
- Riwayat lokal + status sinkron per pesanan.

## Model sinkronisasi

1. **Login** → token bearer (HMAC, 90 hari) + tarik snapshot katalog.
2. **Jual offline** → pesanan disimpan lokal dengan `clientId` UUID,
   stok lokal dikurangi, struk bisa dicetak.
3. **Online** → semua pesanan `pending` dikirim ke `/api/mobile/sync`.
4. Server memproses tiap pesanan dalam transaksi sendiri:
   - `clientId` idempoten: kirim ulang tidak menggandakan penjualan.
   - Total dihitung ulang; jika tidak cocok → `rejected` (tidak disimpan).
   - Penjualan diterima meski stok server sudah berkurang (offline
     oversell); stok bisa negatif dan muncul sebagai konflik stok.
   - Varian, catatan item, tipe order, dan meja ikut dikirim.
   - Nomor struk final dibuat server (`KDJ-YYMMDD-NNN`).
5. Server mengembalikan snapshot baru: **katalog & stok server menang**.
   Pesanan lokal tidak dihapus; statusnya `synced`/`rejected`.
6. Konflik yang terlihat: pesanan `rejected` dengan alasan, stok negatif,
   dan selisih stok yang harus dikoreksi lewat menu Stok.

Yang tidak pernah terjadi:

- Harga/total dari perangkat dipakai mentah; server memvalidasi ulang.
- Pesanan terkirim dua kali (idempoten).
- Data lokal dihapus saat logout bila masih ada pesanan pending (logout
  diblokir sampai antrean kosong).

## Build APK

Workflow: `.github/workflows/android.yml`.

- Trigger: push ke `main` yang menyentuh `mobile/**`, atau manual.
- Runner: Node 22, JDK 21, Android SDK 36.
- Langkah: build web → `cap add android` → plugin thermal + permission
  installer → `assembleRelease` → zipalign → tanda tangan → GitHub Release
  `mobile-v1.0.<run>`.
- APK ditandatangani dengan keystore stabil yang disimpan sebagai **GitHub
  Actions secret** (tidak ada di repo). Tanpa keystore stabil, update APK
  akan ditolak Android karena signature berbeda.
- `versionCode` mengikuti nomor run, `versionName` = versi rilis.

Untuk build lokal (butuh Android SDK + JDK 21):

```bash
cd mobile
pnpm install
VITE_API_URL=https://<domain> VITE_GITHUB_REPO=<owner>/<repo> pnpm build
npx cap add android
node scripts/setup-android.mjs
npx cap sync android
cd android && ./gradlew assembleRelease
```

## Update dari GitHub

`mobile/src/lib/update.ts`:

1. `GET https://api.github.com/repos/<repo>/releases/latest` (publik, tanpa
   token).
2. Bandingkan tag `mobile-vX.Y.Z` dengan versi aplikasi.
3. Unduh asset `.apk` dari host `github.com`.
4. Simpan ke cache aplikasi, buka installer lewat FileOpener.
5. Fallback: buka URL rilis di browser.

Tidak ada token GitHub atau kredensial yang ditanam di APK. Repo harus
publik agar pemeriksaan rilis berjalan tanpa secret. Izin Android
`REQUEST_INSTALL_PACKAGES` hanya untuk sideload, bukan Play Store.

## Keamanan

- Token disimpan di Preferences aplikasi (sandbox Android), PIN tidak
  disimpan.
- Semua API memakai HTTPS; CORS dibatasi ke origin Capacitor.
- Login API punya throttle; PIN di-hash scrypt di server.
- APK hanya menerima update dari repo publik yang di-hardcode saat build dan
  URL asset harus `https://github.com/`.
- Keystore, password, `DATABASE_URL`, dan `AUTH_SECRET` hanya ada di GitHub
  Secrets / Vercel Environment—tidak pernah di repo.