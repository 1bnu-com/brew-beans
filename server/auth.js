/* =========================================
   AUTENTIKASI ADMIN
   - Password di-hash dengan scrypt (bawaan Node.js)
   - Sesi berupa token bertanda tangan HMAC di cookie HttpOnly
   - Kunci rahasia disimpan di tabel settings
========================================= */

const crypto = require("crypto");
const config = require("./config");


/* ---------- SECRET KEY ---------- */

let secretCache;

async function getSecret() {
    if (secretCache) return secretCache;
    const { db } = require("./db");
    const row = await db.get("SELECT value FROM settings WHERE key = 'session_secret'");
    if (!row) throw new Error("session_secret belum ada di database.");
    secretCache = row.value;
    return secretCache;
}


/* ---------- PASSWORD ---------- */

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = String(stored).split(":");
    if (!salt || !hash) return false;

    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, "hex");

    return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}


/* ---------- TOKEN SESI ---------- */

function sign(data, secret) {
    return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

async function createToken(admin) {
    const payload = Buffer.from(JSON.stringify({
        id: admin.id,
        username: admin.username,
        exp: Date.now() + config.SESSION_HOURS * 60 * 60 * 1000
    })).toString("base64url");

    return `${payload}.${sign(payload, await getSecret())}`;
}

async function verifyToken(token) {
    if (!token || !token.includes(".")) return null;

    const [payload, signature] = token.split(".");
    const expected = sign(payload, await getSecret());

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (!data.exp || data.exp < Date.now()) return null;
        return data;
    } catch {
        return null;
    }
}


/* ---------- COOKIE ---------- */

const COOKIE_NAME = "bb_admin";

function parseCookies(header = "") {
    const cookies = {};
    header.split(";").forEach(part => {
        const index = part.indexOf("=");
        if (index === -1) return;
        try {
            cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
        } catch { /* cookie rusak, abaikan */ }
    });
    return cookies;
}

function isHttps(req) {
    return req.headers["x-forwarded-proto"] === "https" || Boolean(req.socket?.encrypted);
}

function sessionCookie(req, token) {
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        `Max-Age=${config.SESSION_HOURS * 60 * 60}`
    ];
    if (isHttps(req)) parts.push("Secure");
    return parts.join("; ");
}

function clearCookie(req) {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isHttps(req) ? "; Secure" : ""}`;
}

async function getSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    return verifyToken(cookies[COOKIE_NAME]);
}


/* ---------- BATAS PERCOBAAN LOGIN ---------- */

const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 10;

function isLoginBlocked(ip) {
    const record = loginAttempts.get(ip);
    if (!record) return false;
    if (record.lockedUntil && record.lockedUntil > Date.now()) return true;
    if (record.lockedUntil && record.lockedUntil <= Date.now()) loginAttempts.delete(ip);
    return false;
}

function recordLoginFailure(ip) {
    const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    record.count++;
    if (record.count >= MAX_ATTEMPTS) {
        record.lockedUntil = Date.now() + LOCK_MINUTES * 60 * 1000;
        record.count = 0;
    }
    loginAttempts.set(ip, record);
}

function clearLoginFailures(ip) {
    loginAttempts.delete(ip);
}

module.exports = {
    hashPassword,
    verifyPassword,
    createToken,
    getSession,
    sessionCookie,
    clearCookie,
    isLoginBlocked,
    recordLoginFailure,
    clearLoginFailures,
    LOCK_MINUTES
};
