/* =========================================
   KONFIGURASI
   Membaca file .env (jika ada) tanpa library tambahan.
   Di Vercel, nilai diambil dari Environment Variables.
========================================= */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");

function loadEnvFile() {
    const envPath = path.join(ROOT_DIR, ".env");
    if (!fs.existsSync(envPath)) return;

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const index = trimmed.indexOf("=");
        if (index === -1) continue;

        const key = trimmed.slice(0, index).trim();
        let value = trimmed.slice(index + 1).trim();
        value = value.replace(/^["']|["']$/g, "");

        if (process.env[key] === undefined) process.env[key] = value;
    }
}

loadEnvFile();

const IS_VERCEL = Boolean(process.env.VERCEL);

module.exports = {
    ROOT_DIR,
    DATA_DIR,
    DB_PATH: path.join(DATA_DIR, "cafe.db"),
    PORT: Number(process.env.PORT) || 3000,

    IS_VERCEL,

    // Database cloud (Turso). Jika kosong -> pakai file SQLite lokal.
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || "",
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || "",

    // Akun admin awal (dipakai hanya saat database pertama kali dibuat)
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || (IS_VERCEL ? "" : "admin123"),

    SESSION_HOURS: 12
};
