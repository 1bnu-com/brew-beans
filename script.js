/* =========================================
   BREW & BEANS
   MAIN JAVASCRIPT (terhubung ke backend /api)
========================================= */


/* =========================================
   WHATSAPP NUMBER

   GANTI NOMOR DI BAWAH INI
   Format: kode negara, tanpa + atau 0 di depan.
========================================= */

const WHATSAPP_NUMBER = "6285715330064";

function buildWhatsAppURL(message) {
    if (!WHATSAPP_NUMBER) {
        showNotification("Nomor WhatsApp belum dikonfigurasi. Silakan hubungi kami lewat email.", "error");
        return null;
    }

    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}


/* =========================================
   KONEKSI KE BACKEND
   Jika website dibuka langsung sebagai file (tanpa server),
   semua fitur tetap jalan dengan mode lama (tanpa database).
========================================= */

const API_ENABLED = location.protocol === "http:" || location.protocol === "https:";

async function api(path, options = {}) {
    if (!API_ENABLED) throw new Error("offline");

    const response = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    let data = {};
    try { data = await response.json(); } catch { /* bukan JSON */ }

    if (!response.ok) {
        const error = new Error(data.error || "Terjadi kesalahan. Coba lagi.");
        error.status = response.status;
        throw error;
    }

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


/* =========================================
   MOBILE NAVIGATION
========================================= */

const hamburger = document.getElementById("hamburger");
const navMenu = document.getElementById("navMenu");

function setNavOpen(isOpen) {
    if (!hamburger || !navMenu) return;

    navMenu.classList.toggle("open", isOpen);
    hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    navMenu.setAttribute("aria-hidden", isOpen ? "false" : "true");

    const icon = hamburger.querySelector("i");
    icon?.classList.toggle("fa-bars", !isOpen);
    icon?.classList.toggle("fa-xmark", isOpen);
}

if (hamburger && navMenu) {
    hamburger.setAttribute("aria-expanded", "false");

    hamburger.addEventListener("click", () => {
        setNavOpen(!navMenu.classList.contains("open"));
    });

    navMenu.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => setNavOpen(false));
    });

    document.addEventListener("click", (e) => {
        if (
            navMenu.classList.contains("open") &&
            !navMenu.contains(e.target) &&
            !hamburger.contains(e.target)
        ) {
            setNavOpen(false);
        }
    });
}


/* =========================================
   NAVBAR SCROLL EFFECT
========================================= */

const header = document.getElementById("header");

function navbarScroll() {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 40);
}

window.addEventListener("scroll", navbarScroll);
navbarScroll();


/* =========================================
   FORMAT RUPIAH
========================================= */

function formatRupiah(number) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0
    }).format(number);
}


/* =========================================
   CART (disimpan di browser)
========================================= */

let cart = [];

try {
    cart = (JSON.parse(localStorage.getItem("brewBeansCart")) || [])
        .map(item => ({ ...item, id: String(item.id) }));
} catch {
    cart = [];
}

// Pesanan terakhir yang berhasil dibuat (untuk ditampilkan di keranjang)
let lastOrder = null;

function saveCart() {
    try {
        localStorage.setItem("brewBeansCart", JSON.stringify(cart));
    } catch { /* storage penuh / diblokir */ }
}

function cartTotal() {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function updateCartCount() {
    const cartCount = document.getElementById("cartCount");
    if (!cartCount) return;
    cartCount.textContent = cart.reduce((total, item) => total + item.quantity, 0);
}

function refreshCart() {
    saveCart();
    updateCartCount();
    renderCart();
}

function addToCart(product) {
    if (lastOrder) setLastOrder(null);

    const existing = cart.find(item => item.id === product.id);

    if (existing) {
        existing.quantity++;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    refreshCart();
    showNotification(product.name + " ditambahkan ke cart");
}

// Tombol "+" di kartu menu (event delegation: berlaku juga untuk menu dari database)
document.addEventListener("click", (e) => {
    const button = e.target.closest(".add-cart");
    if (!button) return;

    addToCart({
        id: String(button.dataset.id),
        name: button.dataset.name,
        price: Number(button.dataset.price),
        image: button.dataset.image
    });

    openCart();
});


/* =========================================
   CART SIDEBAR
========================================= */

const cartButton = document.getElementById("cartButton");
const cartSidebar = document.getElementById("cartSidebar");
const cartOverlay = document.getElementById("cartOverlay");
const closeCart = document.getElementById("closeCart");

function openCart() {
    if (!cartSidebar) return;
    cartSidebar.classList.add("active");
    cartOverlay?.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeCartSidebar() {
    if (!cartSidebar) return;
    cartSidebar.classList.remove("active");
    cartOverlay?.classList.remove("active");
    document.body.style.overflow = "";
}

cartButton?.addEventListener("click", openCart);
closeCart?.addEventListener("click", closeCartSidebar);
cartOverlay?.addEventListener("click", closeCartSidebar);

document.querySelectorAll("[data-open-cart]").forEach(button => {
    button.addEventListener("click", openCart);
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCartSidebar();
});


/* =========================================
   RENDER CART
========================================= */

const cartItemsEl = document.getElementById("cartItems");
const cartTotalEl = document.getElementById("cartTotal");

function renderCart() {
    if (!cartItemsEl) return;

    const footer = cartSidebar?.querySelector(".cart-footer");

    if (cart.length === 0) {
        footer?.classList.add("is-empty");
        if (cartTotalEl) cartTotalEl.textContent = formatRupiah(0);

        cartItemsEl.innerHTML = lastOrder ? orderSuccessHTML(lastOrder) : `
            <div class="empty-cart">
                <i class="fa-solid fa-bag-shopping"></i>
                <p>Keranjang masih kosong.</p>
                <a href="menu.html" class="btn btn-dark">Explore Menu</a>
            </div>
        `;
        return;
    }

    footer?.classList.remove("is-empty");

    cartItemsEl.innerHTML = cart.map(item => `
        <div class="cart-item">
            <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">
            <div>
                <h4>${escapeHTML(item.name)}</h4>
                <div class="cart-item-price">${formatRupiah(item.price)}</div>
                <div class="quantity">
                    <button class="decrease" data-id="${escapeHTML(item.id)}" aria-label="Kurangi">-</button>
                    <span>${item.quantity}</span>
                    <button class="increase" data-id="${escapeHTML(item.id)}" aria-label="Tambah">+</button>
                </div>
            </div>
            <button class="remove-item" data-id="${escapeHTML(item.id)}" aria-label="Hapus item">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join("");

    if (cartTotalEl) cartTotalEl.textContent = formatRupiah(cartTotal());
}

// Tombol +, -, hapus di dalam keranjang
cartItemsEl?.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-id]");

    if (button) {
        const id = button.dataset.id;
        const item = cart.find(product => product.id === id);
        if (!item) return;

        if (button.classList.contains("increase")) {
            item.quantity++;
        } else if (button.classList.contains("decrease")) {
            if (item.quantity > 1) item.quantity--;
            else cart = cart.filter(product => product.id !== id);
        } else if (button.classList.contains("remove-item")) {
            cart = cart.filter(product => product.id !== id);
        }

        refreshCart();
        return;
    }

    if (e.target.closest("[data-new-order]")) {
        setLastOrder(null);
        renderCart();
    }

    const refreshButton = e.target.closest("[data-refresh-order]");
    if (refreshButton) refreshOrderStatus(refreshButton);
});


/* =========================================
   CHECKOUT
   1. Klik "Checkout" -> form data pemesan muncul
   2. Pesanan disimpan ke database (dapat kode pesanan)
   3. Pelanggan konfirmasi via WhatsApp
========================================= */

const checkoutButton = document.getElementById("checkoutBtn");
let checkoutForm = null;

function buildCheckoutForm() {
    const footer = checkoutButton?.closest(".cart-footer");
    if (!footer) return;

    checkoutForm = document.createElement("form");
    checkoutForm.className = "checkout-form";
    checkoutForm.noValidate = true;
    checkoutForm.innerHTML = `
        <div class="checkout-fields">
            <div class="checkout-row">
                <label>
                    <span>Nama</span>
                    <input name="customer_name" type="text" maxlength="80" autocomplete="name" placeholder="Nama kamu" required>
                </label>
                <label>
                    <span>No. WhatsApp</span>
                    <input name="phone" type="tel" maxlength="20" autocomplete="tel" placeholder="08xxxxxxxxxx" required>
                </label>
            </div>
            <div class="order-type" role="radiogroup" aria-label="Tipe pesanan">
                <label><input type="radio" name="order_type" value="takeaway" checked><span>Take Away</span></label>
                <label><input type="radio" name="order_type" value="dinein"><span>Dine In</span></label>
            </div>
            <label>
                <span>Catatan (opsional)</span>
                <input name="note" type="text" maxlength="200" placeholder="Contoh: less sugar, meja 5">
            </label>
        </div>
    `;

    footer.insertBefore(checkoutForm, checkoutButton);
    checkoutForm.appendChild(checkoutButton);
    checkoutButton.type = "submit";

    // Isi otomatis dari pesanan sebelumnya
    try {
        const saved = JSON.parse(localStorage.getItem("brewBeansCustomer") || "{}");
        if (saved.customer_name) checkoutForm.customer_name.value = saved.customer_name;
        if (saved.phone) checkoutForm.phone.value = saved.phone;
    } catch { /* abaikan */ }

    checkoutForm.addEventListener("submit", handleCheckout);
}

function setCheckoutLabel(html) {
    checkoutButton.innerHTML = html;
}

const CHECKOUT_LABEL_START = 'Checkout <i class="fa-solid fa-arrow-right"></i>';
const CHECKOUT_LABEL_SEND = 'Pesan Sekarang <i class="fa-solid fa-paper-plane"></i>';

function buildWhatsAppOrderMessage(order) {
    let message = "Halo Brew & Beans, saya ingin memesan:\n\n";

    if (order.code) message += `Kode Pesanan: *${order.code}*\n`;
    if (order.customer_name) message += `Nama: ${order.customer_name}\n`;
    if (order.order_type) message += `Tipe: ${order.order_type === "dinein" ? "Dine In" : "Take Away"}\n`;
    message += "\n";

    order.items.forEach(item => {
        message += `${item.name} x${item.quantity} = ${formatRupiah(item.price * item.quantity)}\n`;
    });

    message += `\nTotal: ${formatRupiah(order.total)}`;
    if (order.note) message += `\nCatatan: ${order.note}`;
    message += "\n\nTerima kasih.";

    return message;
}

async function handleCheckout(event) {
    event.preventDefault();

    if (cart.length === 0) {
        showNotification("Cart masih kosong.", "error");
        return;
    }

    // Langkah 1: tampilkan form
    if (!checkoutForm.classList.contains("open")) {
        checkoutForm.classList.add("open");
        setCheckoutLabel(CHECKOUT_LABEL_SEND);
        checkoutForm.customer_name.focus();
        return;
    }

    // Langkah 2: validasi
    const data = {
        customer_name: checkoutForm.customer_name.value.trim(),
        phone: checkoutForm.phone.value.trim(),
        order_type: checkoutForm.order_type.value,
        note: checkoutForm.note.value.trim()
    };

    if (!data.customer_name) {
        showNotification("Mohon isi nama kamu.", "error");
        checkoutForm.customer_name.focus();
        return;
    }
    if (!/^\+?[\d\s-]{8,20}$/.test(data.phone)) {
        showNotification("Nomor WhatsApp tidak valid.", "error");
        checkoutForm.phone.focus();
        return;
    }

    try {
        localStorage.setItem("brewBeansCustomer", JSON.stringify({
            customer_name: data.customer_name,
            phone: data.phone
        }));
    } catch { /* abaikan */ }

    // Langkah 3: simpan pesanan ke server
    checkoutButton.disabled = true;
    setCheckoutLabel('Memproses... <i class="fa-solid fa-spinner fa-spin"></i>');

    let order;

    try {
        const result = await api("/api/orders", {
            method: "POST",
            body: {
                ...data,
                items: cart.map(item => ({ id: Number(item.id), quantity: item.quantity }))
            }
        });
        order = result.order;
    } catch (error) {
        if (error.status) {
            // Server menolak (mis. menu sudah tidak tersedia)
            showNotification(error.message, "error");
            checkoutButton.disabled = false;
            setCheckoutLabel(CHECKOUT_LABEL_SEND);
            if (error.status === 409) loadProducts();
            return;
        }

        if (API_ENABLED) {
            // Koneksi internet / server bermasalah -> pesanan TIDAK dikirim, keranjang tetap
            showNotification("Gagal mengirim pesanan. Periksa koneksi lalu coba lagi.", "error");
            checkoutButton.disabled = false;
            setCheckoutLabel(CHECKOUT_LABEL_SEND);
            return;
        }

        // Dibuka sebagai file tanpa server -> tidak ada sistem, kirim via WhatsApp
        order = {
            ...data,
            code: null,
            items: cart.map(item => ({ name: item.name, price: item.price, quantity: item.quantity })),
            total: cartTotal()
        };
    }

    if (!order.code) {
        order.whatsappUrl = buildWhatsAppURL(buildWhatsAppOrderMessage(order));
    }

    cart = [];
    setLastOrder(order);
    refreshCart();

    checkoutButton.disabled = false;
    checkoutForm.classList.remove("open");
    checkoutForm.note.value = "";
    setCheckoutLabel(CHECKOUT_LABEL_START);

    if (order.whatsappUrl) window.open(order.whatsappUrl, "_blank", "noopener");
    else showNotification("Pesanan masuk! Kode: " + order.code);
}

const ORDER_STATUS_LABELS = {
    pending: "Menunggu diproses",
    processing: "Sedang dibuat",
    ready: "Siap diambil / disajikan",
    completed: "Selesai",
    cancelled: "Dibatalkan"
};

function orderSuccessHTML(order) {
    // Mode tanpa server: pesanan dikirim lewat WhatsApp
    if (!order.code) {
        return `
            <div class="order-success">
                <i class="fa-solid fa-circle-check"></i>
                <h3>Pesanan Siap Dikirim</h3>
                <p class="order-total">Total ${formatRupiah(order.total)}</p>
                ${order.whatsappUrl ? `
                    <a class="btn btn-dark order-wa" href="${escapeHTML(order.whatsappUrl)}" target="_blank" rel="noopener">
                        Kirim via WhatsApp <i class="fa-brands fa-whatsapp"></i>
                    </a>` : ""}
                <button type="button" class="text-link" data-new-order>Buat pesanan baru</button>
            </div>
        `;
    }

    const status = order.status || "pending";
    const helpUrl = buildWhatsAppURL(`Halo Brew & Beans, saya ingin bertanya tentang pesanan ${order.code}.`);

    return `
        <div class="order-success">
            <i class="fa-solid fa-circle-check"></i>
            <h3>Pesanan Masuk!</h3>
            <p>Pesanan kamu sudah kami terima. Simpan kode ini:</p>
            <strong class="order-code">${escapeHTML(order.code)}</strong>
            <p class="order-total">Total ${formatRupiah(order.total)}</p>

            <div class="order-status status-${escapeHTML(status)}">
                <span>Status:</span>
                <b data-order-status-text>${ORDER_STATUS_LABELS[status] || escapeHTML(status)}</b>
            </div>

            <button type="button" class="btn btn-dark order-refresh" data-refresh-order>
                Cek status <i class="fa-solid fa-rotate"></i>
            </button>

            <button type="button" class="text-link" data-new-order>Buat pesanan baru</button>

            ${helpUrl ? `
                <a class="order-help" href="${escapeHTML(helpUrl)}" target="_blank" rel="noopener">
                    <i class="fa-brands fa-whatsapp"></i> Ada kendala? Hubungi kami
                </a>` : ""}
        </div>
    `;
}

function setLastOrder(order) {
    lastOrder = order;
    try {
        if (order && order.code) {
            localStorage.setItem("brewBeansLastOrder", JSON.stringify({
                code: order.code, total: order.total, status: order.status
            }));
        } else {
            localStorage.removeItem("brewBeansLastOrder");
        }
    } catch { /* abaikan */ }
}

async function refreshOrderStatus(button) {
    if (!lastOrder?.code) return;

    button.disabled = true;
    try {
        const { order } = await api(`/api/orders/${encodeURIComponent(lastOrder.code)}`);
        const changed = order.status !== lastOrder.status;
        setLastOrder({ ...lastOrder, status: order.status, total: order.total });
        renderCart();
        showNotification(changed
            ? "Status diperbarui: " + (ORDER_STATUS_LABELS[order.status] || order.status)
            : "Status masih: " + (ORDER_STATUS_LABELS[order.status] || order.status));
    } catch (error) {
        showNotification(error.message || "Gagal memuat status.", "error");
        button.disabled = false;
    }
}

// Tampilkan lagi pesanan terakhir setelah halaman dimuat ulang
try {
    const saved = JSON.parse(localStorage.getItem("brewBeansLastOrder") || "null");
    if (saved?.code && cart.length === 0) lastOrder = saved;
} catch { /* abaikan */ }

if (checkoutButton) {
    buildCheckoutForm();
    setCheckoutLabel(CHECKOUT_LABEL_START);
    checkoutButton.setAttribute("aria-label", "Checkout pesanan");
}

updateCartCount();
renderCart();


/* =========================================
   FLOATING WHATSAPP BUTTON
   Untuk pertanyaan / komplain (pemesanan lewat sistem checkout)
========================================= */

const whatsappFab = document.getElementById("whatsappFab");

whatsappFab?.setAttribute("aria-label", "Hubungi kami via WhatsApp");
whatsappFab?.setAttribute("title", "Pertanyaan atau komplain? Chat kami");

whatsappFab?.addEventListener("click", (e) => {
    e.preventDefault();

    let message = "Halo Brew & Beans, saya ingin bertanya.";

    if (lastOrder?.code) {
        message = `Halo Brew & Beans, saya ingin bertanya tentang pesanan ${lastOrder.code}.`;
    } else if (!API_ENABLED && cart.length > 0) {
        message = buildWhatsAppOrderMessage({ items: cart, total: cartTotal() });
    }

    const url = buildWhatsAppURL(message);
    if (url) window.open(url, "_blank", "noopener");
});


/* =========================================
   MENU DARI DATABASE
========================================= */

let currentFilter = "all";

const CATEGORY_LABELS = {
    coffee: "COFFEE",
    noncoffee: "NON COFFEE",
    food: "FOOD",
    dessert: "DESSERT"
};

function productCardHTML(product, { showCategoryTag = false } = {}) {
    const tag = product.tag || (showCategoryTag ? CATEGORY_LABELS[product.category] : "");

    return `
        <article class="product-card" data-category="${escapeHTML(product.category)}">
            <div class="product-image">
                <img loading="lazy" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}">
                ${tag ? `<span class="product-tag">${escapeHTML(tag)}</span>` : ""}
            </div>
            <div class="product-info">
                <h3>${escapeHTML(product.name)}</h3>
                <p>${escapeHTML(product.description)}</p>
                <div class="product-bottom">
                    <strong>${formatRupiah(product.price)}</strong>
                    <button class="add-cart"
                            aria-label="Tambah ${escapeHTML(product.name)} ke cart"
                            data-id="${product.id}"
                            data-name="${escapeHTML(product.name)}"
                            data-price="${product.price}"
                            data-image="${escapeHTML(product.image)}">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>
        </article>
    `;
}

// Samakan isi keranjang dengan harga & ketersediaan terbaru di database
function syncCartWithProducts(products) {
    const byId = new Map(products.map(p => [String(p.id), p]));
    const before = cart.length;

    cart = cart
        .filter(item => byId.has(item.id))
        .map(item => {
            const p = byId.get(item.id);
            return { ...item, name: p.name, price: p.price, image: p.image };
        });

    if (cart.length < before) {
        showNotification("Beberapa item di keranjang sudah tidak tersedia dan dihapus.", "error");
    }

    refreshCart();
}

async function loadProducts() {
    if (!API_ENABLED) return;

    let products;
    try {
        ({ products } = await api("/api/products"));
    } catch {
        return; // server mati -> tetap pakai menu statis di HTML
    }

    const menuGrid = document.querySelector(".menu-products");
    if (menuGrid) {
        menuGrid.innerHTML = products.length
            ? products.map(p => productCardHTML(p, { showCategoryTag: true })).join("")
            : '<p class="menu-empty">Menu belum tersedia.</p>';
        applyFilter(currentFilter);
    }

    const featuredGrid = document.querySelector(".menu-preview .products-grid");
    if (featuredGrid) {
        const featured = products.filter(p => p.featured).slice(0, 8);
        if (featured.length) {
            featuredGrid.innerHTML = featured.map(p => productCardHTML(p)).join("");
        }
    }

    syncCartWithProducts(products);
}

loadProducts();


/* =========================================
   MENU FILTER
========================================= */

function applyFilter(filter) {
    currentFilter = filter;

    document.querySelectorAll(".menu-products .product-card, .products-grid .product-card").forEach(product => {
        const category = product.dataset.category || "coffee";
        const visible = filter === "all" || category === filter;
        product.style.display = visible ? "" : "none";
        product.classList.toggle("reveal", visible);
    });
}

document.querySelectorAll(".filter-btn, .filter").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".filter-btn, .filter").forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");
        applyFilter(button.dataset.filter);
    });
});


/* =========================================
   CONTACT FORM -> disimpan ke database
========================================= */

const contactForm = document.getElementById("contactForm");

contactForm?.addEventListener("submit", async function (event) {
    event.preventDefault();

    const data = {
        name: document.getElementById("name").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        message: document.getElementById("message").value.trim()
    };

    if (!data.name || !data.email || !data.phone || !data.message) {
        showNotification("Mohon lengkapi semua field.", "error");
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        showNotification("Format email tidak valid.", "error");
        return;
    }

    const submitButton = contactForm.querySelector('button[type="submit"]');
    const originalLabel = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = 'Mengirim... <i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        await api("/api/messages", { method: "POST", body: data });
        contactForm.reset();
        showNotification("Pesan terkirim! Kami akan segera membalas.");
    } catch (error) {
        if (error.status) {
            showNotification(error.message, "error");
        } else {
            // Server tidak tersedia -> buka aplikasi email
            const subject = encodeURIComponent(`Pesan dari ${data.name}`);
            const body = encodeURIComponent(
                `Nama: ${data.name}\nEmail: ${data.email}\nWhatsApp: ${data.phone}\n\n${data.message}`
            );
            window.location.href = `mailto:hello@handikaweb.com?subject=${subject}&body=${body}`;
        }
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalLabel;
    }
});


/* =========================================
   NOTIFICATION
========================================= */

function showNotification(text, type = "success") {
    document.querySelector(".notification")?.remove();

    const notification = document.createElement("div");
    notification.className = "notification" + (type === "error" ? " notification-error" : "");
    notification.setAttribute("role", "status");

    const icon = document.createElement("i");
    icon.className = type === "error" ? "fa-solid fa-circle-exclamation" : "fa-solid fa-check";

    const span = document.createElement("span");
    span.textContent = text;

    notification.append(icon, span);
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add("show"), 20);
    setTimeout(() => {
        notification.classList.remove("show");
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}


/* =========================================
   SEARCH
========================================= */

const searchButton = document.getElementById("searchButton");

searchButton?.addEventListener("click", () => {
    const keyword = prompt("Cari menu Brew & Beans:");
    if (keyword === null) return;

    const search = keyword.trim().toLowerCase();

    document.querySelectorAll(".product-card").forEach(product => {
        product.style.display = !search || product.innerText.toLowerCase().includes(search) ? "" : "none";
    });

    if (search) document.querySelector(".products-grid, .menu-products")?.scrollIntoView({ behavior: "smooth" });
});
