/* =========================================
   DATABASE
   Dua mode, kode lain tidak perlu tahu bedanya:
   - LOKAL : file SQLite data/cafe.db (SQLite bawaan Node.js)
   - CLOUD : Turso (SQLite di cloud) lewat HTTP, dipakai di Vercel

   Semua fungsi async:
     await db.get(sql, args)   -> 1 baris / undefined
     await db.all(sql, args)   -> array baris
     await db.run(sql, args)   -> { changes, lastInsertRowid }
     await db.batch([{ sql, args }, ...])  -> dijalankan dalam 1 transaksi
========================================= */

const crypto = require("crypto");
const config = require("./config");


/* =========================================
   DRIVER LOKAL (node:sqlite)
========================================= */

function createLocalDriver() {
    let DatabaseSync;

    try {
        ({ DatabaseSync } = require("node:sqlite"));
    } catch {
        const message =
            "Versi Node.js (" + process.version + ") belum mendukung SQLite bawaan. " +
            "Install Node.js LTS terbaru (minimal 22.13) dari https://nodejs.org, " +
            "atau isi TURSO_DATABASE_URL untuk memakai database cloud.";
        console.error("\n[ERROR] " + message + "\n");
        throw new Error(message);
    }

    const fs = require("fs");
    fs.mkdirSync(config.DATA_DIR, { recursive: true });

    const sqlite = new DatabaseSync(config.DB_PATH);
    sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

    const normalize = (row) => (row ? { ...row } : row);

    function run(sql, args = []) {
        const result = sqlite.prepare(sql).run(...args);
        return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
    }

    return {
        name: "lokal (data/cafe.db)",
        async get(sql, args = []) {
            return normalize(sqlite.prepare(sql).get(...args));
        },
        async all(sql, args = []) {
            return sqlite.prepare(sql).all(...args).map(normalize);
        },
        async run(sql, args = []) {
            return run(sql, args);
        },
        async batch(statements) {
            sqlite.exec("BEGIN");
            try {
                const results = statements.map(s => run(s.sql, s.args));
                sqlite.exec("COMMIT");
                return results;
            } catch (error) {
                sqlite.exec("ROLLBACK");
                throw error;
            }
        }
    };
}


/* =========================================
   DRIVER CLOUD (Turso, lewat HTTP API)
   Dokumentasi: https://docs.turso.tech/sdk/http/reference
========================================= */

function createTursoDriver() {
    const baseUrl = config.TURSO_DATABASE_URL
        .replace(/^libsql:\/\//, "https://")
        .replace(/^wss?:\/\//, "https://")
        .replace(/\/+$/, "");

    function encodeArg(value) {
        if (value === null || value === undefined) return { type: "null" };
        if (typeof value === "boolean") return { type: "integer", value: value ? "1" : "0" };
        if (typeof value === "number") {
            return Number.isInteger(value)
                ? { type: "integer", value: String(value) }
                : { type: "float", value };
        }
        if (typeof value === "bigint") return { type: "integer", value: value.toString() };
        return { type: "text", value: String(value) };
    }

    function decodeValue(cell) {
        switch (cell.type) {
            case "null": return null;
            case "integer": return Number(cell.value);
            case "float": return Number(cell.value);
            case "blob": return Buffer.from(cell.base64, "base64");
            default: return cell.value;
        }
    }

    async function send(requests) {
        const response = await fetch(`${baseUrl}/v2/pipeline`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.TURSO_AUTH_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ requests })
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`Turso HTTP ${response.status}: ${text.slice(0, 300)}`);
        }

        return response.json();
    }

    async function pipeline(statements) {
        const requests = statements.map(s => ({
            type: "execute",
            stmt: { sql: s.sql, args: (s.args || []).map(encodeArg) }
        }));
        requests.push({ type: "close" });

        const data = await send(requests);
        const results = [];

        for (let i = 0; i < statements.length; i++) {
            const item = data.results[i];
            if (!item || item.type !== "ok") {
                throw new Error(`Turso error: ${item?.error?.message || "unknown"} | SQL: ${statements[i].sql.slice(0, 120)}`);
            }

            const result = item.response.result;
            const cols = result.cols.map(c => c.name);

            results.push({
                rows: result.rows.map(row => {
                    const obj = {};
                    row.forEach((cell, index) => { obj[cols[index]] = decodeValue(cell); });
                    return obj;
                }),
                changes: Number(result.affected_row_count || 0),
                lastInsertRowid: result.last_insert_rowid == null ? null : Number(result.last_insert_rowid)
            });
        }

        return results;
    }

    return {
        name: "Turso (cloud)",
        async get(sql, args = []) {
            const [result] = await pipeline([{ sql, args }]);
            return result.rows[0];
        },
        async all(sql, args = []) {
            const [result] = await pipeline([{ sql, args }]);
            return result.rows;
        },
        async run(sql, args = []) {
            const [result] = await pipeline([{ sql, args }]);
            return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
        },
        async batch(statements) {
            // Transaksi: setiap langkah hanya jalan jika langkah sebelumnya sukses.
            // Jika ada yang gagal -> ROLLBACK, tidak ada data setengah jadi.
            const steps = [{ stmt: { sql: "BEGIN" } }];
            statements.forEach((s, i) => {
                steps.push({
                    stmt: { sql: s.sql, args: (s.args || []).map(encodeArg) },
                    condition: { type: "ok", step: i }
                });
            });
            const commitStep = steps.length;
            steps.push({ stmt: { sql: "COMMIT" }, condition: { type: "ok", step: commitStep - 1 } });
            steps.push({ stmt: { sql: "ROLLBACK" }, condition: { type: "not", cond: { type: "ok", step: commitStep } } });

            const data = await send([{ type: "batch", batch: { steps } }, { type: "close" }]);
            const item = data.results[0];
            if (!item || item.type !== "ok") {
                throw new Error(`Turso error: ${item?.error?.message || "unknown"}`);
            }

            const { step_results: results, step_errors: errors } = item.response.result;
            const firstError = errors.find(Boolean);
            if (firstError || !results[commitStep]) {
                throw new Error(`Turso error: ${firstError?.message || "transaksi gagal"}`);
            }

            return results.slice(1, commitStep).map(r => ({
                changes: Number(r.affected_row_count || 0),
                lastInsertRowid: r.last_insert_rowid == null ? null : Number(r.last_insert_rowid)
            }));
        }
    };
}


/* =========================================
   PILIH DRIVER
========================================= */

let driver;

function getDriver() {
    if (driver) return driver;

    if (config.TURSO_DATABASE_URL) {
        if (!config.TURSO_AUTH_TOKEN) throw new Error("TURSO_AUTH_TOKEN belum diisi.");
        driver = createTursoDriver();
    } else if (config.IS_VERCEL) {
        throw new Error(
            "Database belum dikonfigurasi. Isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN " +
            "di Vercel > Settings > Environment Variables, lalu Redeploy."
        );
    } else {
        driver = createLocalDriver();
    }

    return driver;
}

const db = {
    get: (sql, args) => getDriver().get(sql, args),
    all: (sql, args) => getDriver().all(sql, args),
    run: (sql, args) => getDriver().run(sql, args),
    batch: (statements) => getDriver().batch(statements)
};


/* =========================================
   STRUKTUR TABEL
========================================= */

const SCHEMA = [
    `CREATE TABLE IF NOT EXISTS products (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        price       INTEGER NOT NULL,
        category    TEXT    NOT NULL,
        image       TEXT    NOT NULL DEFAULT '',
        tag         TEXT    NOT NULL DEFAULT '',
        featured    INTEGER NOT NULL DEFAULT 0,
        available   INTEGER NOT NULL DEFAULT 1,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        code          TEXT    NOT NULL UNIQUE,
        customer_name TEXT    NOT NULL,
        phone         TEXT    NOT NULL,
        order_type    TEXT    NOT NULL DEFAULT 'takeaway',
        note          TEXT    NOT NULL DEFAULT '',
        total         INTEGER NOT NULL,
        status        TEXT    NOT NULL DEFAULT 'pending',
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE TABLE IF NOT EXISTS order_items (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER,
        name       TEXT    NOT NULL,
        price      INTEGER NOT NULL,
        quantity   INTEGER NOT NULL,
        subtotal   INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        email      TEXT    NOT NULL,
        phone      TEXT    NOT NULL DEFAULT '',
        message    TEXT    NOT NULL,
        is_read    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE TABLE IF NOT EXISTS admins (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE TABLE IF NOT EXISTS images (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        mime       TEXT    NOT NULL,
        data       TEXT    NOT NULL,
        created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status)",
    "CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)",
    "CREATE INDEX IF NOT EXISTS idx_items_order    ON order_items(order_id)"
];


/* =========================================
   DATA AWAL (sesuai menu di website)
========================================= */

const IMG = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=85`;

const SEED_PRODUCTS = [
    { name: "Espresso", description: "Kopi dengan karakter kuat, bold dan aromatik.", price: 25000, category: "coffee", image: IMG("photo-1510591509098-f4fdc6d0ff04"), tag: "BEST SELLER", featured: 1 },
    { name: "Cappuccino", description: "Espresso, susu dan foam yang creamy.", price: 30000, category: "coffee", image: IMG("photo-1572442388796-11668a67e53d"), tag: "", featured: 1 },
    { name: "Cafe Latte", description: "Kopi susu creamy dengan rasa yang lembut.", price: 32000, category: "coffee", image: IMG("photo-1561047029-3000c68339ca"), tag: "", featured: 1 },
    { name: "Americano", description: "Espresso dan air dengan rasa clean dan bold.", price: 27000, category: "coffee", image: IMG("photo-1514432324607-a09d9b4aefdd"), tag: "", featured: 0 },
    { name: "Matcha Latte", description: "Matcha premium dengan susu creamy.", price: 30000, category: "noncoffee", image: IMG("photo-1515823064-d6e0c04616a7"), tag: "", featured: 0 },
    { name: "Chocolate Cake", description: "Cake cokelat lembut dengan rasa rich.", price: 28000, category: "dessert", image: IMG("photo-1578985545062-69928b1d9587"), tag: "", featured: 0 },
    { name: "Croissant", description: "Croissant buttery dengan tekstur renyah.", price: 25000, category: "food", image: IMG("photo-1555507036-ab1f4038808a"), tag: "", featured: 1 },
    { name: "French Fries", description: "Kentang goreng renyah dengan bumbu spesial.", price: 22000, category: "food", image: IMG("photo-1573080496219-bb080dd4f877"), tag: "", featured: 0 }
];


/* =========================================
   INISIALISASI (sekali per proses / cold start)
========================================= */

let initPromise;

function init() {
    if (!initPromise) {
        initPromise = doInit().catch(error => {
            initPromise = null; // coba lagi di request berikutnya
            throw error;
        });
    }
    return initPromise;
}

async function doInit() {
    const { hashPassword } = require("./auth");

    await db.batch(SCHEMA.map(sql => ({ sql })));

    // Kunci rahasia sesi login, disimpan di database agar sama di semua server
    await db.run(
        "INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)",
        [crypto.randomBytes(48).toString("hex")]
    );

    const { n: productCount } = await db.get("SELECT COUNT(*) AS n FROM products");
    if (productCount === 0) {
        await db.batch(SEED_PRODUCTS.map((p, i) => ({
            sql: `INSERT INTO products (name, description, price, category, image, tag, featured, sort_order)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [p.name, p.description, p.price, p.category, p.image, p.tag, p.featured, i + 1]
        })));
        console.log(`[db] ${SEED_PRODUCTS.length} menu awal ditambahkan.`);
    }

    const { n: adminCount } = await db.get("SELECT COUNT(*) AS n FROM admins");
    if (adminCount === 0) {
        if (config.ADMIN_PASSWORD) {
            await db.run(
                "INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)",
                [config.ADMIN_USERNAME, hashPassword(config.ADMIN_PASSWORD)]
            );
            console.log(`[db] Akun admin dibuat -> username: ${config.ADMIN_USERNAME}`);
            if (!config.IS_VERCEL) {
                console.log(`[db] Password awal: ${config.ADMIN_PASSWORD} (segera ganti di menu Akun)`);
            }
        } else {
            console.warn("[db] ADMIN_PASSWORD belum diisi, akun admin belum dibuat.");
        }
    }

    console.log(`[db] Database siap: ${getDriver().name}`);
}

module.exports = { db, init };
