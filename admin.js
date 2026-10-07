/* =========================================
   BREW & BEANS — ADMIN PANEL
========================================= */

const STATUS = {
    pending: { label: "Baru", next: "processing", nextLabel: "Proses" },
    processing: { label: "Diproses", next: "ready", nextLabel: "Tandai siap" },
    ready: { label: "Siap", next: "completed", nextLabel: "Selesai" },
    completed: { label: "Selesai" },
    cancelled: { label: "Dibatalkan" }
};

const CATEGORY_LABELS = {
    coffee: "Coffee",
    noncoffee: "Non Coffee",
    food: "Food",
    dessert: "Dessert"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
    view: "dashboard",
    orderStatus: "active",
    orderSearch: "",
    products: [],
    knownOrderIds: null
};


/* =========================================
   HELPER
========================================= */

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    let data = {};
    try { data = await response.json(); } catch { /* bukan JSON */ }

    if (response.status === 401 && !path.endsWith("/login")) {
        showLogin();
    }

    if (!response.ok) throw new Error(data.error || "Terjadi kesalahan.");
    return data;
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function rupiah(number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(number || 0);
}

function formatDate(iso) {
    return new Intl.DateTimeFormat("id-ID", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
    }).format(new Date(iso));
}

function waLink(phone, text = "") {
    let number = String(phone).replace(/\D/g, "");
    if (number.startsWith("0")) number = "62" + number.slice(1);
    return `https://wa.me/${number}${text ? "?text=" + encodeURIComponent(text) : ""}`;
}

let toastTimer;
function toast(message, isError = false) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.toggle("error", isError);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

function statusBadge(status) {
    return `<span class="status status-${status}">${STATUS[status]?.label || status}</span>`;
}

function emptyState(icon, text) {
    return `<div class="empty"><i class="fa-solid ${icon}"></i><p>${text}</p></div>`;
}


/* =========================================
   LOGIN / LOGOUT
========================================= */

function showLogin() {
    $("#app").hidden = true;
    $("#loginScreen").hidden = false;
    stopPolling();
}

function showApp(admin) {
    $("#loginScreen").hidden = true;
    $("#app").hidden = false;
    $("#adminName").textContent = admin.username;
    switchView(state.view);
    startPolling();
}

$("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const error = $("#loginError");
    error.textContent = "";

    try {
        const { admin } = await api("/api/admin/login", {
            method: "POST",
            body: { username: form.username.value.trim(), password: form.password.value }
        });
        form.reset();
        showApp(admin);
    } catch (err) {
        error.textContent = err.message;
    }
});

$("#logoutBtn").addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    state.knownOrderIds = null;
    showLogin();
});


/* =========================================
   NAVIGASI
========================================= */

function switchView(view) {
    state.view = view;

    $$("#sideNav button").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
    $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));

    loadView(view);
}

function loadView(view) {
    if (view === "dashboard") loadDashboard();
    if (view === "orders") loadOrders();
    if (view === "products") loadProducts();
    if (view === "messages") loadMessages();
}

$("#sideNav").addEventListener("click", (e) => {
    const button = e.target.closest("button[data-view]");
    if (button) switchView(button.dataset.view);
});

document.addEventListener("click", (e) => {
    if (e.target.closest("[data-refresh]")) loadView(state.view);

    const goto = e.target.closest("[data-goto]");
    if (goto) switchView(goto.dataset.goto);
});


/* =========================================
   DASHBOARD
========================================= */

async function loadDashboard() {
    try {
        const stats = await api("/api/admin/stats");

        $("#statRevenueToday").textContent = rupiah(stats.today.revenue);
        $("#statOrdersToday").textContent = stats.today.orders;
        $("#statActive").textContent = stats.active_orders;
        $("#statUnread").textContent = stats.unread_messages;
        $("#statRevenueAll").textContent = rupiah(stats.completed.revenue);

        updateBadges(stats.active_orders, stats.unread_messages);

        $("#recentOrders").innerHTML = stats.recent_orders.length
            ? stats.recent_orders.map(o => `
                <button class="list-row" data-goto="orders">
                    <span><b>${escapeHTML(o.code)}</b><small>${escapeHTML(o.customer_name)} · ${formatDate(o.created_at)}</small></span>
                    <span class="right">${rupiah(o.total)} ${statusBadge(o.status)}</span>
                </button>`).join("")
            : emptyState("fa-receipt", "Belum ada pesanan.");

        $("#topProducts").innerHTML = stats.top_products.length
            ? stats.top_products.map((p, i) => `
                <div class="list-row">
                    <span><b>${i + 1}. ${escapeHTML(p.name)}</b><small>${rupiah(p.revenue)}</small></span>
                    <span class="right">${p.quantity} terjual</span>
                </div>`).join("")
            : emptyState("fa-mug-hot", "Belum ada penjualan.");
    } catch (err) {
        toast(err.message, true);
    }
}

function updateBadges(activeOrders, unreadMessages) {
    const ob = $("#ordersBadge");
    ob.hidden = !activeOrders;
    ob.textContent = activeOrders;

    const mb = $("#messagesBadge");
    mb.hidden = !unreadMessages;
    mb.textContent = unreadMessages;

    document.title = (activeOrders ? `(${activeOrders}) ` : "") + "Admin — Brew & Beans";
}


/* =========================================
   PESANAN
========================================= */

async function loadOrders() {
    const params = new URLSearchParams();
    if (state.orderStatus) params.set("status", state.orderStatus);
    if (state.orderSearch) params.set("q", state.orderSearch);

    try {
        const { orders } = await api(`/api/admin/orders?${params}`);
        renderOrders(orders);
    } catch (err) {
        toast(err.message, true);
    }
}

function renderOrders(orders) {
    const list = $("#orderList");

    if (!orders.length) {
        list.innerHTML = emptyState("fa-receipt", "Tidak ada pesanan di filter ini.");
        return;
    }

    list.innerHTML = orders.map(order => {
        const info = STATUS[order.status] || {};
        const isOpen = ["pending", "processing", "ready"].includes(order.status);
        const message = `Halo ${order.customer_name}, pesanan ${order.code} di Brew & Beans `;

        return `
        <article class="order-card status-border-${order.status}">
            <header>
                <div>
                    <b class="order-code">${escapeHTML(order.code)}</b>
                    <small class="muted">${formatDate(order.created_at)} · ${order.order_type === "dinein" ? "Dine In" : "Take Away"}</small>
                </div>
                ${statusBadge(order.status)}
            </header>

            <div class="order-customer">
                <span><i class="fa-solid fa-user"></i> ${escapeHTML(order.customer_name)}</span>
                <a href="${waLink(order.phone, message)}" target="_blank" rel="noopener">
                    <i class="fa-brands fa-whatsapp"></i> ${escapeHTML(order.phone)}
                </a>
            </div>

            <ul class="order-items">
                ${order.items.map(item => `
                    <li><span>${item.quantity}× ${escapeHTML(item.name)}</span><span>${rupiah(item.subtotal)}</span></li>
                `).join("")}
            </ul>

            ${order.note ? `<p class="order-note"><i class="fa-solid fa-note-sticky"></i> ${escapeHTML(order.note)}</p>` : ""}

            <footer>
                <strong>${rupiah(order.total)}</strong>
                <div class="order-actions">
                    ${info.next ? `<button class="btn btn-primary btn-sm" data-order-status="${info.next}" data-id="${order.id}">${info.nextLabel}</button>` : ""}
                    <select data-order-select="${order.id}" aria-label="Ubah status">
                        ${Object.entries(STATUS).map(([key, s]) =>
                            `<option value="${key}" ${key === order.status ? "selected" : ""}>${s.label}</option>`).join("")}
                    </select>
                    ${!isOpen ? `<button class="icon-btn danger" data-order-delete="${order.id}" title="Hapus pesanan"><i class="fa-solid fa-trash"></i></button>` : ""}
                </div>
            </footer>
        </article>`;
    }).join("");
}

async function setOrderStatus(id, status) {
    try {
        await api(`/api/admin/orders/${id}`, { method: "PATCH", body: { status } });
        toast(`Status diubah menjadi "${STATUS[status].label}"`);
        loadOrders();
        refreshBadges();
    } catch (err) {
        toast(err.message, true);
    }
}

$("#orderList").addEventListener("click", async (e) => {
    const next = e.target.closest("[data-order-status]");
    if (next) return setOrderStatus(next.dataset.id, next.dataset.orderStatus);

    const del = e.target.closest("[data-order-delete]");
    if (del && confirm("Hapus pesanan ini secara permanen?")) {
        try {
            await api(`/api/admin/orders/${del.dataset.orderDelete}`, { method: "DELETE" });
            toast("Pesanan dihapus");
            loadOrders();
        } catch (err) {
            toast(err.message, true);
        }
    }
});

$("#orderList").addEventListener("change", (e) => {
    const select = e.target.closest("[data-order-select]");
    if (select) setOrderStatus(select.dataset.orderSelect, select.value);
});

$("#orderFilters").addEventListener("click", (e) => {
    const chip = e.target.closest("button[data-status]");
    if (!chip) return;
    $$("#orderFilters button").forEach(b => b.classList.toggle("active", b === chip));
    state.orderStatus = chip.dataset.status;
    loadOrders();
});

let searchTimer;
$("#orderSearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        state.orderSearch = e.target.value.trim();
        loadOrders();
    }, 300);
});


/* =========================================
   MENU / PRODUK
========================================= */

async function loadProducts() {
    try {
        const { products } = await api("/api/admin/products");
        state.products = products;
        renderProducts();
    } catch (err) {
        toast(err.message, true);
    }
}

function renderProducts() {
    const list = $("#productList");

    if (!state.products.length) {
        list.innerHTML = emptyState("fa-mug-hot", "Belum ada menu. Klik \"Tambah Menu\".");
        return;
    }

    list.innerHTML = state.products.map(p => `
        <article class="product-admin ${p.available ? "" : "unavailable"}">
            <div class="thumb">
                ${p.image ? `<img src="${escapeHTML(p.image)}" alt="" loading="lazy">` : `<i class="fa-solid fa-image"></i>`}
                ${p.featured ? `<span class="pill">Favorit</span>` : ""}
            </div>
            <div class="product-admin-body">
                <small class="muted">${CATEGORY_LABELS[p.category] || p.category}${p.tag ? " · " + escapeHTML(p.tag) : ""}</small>
                <h4>${escapeHTML(p.name)}</h4>
                <strong>${rupiah(p.price)}</strong>
                <label class="switch">
                    <input type="checkbox" data-toggle-available="${p.id}" ${p.available ? "checked" : ""}>
                    <span>${p.available ? "Tersedia" : "Habis / disembunyikan"}</span>
                </label>
            </div>
            <div class="product-admin-actions">
                <button class="icon-btn" data-edit-product="${p.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn danger" data-delete-product="${p.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
            </div>
        </article>
    `).join("");
}

$("#productList").addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit-product]");
    if (edit) {
        openProductModal(state.products.find(p => p.id === Number(edit.dataset.editProduct)));
        return;
    }

    const del = e.target.closest("[data-delete-product]");
    if (del) {
        const product = state.products.find(p => p.id === Number(del.dataset.deleteProduct));
        if (!confirm(`Hapus menu "${product.name}"? Riwayat pesanan tetap tersimpan.`)) return;
        try {
            await api(`/api/admin/products/${product.id}`, { method: "DELETE" });
            toast("Menu dihapus");
            loadProducts();
        } catch (err) {
            toast(err.message, true);
        }
    }
});

$("#productList").addEventListener("change", async (e) => {
    const toggle = e.target.closest("[data-toggle-available]");
    if (!toggle) return;

    const product = state.products.find(p => p.id === Number(toggle.dataset.toggleAvailable));
    try {
        await api(`/api/admin/products/${product.id}`, {
            method: "PUT",
            body: { ...product, available: toggle.checked }
        });
        toast(toggle.checked ? `${product.name} tersedia` : `${product.name} disembunyikan`);
        loadProducts();
    } catch (err) {
        toast(err.message, true);
        toggle.checked = !toggle.checked;
    }
});


/* ---------- MODAL TAMBAH / EDIT ---------- */

const productModal = $("#productModal");
const productForm = $("#productForm");

function setImagePreview(url) {
    const img = $("#imagePreview");
    img.hidden = !url;
    if (url) img.src = url;
}

function openProductModal(product = null) {
    productForm.reset();
    $("#productError").textContent = "";
    $("#productModalTitle").textContent = product ? "Edit Menu" : "Tambah Menu";

    productForm.id.value = product?.id || "";
    productForm.name.value = product?.name || "";
    productForm.category.value = product?.category || "coffee";
    productForm.price.value = product?.price ?? "";
    productForm.description.value = product?.description || "";
    productForm.image.value = product?.image || "";
    productForm.tag.value = product?.tag || "";
    productForm.sort_order.value = product?.sort_order ?? (state.products.length + 1);
    productForm.available.checked = product ? product.available : true;
    productForm.featured.checked = product ? product.featured : false;

    setImagePreview(productForm.image.value);
    productModal.showModal();
    productForm.name.focus();
}

$("#addProductBtn").addEventListener("click", () => openProductModal());

$$("[data-close-modal]").forEach(btn => btn.addEventListener("click", () => productModal.close()));

productForm.image.addEventListener("input", () => setImagePreview(productForm.image.value.trim()));

// Perkecil foto di browser sebelum upload (maks. 1000px, JPEG) agar ringan
function resizeImage(file, maxSize = 1000, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);

            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("File bukan gambar yang valid."));
        };

        img.src = url;
    });
}

$("#imageFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        $("#productError").textContent = "File harus berupa gambar JPG, PNG, atau WEBP.";
        return;
    }
    if (file.size > 15 * 1024 * 1024) {
        $("#productError").textContent = "Ukuran file maksimal 15 MB.";
        return;
    }

    try {
        $("#productError").textContent = "Mengupload...";
        const data = await resizeImage(file);
        const { url } = await api("/api/admin/upload", { method: "POST", body: { data } });
        productForm.image.value = url;
        setImagePreview(url);
        $("#productError").textContent = "";
    } catch (err) {
        $("#productError").textContent = err.message;
    }
});

productForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = productForm.id.value;
    const body = {
        name: productForm.name.value.trim(),
        category: productForm.category.value,
        price: Number(productForm.price.value),
        description: productForm.description.value.trim(),
        image: productForm.image.value.trim(),
        tag: productForm.tag.value.trim(),
        sort_order: Number(productForm.sort_order.value) || 0,
        available: productForm.available.checked,
        featured: productForm.featured.checked
    };

    const submit = $("#productSubmit");
    submit.disabled = true;

    try {
        await api(id ? `/api/admin/products/${id}` : "/api/admin/products", {
            method: id ? "PUT" : "POST",
            body
        });
        productModal.close();
        toast(id ? "Menu diperbarui" : "Menu ditambahkan");
        loadProducts();
    } catch (err) {
        $("#productError").textContent = err.message;
    } finally {
        submit.disabled = false;
    }
});


/* =========================================
   PESAN KONTAK
========================================= */

async function loadMessages() {
    try {
        const { messages } = await api("/api/admin/messages");
        renderMessages(messages);
    } catch (err) {
        toast(err.message, true);
    }
}

function renderMessages(messages) {
    const list = $("#messageList");

    if (!messages.length) {
        list.innerHTML = emptyState("fa-envelope-open", "Belum ada pesan masuk.");
        return;
    }

    list.innerHTML = messages.map(m => `
        <article class="message-card ${m.is_read ? "" : "unread"}">
            <header>
                <div>
                    <b>${escapeHTML(m.name)}</b>
                    <small class="muted">${formatDate(m.created_at)}</small>
                </div>
                ${m.is_read ? "" : `<span class="status status-pending">Baru</span>`}
            </header>
            <p>${escapeHTML(m.message).replace(/\n/g, "<br>")}</p>
            <footer>
                <div class="contact-links">
                    <a href="mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent("Balasan dari Brew & Beans")}">
                        <i class="fa-solid fa-envelope"></i> ${escapeHTML(m.email)}
                    </a>
                    ${m.phone ? `<a href="${waLink(m.phone, `Halo ${m.name}, terima kasih sudah menghubungi Brew & Beans. `)}" target="_blank" rel="noopener">
                        <i class="fa-brands fa-whatsapp"></i> ${escapeHTML(m.phone)}</a>` : ""}
                </div>
                <div class="order-actions">
                    <button class="btn btn-ghost btn-sm" data-read="${m.id}" data-value="${m.is_read ? 0 : 1}">
                        ${m.is_read ? "Tandai belum dibaca" : "Tandai dibaca"}
                    </button>
                    <button class="icon-btn danger" data-delete-message="${m.id}" title="Hapus"><i class="fa-solid fa-trash"></i></button>
                </div>
            </footer>
        </article>
    `).join("");
}

$("#messageList").addEventListener("click", async (e) => {
    const read = e.target.closest("[data-read]");
    const del = e.target.closest("[data-delete-message]");

    try {
        if (read) {
            await api(`/api/admin/messages/${read.dataset.read}`, {
                method: "PATCH",
                body: { is_read: read.dataset.value === "1" }
            });
        } else if (del) {
            if (!confirm("Hapus pesan ini?")) return;
            await api(`/api/admin/messages/${del.dataset.deleteMessage}`, { method: "DELETE" });
            toast("Pesan dihapus");
        } else {
            return;
        }
        loadMessages();
        refreshBadges();
    } catch (err) {
        toast(err.message, true);
    }
});


/* =========================================
   AKUN
========================================= */

$("#passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;

    if (form.new_password.value !== form.confirm_password.value) {
        toast("Konfirmasi password tidak sama.", true);
        return;
    }

    try {
        await api("/api/admin/password", {
            method: "POST",
            body: { current_password: form.current_password.value, new_password: form.new_password.value }
        });
        form.reset();
        toast("Password berhasil diganti");
    } catch (err) {
        toast(err.message, true);
    }
});


/* =========================================
   CEK PESANAN BARU BERKALA (tiap 15 detik)
========================================= */

let pollTimer;

async function refreshBadges() {
    try {
        const stats = await api("/api/admin/stats");
        updateBadges(stats.active_orders, stats.unread_messages);

        const ids = stats.recent_orders.map(o => o.id);
        if (state.knownOrderIds) {
            const fresh = ids.filter(id => !state.knownOrderIds.includes(id));
            if (fresh.length) {
                toast(`🔔 ${fresh.length} pesanan baru masuk!`);
                if (state.view === "orders") loadOrders();
                if (state.view === "dashboard") loadDashboard();
            }
        }
        state.knownOrderIds = ids;
    } catch { /* abaikan */ }
}

function startPolling() {
    stopPolling();
    refreshBadges();
    pollTimer = setInterval(refreshBadges, 15000);
}

function stopPolling() {
    clearInterval(pollTimer);
}


/* =========================================
   MULAI
========================================= */

(async function init() {
    try {
        const { admin } = await api("/api/admin/me");
        showApp(admin);
    } catch {
        showLogin();
    }
})();
