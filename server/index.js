/* =========================================
   BREW & BEANS — SERVER LOKAL
   Jalankan: npm start  ->  http://localhost:3000
   (Di Vercel, file yang dipakai adalah api/index.js)
========================================= */

const http = require("http");
const config = require("./config");
const { init } = require("./db");
const { handler } = require("./app");

const server = http.createServer(handler);

init()
    .then(() => {
        server.listen(config.PORT, () => {
            console.log("\n=========================================");
            console.log("  BREW & BEANS berjalan!");
            console.log(`  Website : http://localhost:${config.PORT}`);
            console.log(`  Admin   : http://localhost:${config.PORT}/admin.html`);
            console.log("=========================================\n");
        });
    })
    .catch((error) => {
        console.error("\n[ERROR] Gagal menyiapkan database:", error.message, "\n");
        process.exit(1);
    });

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`\n[ERROR] Port ${config.PORT} sedang dipakai. Tutup aplikasi lain atau ubah PORT di file .env\n`);
        process.exit(1);
    }
    throw error;
});
