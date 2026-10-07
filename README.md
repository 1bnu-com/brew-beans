# Brew & Beans — Website Cafe (Frontend + Backend)

Website cafe dengan pemesanan online, database, dan dashboard admin.
Backend memakai **Node.js murni tanpa library tambahan**, jadi **tidak perlu `npm install`**.

- Di laptop: database berupa file `data/cafe.db`
- Online (Vercel): database di **Turso** (SQLite di cloud, gratis)

---

## A. Menjalankan di laptop

1. Install **Node.js versi LTS terbaru** (minimal 22.13) dari https://nodejs.org
2. Buka folder ini di VS Code, lalu buka Terminal (`Ctrl + ~`)
3. Jalankan `npm start`
4. Buka http://localhost:3000 (website) dan http://localhost:3000/admin.html (admin)

Login admin pertama kali: **admin / admin123**. Segera ganti di menu **Akun**.

Mode development (restart otomatis saat file diubah): `npm run dev`

---

## B. Publish ke internet (GitHub + Vercel + Turso)

### 1. Push ke GitHub
Di VS Code buka panel **Source Control** (ikon cabang di kiri, atau `Ctrl + Shift + G`):
1. Tulis pesan commit, misalnya `Tambah backend + siap deploy Vercel`
2. Klik **Commit** (jika ditanya "stage all changes", pilih **Yes**)
3. Klik **Sync Changes** / **Push**

Folder `data/` dan file `.env` otomatis tidak ikut ter-upload (sudah diatur di `.gitignore`).

### 2. Buat database di Turso
1. Buka https://turso.tech, daftar/login (bisa pakai akun GitHub)
2. Buat database baru, misalnya `brew-beans`. Pilih lokasi Asia yang paling dekat
3. Salin **Database URL** (diawali `libsql://...`)
4. Buat **token** (read & write), lalu salin

### 3. Deploy di Vercel
1. Buka https://vercel.com, **Add New → Project**, lalu pilih repo `brew-beans` dari GitHub
2. **Framework Preset: Other**. Build Command dan Output Directory biarkan kosong
3. Buka **Environment Variables**, lalu isi:
   - `TURSO_DATABASE_URL` = URL dari Turso
   - `TURSO_AUTH_TOKEN` = token dari Turso
   - `ADMIN_USERNAME` = username admin (mis. `admin`)
   - `ADMIN_PASSWORD` = password admin yang **kuat** (wajib, tidak ada password default di Vercel)
4. Klik **Deploy**

Saat pertama dibuka, tabel dan menu awal dibuat otomatis di Turso.

### 4. Cek hasilnya
- Website: `https://nama-project.vercel.app`
- Cek koneksi database: `https://nama-project.vercel.app/api/health` (harus muncul `"ok":true`)
- Admin: `https://nama-project.vercel.app/admin`

Setiap kali Anda push ke GitHub, Vercel otomatis deploy ulang.

### Jika ada masalah
- **"Database belum dikonfigurasi"**: Environment Variables belum diisi. Isi, lalu buka Deployments → ⋯ → **Redeploy**
- **"Akun admin belum dibuat"**: isi `ADMIN_PASSWORD`, lalu Redeploy
- **Lupa password admin**: hapus baris admin di Turso (menu Edit Data / SQL: `DELETE FROM admins;`), lalu Redeploy. Akun dibuat ulang dari `ADMIN_USERNAME`/`ADMIN_PASSWORD`
- Log error bisa dilihat di Vercel → Project → **Logs**

---

## Fitur

**Website (pelanggan)**
- Menu diambil dari database; filter kategori dan pencarian tetap berfungsi
- "Favorite Menu" di beranda = menu yang ditandai *Favorit* oleh admin
- Checkout: nama, nomor WhatsApp, Dine In/Take Away, catatan. Pesanan tersimpan dengan kode unik, lalu pelanggan konfirmasi via WhatsApp
- Harga dihitung ulang di server, jadi tidak bisa dimanipulasi dari browser
- Form kontak tersimpan ke database
- Jika file HTML dibuka tanpa server, website tetap jalan dengan cara lama (langsung WhatsApp/email)

**Dashboard admin**
- Statistik: pendapatan & pesanan hari ini, pesanan aktif, pesan belum dibaca, menu terlaris
- Pesanan: filter status, pencarian, ubah status, tombol chat WhatsApp ke pelanggan, notifikasi pesanan baru
- Menu: tambah, edit, hapus, upload foto (otomatis diperkecil & disimpan di database), tandai habis, tandai favorit
- Pesan kontak: tandai dibaca, balas via email/WhatsApp, hapus
- Ganti password

---

## Struktur folder

```
api/index.js       Pintu masuk backend di Vercel
server/            Kode backend
  app.js           Handler utama (dipakai laptop & Vercel)
  index.js         Server lokal (npm start)
  routes.js        Semua endpoint API
  db.js            Database (lokal / Turso), tabel, data menu awal
  auth.js          Login admin (password di-hash, cookie sesi)
  http.js          Router & penyaji file website (mode laptop)
  config.js        Pengaturan (membaca .env / Environment Variables)
  reset-db.js      Reset database lokal
vercel.json        Pengaturan Vercel
admin.html/.js     Dashboard admin
index.html, menu.html, about.html, contact.html, script.js, css/   Frontend
```

## Pengaturan

Salin `.env.example` menjadi `.env` untuk mengubah port atau akun admin awal di laptop.
Jika `TURSO_DATABASE_URL` diisi di `.env`, laptop juga akan memakai database Turso yang sama dengan website online.

Nomor WhatsApp toko ada di baris atas `script.js` (`WHATSAPP_NUMBER`).

## Daftar API

Publik:
- `GET /api/health` — cek server & database
- `GET /api/products` — daftar menu yang tersedia
- `POST /api/orders` — buat pesanan `{ customer_name, phone, order_type, note, items: [{ id, quantity }] }`
- `GET /api/orders/:code` — cek status pesanan
- `POST /api/messages` — kirim pesan kontak
- `GET /api/images/:id` — foto menu hasil upload

Admin (wajib login):
- `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`, `POST /api/admin/password`
- `GET /api/admin/stats`
- `GET /api/admin/orders?status=&q=`, `PATCH /api/admin/orders/:id`, `DELETE /api/admin/orders/:id`
- `GET/POST /api/admin/products`, `PUT/DELETE /api/admin/products/:id`, `POST /api/admin/upload`
- `GET /api/admin/messages`, `PATCH/DELETE /api/admin/messages/:id`

## Reset database lokal

```bash
npm run reset-db
```
Menghapus semua data di `data/cafe.db` lalu membuat ulang data awal. Database Turso tidak tersentuh.
