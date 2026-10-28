# Al-Qur’an Daarul Azmi

Website pembaca Al-Qur’an statis untuk Pondok Pesantren Daarul Azmi. Dibangun dengan HTML, CSS, dan JavaScript vanilla; daftar surah dan ayat dimuat dari [EQuran.id API v2](https://equran.id/apidev/v2), dengan teks Al-Qur’an bersumber dari Kementerian Agama RI.

## Fitur

- Daftar 114 surah dan pencarian nama surah.
- Teks Arab asli beserta terjemahan Bahasa Indonesia.
- Navigasi surah sebelumnya/berikutnya dan URL yang dapat dibagikan (`?surah=1`).
- Audio satu surah atau ayat, dengan enam pilihan qari dari API.
- Tafsir per ayat, transliterasi yang dapat ditampilkan, dan tema gelap.
- Filter surah Mekah/Madinah, surah pilihan, dan pengaturan ukuran teks Arab.
- Kumpulan doa dan jadwal shalat bulanan, termasuk pilihan provinsi serta kabupaten/kota.
- Indikator pemuatan, pesan kesalahan, dan coba lagi.
- Permintaan API memiliki batas waktu; daftar dan detail yang telah berhasil dimuat disimpan selama halaman terbuka.
- Pratinjau berbagi Open Graph menggunakan artwork banner Qur’an Digital Daarul Azmi.

## Sumber konten

- Teks Arab, nama surah, dan terjemahan Indonesia: [Kementerian Agama Republik Indonesia](https://quran.kemenag.go.id/), disajikan melalui [EQuran.id API v2](https://equran.id/apidev/v2).
- Tafsir: endpoint tafsir EQuran.id API v2 (`/tafsir/{nomor-surah}`), yang menampilkan tafsir Kementerian Agama RI.
- Murottal: URL audio surah lengkap dan per ayat dari CDN EQuran.id, sesuai pemetaan enam qari pada respons API.
- Doa dan dzikir: [EQuran.id Doa API](https://equran.id/apidev/doa); jadwal shalat wilayah Indonesia: [EQuran.id Jadwal Shalat API](https://equran.id/apidev/shalat).
- Referensi tampilan: [EQuran.id](https://equran.id/). Situs ini hanya mengadaptasi pola antarmuka pembaca; logo dan identitas warna menggunakan aset Daarul Azmi.

## Jalankan secara lokal

Jalankan server statis dari direktori repository:

```sh
python3 -m http.server 8000
```

Buka <http://localhost:8000>. Browser membutuhkan koneksi internet untuk mengambil data dari API.

## Deploy ke GitHub Pages

1. Pastikan repository menggunakan branch publikasi yang benar dan folder `/(root)` di **Settings → Pages → Build and deployment**.
2. Pada **Settings → Pages → Custom domain**, masukkan `quran.daarulazmi.ponpes.id` dan simpan. File `CNAME` di root juga menetapkan domain tersebut.
3. Pada pengelola DNS domain `daarulazmi.ponpes.id`, buat record:

   | Type | Host/Name | Target/Value |
   | --- | --- | --- |
   | CNAME | `quran` | `daarulazmi-ponpes.github.io` |

   Gunakan hostname GitHub Pages milik pemilik repository yang ditampilkan pada pengaturan Pages bila berbeda.
4. Tunggu propagasi DNS dan verifikasi domain pada GitHub Pages. Setelah sertifikat tersedia, aktifkan **Enforce HTTPS**.

Subdomain tidak memerlukan record A; record CNAME hanya berlaku untuk host `quran` dan tidak mengubah domain utama `daarulazmi.ponpes.id`.
