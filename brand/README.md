# QuaiWatch — Brand Assets

Aset visual untuk sosial media & branding. Folder ini **tidak** ikut ter-deploy ke situs.

## File

| File | Ukuran | Pakai untuk |
|------|--------|-------------|
| `quaiwatch-banner-1500x500.png` | 1500×500 | Header / cover akun X |
| `quaiwatch-logo-400.png` | 400×400 | Foto profil X (ukuran rekomendasi resmi X) |
| `quaiwatch-logo-1024.png` | 1024×1024 | Avatar bot Telegram, press, hi-res |

## Desain

- **Warna**: indigo `#6366f1`/`#4338ca` + cyan aksen `#22d3ee`, background near-black `#0B0C0E` (sama dengan tema situs).
- **Banner**: garis pada banner adalah grafik **transaksi harian Quai yang asli** (31 hari, sumber Quaiscan) — bukan dekorasi acak. Elemen penting ditaruh di band tengah agar tidak tertutup foto profil (yang menimpa kiri-bawah) atau terpotong crop X.
- **Logo**: mark Q + garis pulse + dot notifikasi, identik dengan navbar & favicon situs.

## Regenerasi

Sumber ada di `src/*.html`. Untuk render ulang (mis. ganti warna/teks atau update data chart):

1. Jalankan static server lokal yang menyajikan folder `src/`.
2. Buka file HTML di browser dengan viewport diset persis ke ukuran target
   (1500×500 untuk banner, 400×400 / 1024×1024 untuk logo).
3. Screenshot full-page dengan device scale → PNG.

Data chart di `banner.html` bisa diperbarui dari:
`https://quaiscan.io/api/v2/stats/charts/transactions`
