/* =========================================
   HELPER HTTP: router sederhana, body JSON,
   response JSON, dan penyaji file statis.
========================================= */

const fs = require("fs");
const path = require("path");
const config = require("./config");

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}


/* ---------- ROUTER ---------- */

function createRouter() {
    const routes = [];

    function add(method, pattern, ...handlers) {
        const keys = [];
        const regex = new RegExp(
            "^" + pattern.replace(/:(\w+)/g, (_, key) => {
                keys.push(key);
                return "([^/]+)";
            }) + "/?$"
        );
        routes.push({ method, regex, keys, handlers });
    }

    function match(method, pathname) {
        let pathMatched = false;

        for (const route of routes) {
            const result = route.regex.exec(pathname);
            if (!result) continue;
            pathMatched = true;
            if (route.method !== method) continue;

            const params = {};
            route.keys.forEach((key, i) => {
                params[key] = decodeURIComponent(result[i + 1]);
            });
            return { route, params };
        }

        return pathMatched ? { methodNotAllowed: true } : null;
    }

    return {
        get: (p, ...h) => add("GET", p, ...h),
        post: (p, ...h) => add("POST", p, ...h),
        put: (p, ...h) => add("PUT", p, ...h),
        patch: (p, ...h) => add("PATCH", p, ...h),
        delete: (p, ...h) => add("DELETE", p, ...h),
        match
    };
}


/* ---------- REQUEST BODY ---------- */

function readJsonBody(req, limitBytes = 1024 * 1024) {
    // Di Vercel, body sudah dibaca otomatis ke req.body
    if (Object.prototype.hasOwnProperty.call(req, "body") || "body" in req) {
        try {
            const body = req.body;
            if (body === undefined || body === null || body === "") return Promise.resolve({});
            if (Buffer.isBuffer(body)) return Promise.resolve(JSON.parse(body.toString("utf8")));
            if (typeof body === "string") return Promise.resolve(JSON.parse(body));
            return Promise.resolve(body);
        } catch {
            return Promise.reject(new HttpError(400, "Format JSON tidak valid."));
        }
    }

    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];

        req.on("data", chunk => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new HttpError(413, "Ukuran data terlalu besar."));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on("end", () => {
            if (chunks.length === 0) return resolve({});
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch {
                reject(new HttpError(400, "Format JSON tidak valid."));
            }
        });

        req.on("error", reject);
    });
}


/* ---------- RESPONSE ---------- */

function sendJson(res, status, data, headers = {}) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": Buffer.byteLength(body),
        ...headers
    });
    res.end(body);
}


/* ---------- FILE STATIS ---------- */

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".woff2": "font/woff2"
};

// Folder/file yang TIDAK boleh diakses dari browser
const BLOCKED_PREFIXES = ["/server", "/data", "/node_modules", "/api"];
const BLOCKED_FILES = ["/package.json", "/package-lock.json", "/readme.md", "/vercel.json"];

function serveStatic(req, res, pathname) {
    if (pathname === "/") pathname = "/index.html";
    if (pathname === "/admin") pathname = "/admin.html";

    const lower = pathname.toLowerCase();
    const segments = lower.split("/");

    if (
        segments.some(s => s.startsWith(".")) ||
        BLOCKED_PREFIXES.some(p => lower === p || lower.startsWith(p + "/")) ||
        BLOCKED_FILES.includes(lower)
    ) {
        return false;
    }

    const ext = path.extname(lower);
    if (!MIME[ext]) return false;

    const filePath = path.resolve(config.ROOT_DIR, "." + pathname);
    if (!filePath.startsWith(config.ROOT_DIR + path.sep)) return false;

    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch {
        return false;
    }
    if (!stat.isFile()) return false;

    res.writeHead(200, {
        "Content-Type": MIME[ext],
        "Content-Length": stat.size,
        "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300"
    });

    if (req.method === "HEAD") {
        res.end();
    } else {
        fs.createReadStream(filePath).pipe(res);
    }
    return true;
}

module.exports = { HttpError, createRouter, readJsonBody, sendJson, serveStatic };
