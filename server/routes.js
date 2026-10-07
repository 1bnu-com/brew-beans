/* =========================================
   SEMUA ENDPOINT API
========================================= */

const crypto = require("crypto");
const { db } = require("./db");
const auth = require("./auth");
const { HttpError, createRouter, readJsonBody } = require("./http");

const router = createRouter();

const CATEGORIES = ["coffee", "noncoffee", "food", "dessert"];
const ORDER_TYPES = ["dinein", "takeaway"];
const ORDER_STATUSES = ["pending", "processing", "ready", "completed", "cancelled"];
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";


/* =========================================
   HELPER VALIDASI
========================================= */

function text(value, field, { required = true, max = 255 } = {}) {
    const result = String(value ?? "").trim();
    if (required && !result) throw new HttpError(400, `${field} wajib diisi.`);
    if (result.length > max) throw new HttpError(400, `${field} maksimal ${max} karakter.`);
    return result;
}

function integer(value, field, { min = 0, max = 100000000 } = {}) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
        throw new HttpError(400, `${field} harus berupa angka bulat ${min} - ${max}.`);
    }
    return number;
}

function phoneNumber(value) {
    const phone = text(value, "Nomor WhatsApp", { max: 20 }).replace(/[\s-]/g, "");
    if (!/^\+?\d{8,15}$/.test(phone)) throw new HttpError(400, "Nomor WhatsApp tidak valid.");
    return phone;
}

function emailAddress(value) {
    const email = text(value, "Email", { max: 120 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Format email tidak valid.");
    return email;
}

function imageUrl(value) {
    const url = text(value, "Gambar", { required: false, max: 500 });
    if (url && !/^(https?:\/\/|\/?images\/|\/api\/images\/\d+$)/i.test(url)) {
        throw new HttpError(400, "Gambar harus berupa URL http(s), path images/..., atau hasil upload.");
    }
    return url;
}

function bool(value) {
    return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

function formatProduct(row) {
    return {
        ...row,
        featured: Boolean(row.featured),
        available: Boolean(row.available)
    };
}

async function requireAdmin(ctx) {
    const session = await auth.getSession(ctx.req);
    if (!session) throw new HttpError(401, "Silakan login terlebih dahulu.");

    const admin = await db.get("SELECT id, username FROM admins WHERE id = ?", [session.id]);
    if (!admin) throw new HttpError(401, "Sesi tidak valid. Silakan login ulang.");

    ctx.admin = admin;
}

function generateOrderCode() {
    const date = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(2, 10).replace(/-/g, "");
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `BB-${date}-${random}`;
}


/* =========================================
   PUBLIK
========================================= */

router.get("/api/health", async () => {
    await db.get("SELECT 1 AS ok");
    return { ok: true, time: new Date().toISOString() };
});


// Daftar menu yang tersedia
router.get("/api/products", async ({ query }) => {
    const args = [];
    let sql = "SELECT * FROM products WHERE available = 1";

    if (query.get("category")) {
        sql += " AND category = ?";
        args.push(query.get("category"));
    }
    if (query.get("featured") === "1") {
        sql += " AND featured = 1";
    }

    sql += " ORDER BY sort_order ASC, id ASC";

    return { products: (await db.all(sql, args)).map(formatProduct) };
});


// Buat pesanan baru dari keranjang
router.post("/api/orders", async ({ req }) => {
    const body = await readJsonBody(req);

    const customerName = text(body.customer_name, "Nama", { max: 80 });
    const phone = phoneNumber(body.phone);
    const orderType = ORDER_TYPES.includes(body.order_type) ? body.order_type : "takeaway";
    const note = text(body.note, "Catatan", { required: false, max: 500 });

    if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new HttpError(400, "Keranjang masih kosong.");
    }
    if (body.items.length > 50) {
        throw new HttpError(400, "Terlalu banyak jenis item dalam satu pesanan.");
    }

    const merged = new Map();
    for (const item of body.items) {
        const id = integer(item.id, "ID produk", { min: 1 });
        const qty = integer(item.quantity, "Jumlah", { min: 1, max: 99 });
        merged.set(id, (merged.get(id) || 0) + qty);
    }

    // Harga SELALU diambil dari database, bukan dari browser
    const ids = [...merged.keys()];
    const products = await db.all(
        `SELECT * FROM products WHERE id IN (${ids.map(() => "?").join(",")})`,
        ids
    );
    const byId = new Map(products.map(p => [p.id, p]));

    const lines = [];
    for (const [id, quantity] of merged) {
        const product = byId.get(id);
        if (!product || !product.available) {
            throw new HttpError(409, `Menu dengan ID ${id} sudah tidak tersedia. Silakan perbarui keranjang.`);
        }
        lines.push({
            product_id: product.id,
            name: product.name,
            price: product.price,
            quantity,
            subtotal: product.price * quantity
        });
    }

    const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
    let code;

    // Simpan pesanan + item dalam satu transaksi (ulang jika kode kebetulan kembar)
    for (let attempt = 1; ; attempt++) {
        code = generateOrderCode();
        try {
            await saveOrder(code);
            break;
        } catch (error) {
            if (attempt >= 3 || !/UNIQUE/i.test(error.message)) throw error;
        }
    }

    function saveOrder(code) {
        return db.batch([
            {
                sql: `INSERT INTO orders (code, customer_name, phone, order_type, note, total)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [code, customerName, phone, orderType, note, total]
            },
            ...lines.map(line => ({
                sql: `INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal)
                      VALUES ((SELECT id FROM orders WHERE code = ?), ?, ?, ?, ?, ?)`,
                args: [code, line.product_id, line.name, line.price, line.quantity, line.subtotal]
            }))
        ]);
    }

    return {
        status: 201,
        body: {
            order: {
                code,
                customer_name: customerName,
                order_type: orderType,
                note,
                total,
                status: "pending",
                items: lines
            }
        }
    };
});


// Cek status pesanan berdasarkan kode
router.get("/api/orders/:code", async ({ params }) => {
    const order = await db.get(
        `SELECT id, code, customer_name, order_type, total, status, created_at
         FROM orders WHERE code = ?`,
        [params.code.toUpperCase()]
    );

    if (!order) throw new HttpError(404, "Pesanan tidak ditemukan.");

    const items = await db.all(
        "SELECT name, price, quantity, subtotal FROM order_items WHERE order_id = ?",
        [order.id]
    );
    delete order.id;

    return { order: { ...order, items } };
});


// Form kontak
router.post("/api/messages", async ({ req }) => {
    const body = await readJsonBody(req);

    const name = text(body.name, "Nama", { max: 80 });
    const email = emailAddress(body.email);
    const phone = text(body.phone, "Nomor WhatsApp", { required: false, max: 20 });
    const message = text(body.message, "Pesan", { max: 2000 });

    await db.run(
        "INSERT INTO messages (name, email, phone, message) VALUES (?, ?, ?, ?)",
        [name, email, phone, message]
    );

    return { status: 201, body: { ok: true } };
});


// Foto menu yang di-upload admin (disimpan di database)
router.get("/api/images/:id", async ({ params, res }) => {
    const id = integer(params.id, "ID gambar", { min: 1 });
    const image = await db.get("SELECT mime, data FROM images WHERE id = ?", [id]);
    if (!image) throw new HttpError(404, "Gambar tidak ditemukan.");

    const buffer = Buffer.from(image.data, "base64");
    res.writeHead(200, {
        "Content-Type": image.mime,
        "Content-Length": buffer.length,
        "Cache-Control": "public, max-age=31536000, immutable"
    });
    res.end(buffer);
    return { handled: true };
});


/* =========================================
   ADMIN — LOGIN
========================================= */

router.post("/api/admin/login", async ({ req, ip }) => {
    if (auth.isLoginBlocked(ip)) {
        throw new HttpError(429, `Terlalu banyak percobaan. Coba lagi dalam ${auth.LOCK_MINUTES} menit.`);
    }

    const body = await readJsonBody(req);
    const username = text(body.username, "Username", { max: 60 });
    const password = text(body.password, "Password", { max: 200 });

    const { n: adminCount } = await db.get("SELECT COUNT(*) AS n FROM admins");
    if (adminCount === 0) {
        throw new HttpError(503, "Akun admin belum dibuat. Isi ADMIN_PASSWORD di Environment Variables lalu Redeploy.");
    }

    const admin = await db.get("SELECT * FROM admins WHERE username = ?", [username]);

    if (!admin || !auth.verifyPassword(password, admin.password_hash)) {
        auth.recordLoginFailure(ip);
        throw new HttpError(401, "Username atau password salah.");
    }

    auth.clearLoginFailures(ip);

    return {
        body: { admin: { id: admin.id, username: admin.username } },
        headers: { "Set-Cookie": auth.sessionCookie(req, await auth.createToken(admin)) }
    };
});

router.post("/api/admin/logout", ({ req }) => ({
    body: { ok: true },
    headers: { "Set-Cookie": auth.clearCookie(req) }
}));

router.get("/api/admin/me", requireAdmin, ({ admin }) => ({ admin }));

router.post("/api/admin/password", requireAdmin, async ({ req, admin }) => {
    const body = await readJsonBody(req);
    const current = text(body.current_password, "Password lama", { max: 200 });
    const next = text(body.new_password, "Password baru", { max: 200 });

    if (next.length < 8) throw new HttpError(400, "Password baru minimal 8 karakter.");

    const row = await db.get("SELECT password_hash FROM admins WHERE id = ?", [admin.id]);
    if (!auth.verifyPassword(current, row.password_hash)) {
        throw new HttpError(400, "Password lama salah.");
    }

    await db.run("UPDATE admins SET password_hash = ? WHERE id = ?", [auth.hashPassword(next), admin.id]);
    return { ok: true };
});


/* =========================================
   ADMIN — DASHBOARD
========================================= */

router.get("/api/admin/stats", requireAdmin, async () => {
    // Batas "hari ini" memakai zona waktu WIB (UTC+7)
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    const startToday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 7 * 3600 * 1000
    ).toISOString();

    const [today, completed, active, unread, topProducts, recentOrders] = await Promise.all([
        db.get(
            `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
             FROM orders WHERE created_at >= ? AND status != 'cancelled'`,
            [startToday]
        ),
        db.get(
            `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
             FROM orders WHERE status = 'completed'`
        ),
        db.get("SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending', 'processing', 'ready')"),
        db.get("SELECT COUNT(*) AS n FROM messages WHERE is_read = 0"),
        db.all(
            `SELECT oi.name, SUM(oi.quantity) AS quantity, SUM(oi.subtotal) AS revenue
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.status != 'cancelled'
             GROUP BY oi.name ORDER BY quantity DESC LIMIT 5`
        ),
        db.all(
            `SELECT id, code, customer_name, total, status, created_at
             FROM orders ORDER BY id DESC LIMIT 5`
        )
    ]);

    return {
        today,
        completed,
        active_orders: active.n,
        unread_messages: unread.n,
        top_products: topProducts,
        recent_orders: recentOrders
    };
});


/* =========================================
   ADMIN — PESANAN
========================================= */

router.get("/api/admin/orders", requireAdmin, async ({ query }) => {
    const where = [];
    const args = [];

    const status = query.get("status");
    if (status && ORDER_STATUSES.includes(status)) {
        where.push("status = ?");
        args.push(status);
    }
    if (status === "active") {
        where.push("status IN ('pending', 'processing', 'ready')");
    }

    const search = (query.get("q") || "").trim();
    if (search) {
        where.push("(code LIKE ? OR customer_name LIKE ? OR phone LIKE ?)");
        args.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const limit = Math.min(Math.max(Number(query.get("limit")) || 100, 1), 500);

    const orders = await db.all(
        `SELECT * FROM orders
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY id DESC LIMIT ${limit}`,
        args
    );

    if (orders.length === 0) return { orders: [] };

    // Ambil semua item sekaligus (1 query, bukan 1 query per pesanan)
    const ids = orders.map(o => o.id);
    const items = await db.all(
        `SELECT order_id, name, price, quantity, subtotal FROM order_items
         WHERE order_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`,
        ids
    );

    const grouped = new Map(ids.map(id => [id, []]));
    items.forEach(({ order_id, ...item }) => grouped.get(order_id)?.push(item));

    return { orders: orders.map(o => ({ ...o, items: grouped.get(o.id) })) };
});

router.patch("/api/admin/orders/:id", requireAdmin, async ({ req, params }) => {
    const body = await readJsonBody(req);
    const id = integer(params.id, "ID pesanan", { min: 1 });

    if (!ORDER_STATUSES.includes(body.status)) {
        throw new HttpError(400, "Status tidak valid.");
    }

    const result = await db.run(
        `UPDATE orders SET status = ?, updated_at = ${NOW_SQL} WHERE id = ?`,
        [body.status, id]
    );
    if (result.changes === 0) throw new HttpError(404, "Pesanan tidak ditemukan.");

    return { order: await db.get("SELECT * FROM orders WHERE id = ?", [id]) };
});

router.delete("/api/admin/orders/:id", requireAdmin, async ({ params }) => {
    const id = integer(params.id, "ID pesanan", { min: 1 });
    const [, result] = await db.batch([
        { sql: "DELETE FROM order_items WHERE order_id = ?", args: [id] },
        { sql: "DELETE FROM orders WHERE id = ?", args: [id] }
    ]);
    if (result.changes === 0) throw new HttpError(404, "Pesanan tidak ditemukan.");
    return { ok: true };
});


/* =========================================
   ADMIN — MENU / PRODUK
========================================= */

function readProductInput(body) {
    const category = String(body.category || "");
    if (!CATEGORIES.includes(category)) throw new HttpError(400, "Kategori tidak valid.");

    return {
        name: text(body.name, "Nama menu", { max: 80 }),
        description: text(body.description, "Deskripsi", { required: false, max: 300 }),
        price: integer(body.price, "Harga", { min: 0, max: 10000000 }),
        category,
        image: imageUrl(body.image),
        tag: text(body.tag, "Label", { required: false, max: 30 }).toUpperCase(),
        featured: bool(body.featured),
        available: body.available === undefined ? 1 : bool(body.available),
        sort_order: body.sort_order === undefined || body.sort_order === ""
            ? 0
            : integer(body.sort_order, "Urutan", { min: 0, max: 9999 })
    };
}

function uploadedImageId(url) {
    const match = /^\/api\/images\/(\d+)$/.exec(url || "");
    return match ? Number(match[1]) : null;
}

async function deleteImageIfUnused(url) {
    const id = uploadedImageId(url);
    if (!id) return;
    const used = await db.get("SELECT 1 AS used FROM products WHERE image = ? LIMIT 1", [url]);
    if (!used) await db.run("DELETE FROM images WHERE id = ?", [id]);
}

router.get("/api/admin/products", requireAdmin, async () => ({
    products: (await db.all("SELECT * FROM products ORDER BY sort_order ASC, id ASC")).map(formatProduct)
}));

router.post("/api/admin/products", requireAdmin, async ({ req }) => {
    const p = readProductInput(await readJsonBody(req));

    const { lastInsertRowid } = await db.run(
        `INSERT INTO products (name, description, price, category, image, tag, featured, available, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.name, p.description, p.price, p.category, p.image, p.tag, p.featured, p.available, p.sort_order]
    );

    return {
        status: 201,
        body: { product: formatProduct(await db.get("SELECT * FROM products WHERE id = ?", [lastInsertRowid])) }
    };
});

router.put("/api/admin/products/:id", requireAdmin, async ({ req, params }) => {
    const id = integer(params.id, "ID menu", { min: 1 });
    const p = readProductInput(await readJsonBody(req));

    const old = await db.get("SELECT image FROM products WHERE id = ?", [id]);
    if (!old) throw new HttpError(404, "Menu tidak ditemukan.");

    await db.run(
        `UPDATE products SET
            name = ?, description = ?, price = ?, category = ?, image = ?, tag = ?,
            featured = ?, available = ?, sort_order = ?, updated_at = ${NOW_SQL}
         WHERE id = ?`,
        [p.name, p.description, p.price, p.category, p.image, p.tag, p.featured, p.available, p.sort_order, id]
    );

    if (old.image !== p.image) await deleteImageIfUnused(old.image);

    return { product: formatProduct(await db.get("SELECT * FROM products WHERE id = ?", [id])) };
});

router.delete("/api/admin/products/:id", requireAdmin, async ({ params }) => {
    const id = integer(params.id, "ID menu", { min: 1 });
    const product = await db.get("SELECT image FROM products WHERE id = ?", [id]);
    if (!product) throw new HttpError(404, "Menu tidak ditemukan.");

    await db.run("DELETE FROM products WHERE id = ?", [id]);
    await deleteImageIfUnused(product.image);

    return { ok: true };
});


// Upload foto menu (data URL base64; sudah diperkecil di browser)
const MAX_UPLOAD_BYTES = 1.5 * 1024 * 1024;

router.post("/api/admin/upload", requireAdmin, async ({ req }) => {
    const body = await readJsonBody(req, 3 * 1024 * 1024);
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ""));

    if (!match) throw new HttpError(400, "File harus berupa gambar JPG, PNG, atau WEBP.");

    const size = Buffer.byteLength(match[2], "base64");
    if (size > MAX_UPLOAD_BYTES) throw new HttpError(413, "Ukuran gambar terlalu besar (maks. 1,5 MB setelah diperkecil).");

    const { lastInsertRowid } = await db.run(
        "INSERT INTO images (mime, data) VALUES (?, ?)",
        [match[1], match[2]]
    );

    return { status: 201, body: { url: `/api/images/${lastInsertRowid}` } };
});


/* =========================================
   ADMIN — PESAN KONTAK
========================================= */

router.get("/api/admin/messages", requireAdmin, async () => ({
    messages: await db.all("SELECT * FROM messages ORDER BY id DESC LIMIT 300")
}));

router.patch("/api/admin/messages/:id", requireAdmin, async ({ req, params }) => {
    const body = await readJsonBody(req);
    const id = integer(params.id, "ID pesan", { min: 1 });
    const result = await db.run("UPDATE messages SET is_read = ? WHERE id = ?", [bool(body.is_read), id]);
    if (result.changes === 0) throw new HttpError(404, "Pesan tidak ditemukan.");
    return { ok: true };
});

router.delete("/api/admin/messages/:id", requireAdmin, async ({ params }) => {
    const id = integer(params.id, "ID pesan", { min: 1 });
    const result = await db.run("DELETE FROM messages WHERE id = ?", [id]);
    if (result.changes === 0) throw new HttpError(404, "Pesan tidak ditemukan.");
    return { ok: true };
});

module.exports = router;
