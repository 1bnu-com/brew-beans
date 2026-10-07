/* =========================================
   HANDLER UTAMA
   Dipakai oleh:
   - server/index.js  (laptop / VPS:  npm start)
   - api/index.js     (Vercel)
========================================= */

const { init } = require("./db");
const router = require("./routes");
const { HttpError, sendJson, serveStatic } = require("./http");

const SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin"
};

function clientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();
    return req.socket?.remoteAddress || "unknown";
}

async function handleApi(req, res, url, pathname) {
    const startedAt = Date.now();

    try {
        const found = router.match(req.method, pathname);
        if (!found) throw new HttpError(404, "Endpoint tidak ditemukan.");
        if (found.methodNotAllowed) throw new HttpError(405, "Metode tidak diizinkan.");

        await init(); // buat tabel & data awal (sekali per proses)

        const ctx = { req, res, params: found.params, query: url.searchParams, ip: clientIp(req) };
        let result;

        for (const handler of found.route.handlers) {
            result = await handler(ctx);
        }

        if (res.writableEnded) {
            // response sudah dikirim langsung oleh handler (mis. gambar)
        } else if (result && Object.prototype.hasOwnProperty.call(result, "body")) {
            sendJson(res, result.status || 200, result.body, result.headers);
        } else {
            sendJson(res, 200, result ?? { ok: true });
        }
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        if (status === 500) console.error("[error]", error);

        if (!res.headersSent) {
            sendJson(res, status, {
                error: status === 500
                    ? (/Database belum dikonfigurasi|TURSO_AUTH_TOKEN|Node\.js/.test(error.message)
                        ? error.message
                        : "Terjadi kesalahan pada server.")
                    : error.message
            });
        } else {
            res.end();
        }
    }

    if (!process.env.VERCEL) {
        console.log(`${req.method} ${pathname} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
    }
}

async function handler(req, res) {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(key, value);
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    // Vercel: rewrite /api/xxx -> /api/index?__path=xxx
    const rewrittenPath = url.searchParams.get("__path");
    if (rewrittenPath !== null) url.searchParams.delete("__path");

    let pathname;
    try {
        pathname = rewrittenPath !== null
            ? "/api/" + rewrittenPath.replace(/^\/+/, "")
            : decodeURIComponent(url.pathname);
    } catch {
        return sendJson(res, 400, { error: "URL tidak valid." });
    }

    if (pathname.startsWith("/api/")) {
        return handleApi(req, res, url, pathname);
    }

    // File website (hanya untuk mode laptop; di Vercel file statis dilayani Vercel)
    if ((req.method === "GET" || req.method === "HEAD") && serveStatic(req, res, pathname)) {
        return;
    }

    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><meta charset="utf-8"><title>404</title>
        <body style="font-family:sans-serif;text-align:center;padding:4rem">
        <h1>404</h1><p>Halaman tidak ditemukan.</p><a href="/">Kembali ke beranda</a></body>`);
}

module.exports = { handler };
