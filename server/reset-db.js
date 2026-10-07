/* =========================================
   RESET DATABASE LOKAL
   Menghapus SEMUA data di data/cafe.db (menu, pesanan, pesan, akun admin)
   lalu membuat ulang dengan data awal.
   Jalankan: npm run reset-db

   Catatan: perintah ini TIDAK menyentuh database Turso (online).
========================================= */

const fs = require("fs");

// Paksa mode lokal walaupun .env berisi TURSO_DATABASE_URL
process.env.TURSO_DATABASE_URL = "";
const config = require("./config");
config.TURSO_DATABASE_URL = "";

for (const suffix of ["", "-wal", "-shm"]) {
    const file = config.DB_PATH + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

console.log("[reset] Database lokal dihapus.");

require("./db").init()
    .then(() => console.log("[reset] Database baru siap."))
    .catch((error) => {
        console.error("[reset] Gagal:", error.message);
        process.exit(1);
    });
