/* =========================================
   ENTRY POINT VERCEL
   Semua request /api/* diarahkan ke sini oleh vercel.json.
========================================= */

const { handler } = require("../server/app");

module.exports = handler;
