/* =========================================
   BREW & BEANS
   MAIN JAVASCRIPT
========================================= */


/* =========================================
   WHATSAPP NUMBER

   GANTI NOMOR DI BAWAH INI

   Contoh:
   6281234567890

   Jangan gunakan:
   +62
   0812
========================================= */

// WhatsApp number used for checkout. Change this to your number (no leading + or 0):
// Example: 6281234567890
const WHATSAPP_NUMBER = "6281234567890";


/* =========================================
   MOBILE NAVIGATION
========================================= */

const hamburger = document.getElementById("hamburger");
const navMenu = document.getElementById("navMenu");

if (hamburger && navMenu) {
    // ensure initial accessibility state
    hamburger.setAttribute('aria-expanded','false');

    hamburger.addEventListener("click", () => {

        navMenu.classList.toggle("open");
        const isOpen = navMenu.classList.contains('open');
        hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        navMenu.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

        const icon = hamburger.querySelector("i");

        if (navMenu.classList.contains("open")) {

            icon.classList.remove("fa-bars");
            icon.classList.add("fa-xmark");

        } else {

            icon.classList.remove("fa-xmark");
            icon.classList.add("fa-bars");

        }

    });

}

// Close mobile nav when clicking a link
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        if (navMenu.classList.contains('open')) {
            navMenu.classList.remove('open');
            const icon = hamburger.querySelector('i');
            icon.classList.remove('fa-xmark'); icon.classList.add('fa-bars');
            hamburger.setAttribute('aria-expanded','false');
        }
    });
});

// Click outside to close the mobile nav
document.addEventListener('click', (e) => {
    if (!navMenu || !hamburger) return;

    if (navMenu.classList.contains('open')) {
        const target = e.target;
        if (!navMenu.contains(target) && !hamburger.contains(target)) {
            navMenu.classList.remove('open');
            const icon = hamburger.querySelector('i');
            icon.classList.remove('fa-xmark'); icon.classList.add('fa-bars');
            hamburger.setAttribute('aria-expanded','false');
        }
    }
});


/* =========================================
   NAVBAR SCROLL EFFECT
========================================= */

const header = document.getElementById("header");

function navbarScroll() {

    if (!header) return;

    if (window.scrollY > 40) {

        header.classList.add("scrolled");

    } else {

        header.classList.remove("scrolled");

    }

}

window.addEventListener("scroll", navbarScroll);

navbarScroll();


/* =========================================
   CART
========================================= */

let cart = JSON.parse(
    localStorage.getItem("brewBeansCart")
) || [];


/* =========================================
   FORMAT RUPIAH
========================================= */

function formatRupiah(number) {

    return new Intl.NumberFormat(
        "id-ID",
        {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0
        }
    ).format(number);

}


/* =========================================
   SAVE CART
========================================= */

function saveCart() {

    localStorage.setItem(
        "brewBeansCart",
        JSON.stringify(cart)
    );

}


/* =========================================
   UPDATE CART COUNT
========================================= */

function updateCartCount() {

    const cartCount =
        document.getElementById("cartCount");

    if (!cartCount) return;

    const totalItems = cart.reduce(
        (total, item) =>
            total + item.quantity,
        0
    );

    cartCount.textContent = totalItems;

}


/* =========================================
   ADD PRODUCT
========================================= */

function addToCart(product) {

    const existingProduct =
        cart.find(
            item => item.id === product.id
        );


    if (existingProduct) {

        existingProduct.quantity++;

    } else {

        cart.push({

            ...product,

            quantity: 1

        });

    }


    saveCart();

    updateCartCount();

    renderCart();

    showNotification(
        product.name + " ditambahkan ke cart"
    );

}


/* =========================================
   ADD BUTTON
========================================= */

const addButtons =
    document.querySelectorAll(".add-cart");


addButtons.forEach(button => {

    button.addEventListener("click", () => {

        const product = {

            id: button.dataset.id,

            name: button.dataset.name,

            price:
                Number(button.dataset.price),

            image: button.dataset.image

        };

        addToCart(product);

        openCart();

    });

});


/* =========================================
   CART SIDEBAR
========================================= */

const cartButton =
    document.getElementById("cartButton");

const cartSidebar =
    document.getElementById("cartSidebar");

const cartOverlay =
    document.getElementById("cartOverlay");

const closeCart =
    document.getElementById("closeCart");


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


cartButton?.addEventListener(
    "click",
    openCart
);


closeCart?.addEventListener(
    "click",
    closeCartSidebar
);


cartOverlay?.addEventListener(
    "click",
    closeCartSidebar
);


document
    .querySelectorAll("[data-open-cart]")
    .forEach(button => {

        button.addEventListener(
            "click",
            openCart
        );

    });


/* =========================================
   RENDER CART
========================================= */

function renderCart() {

    const cartItems =
        document.getElementById("cartItems");

    const cartTotal =
        document.getElementById("cartTotal");


    if (!cartItems) return;


    if (cart.length === 0) {

        cartItems.innerHTML = `

            <div class="empty-cart">

                <i class="fa-solid fa-bag-shopping"></i>

                <p>
                    Keranjang masih kosong.
                </p>

                <a href="menu.html"
                   class="btn btn-dark">
                    Explore Menu
                </a>

            </div>

        `;

        if (cartTotal) {

            cartTotal.textContent =
                formatRupiah(0);

        }

        return;

    }


    cartItems.innerHTML = "";


    cart.forEach(item => {

        const cartItem =
            document.createElement("div");

        cartItem.className =
            "cart-item";


        cartItem.innerHTML = `

            <img
                src="${item.image}"
                alt="${item.name}">

            <div>

                <h4>
                    ${item.name}
                </h4>

                <div class="cart-item-price">
                    ${formatRupiah(item.price)}
                </div>

                <div class="quantity">

                    <button
                        class="decrease"
                        data-id="${item.id}">
                        -
                    </button>

                    <span>
                        ${item.quantity}
                    </span>

                    <button
                        class="increase"
                        data-id="${item.id}">
                        +
                    </button>

                </div>

            </div>

            <button
                class="remove-item"
                data-id="${item.id}">

                <i class="fa-solid fa-trash"></i>

            </button>

        `;


        cartItems.appendChild(cartItem);

    });


    const total = cart.reduce(

        (sum, item) =>
            sum + item.price * item.quantity,

        0

    );


    if (cartTotal) {

        cartTotal.textContent =
            formatRupiah(total);

    }


    /* ===============================
       INCREASE
    =============================== */

    document
        .querySelectorAll(".increase")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const item =
                        cart.find(
                            product =>
                                product.id ===
                                button.dataset.id
                        );

                    if (item) {

                        item.quantity++;

                        saveCart();

                        renderCart();

                        updateCartCount();

                    }

                }
            );

        });


    /* ===============================
       DECREASE
    =============================== */

    document
        .querySelectorAll(".decrease")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const item =
                        cart.find(
                            product =>
                                product.id ===
                                button.dataset.id
                        );


                    if (!item) return;


                    if (item.quantity > 1) {

                        item.quantity--;

                    } else {

                        cart =
                            cart.filter(
                                product =>
                                    product.id !==
                                    button.dataset.id
                            );

                    }


                    saveCart();

                    renderCart();

                    updateCartCount();

                }
            );

        });


    /* ===============================
       REMOVE
    =============================== */

    document
        .querySelectorAll(".remove-item")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    cart =
                        cart.filter(
                            item =>
                                item.id !==
                                button.dataset.id
                        );

                    saveCart();

                    renderCart();

                    updateCartCount();

                }
            );

        });

}


/* =========================================
   INITIAL CART
========================================= */

updateCartCount();

renderCart();


/* =========================================
   CHECKOUT WHATSAPP
========================================= */

const checkoutButton =
    document.getElementById("checkoutBtn");


checkoutButton?.addEventListener(
    "click",
    () => {

        if (cart.length === 0) {

            showNotification(
                "Cart masih kosong."
            );

            return;

        }


        let message =
            "Halo Brew & Beans, saya ingin memesan:%0A%0A";


        cart.forEach(item => {

            message +=
                `${item.name} x${item.quantity}%0A`;

        });


        const total = cart.reduce(

            (sum, item) =>
                sum +
                item.price *
                item.quantity,

            0

        );


        message +=
            `%0ATotal: ${formatRupiah(total)}`;


        message +=
            "%0A%0ATerima kasih.";


        /*
          NOMOR WHATSAPP DIAMBIL DARI
          VARIABLE WHATSAPP_NUMBER
        */


        const whatsappURL =
            `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;


        window.open(
            whatsappURL,
            "_blank"
        );

    }
);

/* Floating WhatsApp FAB behavior */
const whatsappFab = document.getElementById('whatsappFab');

if (whatsappFab) {
    whatsappFab.addEventListener('click', (e) => {
        e.preventDefault();

        let message = 'Halo Brew & Beans, saya ingin memesan:%0A%0A';

        if (cart.length > 0) {
            cart.forEach(item => {
                message += `${item.name} x${item.quantity}%0A`;
            });
            const total = cart.reduce((sum,item)=>sum+item.price*item.quantity,0);
            message += `%0ATotal: ${formatRupiah(total)}%0A%0ATerima kasih.`;
        } else {
            message = 'Halo Brew & Beans, saya ingin memesan. Terima kasih.';
        }

        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
        window.open(url, '_blank');

    });

}


/* =========================================
   MENU FILTER (works on menu page and homepage signature)
========================================= */

const filterButtons = document.querySelectorAll(".filter-btn, .filter");

const menuProducts = document.querySelectorAll(
    ".menu-products .product-card, .products-grid .product-card, .product-grid .product-card"
);

filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    filterButtons.forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");

    const filter = button.dataset.filter;

    menuProducts.forEach(product => {
      const category = product.dataset.category || product.getAttribute('data-category') || 'coffee';
      if (filter === "all" || category === filter) {
        product.style.display = "block";
        product.classList.add('reveal');
      } else {
        product.style.display = "none";
        product.classList.remove('reveal');
      }
    });
  });
});


/* =========================================
   CONTACT FORM
========================================= */

const contactForm =
    document.getElementById("contactForm");


contactForm?.addEventListener(
    "submit",
    function(event) {

        event.preventDefault();


        const name =
            document.getElementById("name").value.trim();

        const email =
            document.getElementById("email").value.trim();

        const phone =
            document.getElementById("phone").value.trim();

        const message =
            document.getElementById("message").value.trim();


        if (
            !name ||
            !email ||
            !phone ||
            !message
        ) {

            showNotification(
                "Mohon lengkapi semua field."
            );

            return;

        }


        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (!emailPattern.test(email)) {

            showNotification(
                "Format email tidak valid."
            );

            return;

        }


        showNotification(
            "Pesan berhasil dikirim!"
        );


        contactForm.reset();

    }
);


/* =========================================
   NOTIFICATION
========================================= */

function showNotification(text) {

    const oldNotification =
        document.querySelector(
            ".notification"
        );


    if (oldNotification) {

        oldNotification.remove();

    }


    const notification =
        document.createElement("div");


    notification.className =
        "notification";


    notification.innerHTML = `

        <i class="fa-solid fa-check"></i>

        <span>
            ${text}
        </span>

    `;


    document.body.appendChild(
        notification
    );


    setTimeout(() => {

        notification.classList.add(
            "show"
        );

    }, 20);


    setTimeout(() => {

        notification.classList.remove(
            "show"
        );

        setTimeout(() => {

            notification.remove();

        }, 300);

    }, 2500);

}


/* =========================================
   SEARCH
========================================= */

const searchButton =
    document.getElementById(
        "searchButton"
    );


searchButton?.addEventListener(
    "click",
    () => {

        const keyword =
            prompt(
                "Cari menu Brew & Beans:"
            );


        if (!keyword) return;


        const products =
            document.querySelectorAll(
                ".product-card"
            );


        const search =
            keyword.toLowerCase();


        products.forEach(product => {

            const text =
                product.innerText.toLowerCase();


            product.style.display =
                text.includes(search)
                    ? "block"
                    : "none";

        });

    }
);