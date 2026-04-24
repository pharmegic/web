// Mahsulotlarni localStorage dan yuklash (admin paneldan kelgan o'zgarishlar uchun)
function loadProductsFromStorage() {
    try {
        const stored = localStorage.getItem('pharmegic_products');
        
        // Agar localStorage bo'sh bo'lsa, INITIAL_PRODUCTS dan yuklash
        if (!stored || stored === '[]') {
            if (typeof INITIAL_PRODUCTS !== 'undefined') {
                products = INITIAL_PRODUCTS;
                localStorage.setItem('pharmegic_products', JSON.stringify(products));
                console.log('✅ INITIAL_PRODUCTS dan yuklandi:', products.length);
                return true;
            }
            return false;
        }
        
        const storedProducts = JSON.parse(stored);
        if (!Array.isArray(storedProducts)) {
            products = INITIAL_PRODUCTS;
            localStorage.setItem('pharmegic_products', JSON.stringify(products));
            return true;
        }
        
        // ✅ MERGE: INITIAL_PRODUCTS bilan localStorage ni birlashtirish
        const storedMap = new Map(storedProducts.map(p => [parseInt(p.id), p]));
        let changed = false;
        
        if (typeof INITIAL_PRODUCTS !== 'undefined') {
            INITIAL_PRODUCTS.forEach(initProduct => {
                const id = parseInt(initProduct.id);
                if (!storedMap.has(id)) {
                    storedMap.set(id, initProduct);
                    changed = true;
                }
            });
        }
        
        products = Array.from(storedMap.values()).sort((a, b) => a.id - b.id);
        
        if (changed) {
            localStorage.setItem('pharmegic_products', JSON.stringify(products));
            console.log('✅ Yo\'qolgan mahsulotlar tiklandi. Jami:', products.length);
        } else {
            console.log('✅ LocalStorage dan yuklandi:', products.length);
        }
        
        return true;
        
    } catch (error) {
        console.error('Storage yuklash xatosi:', error);
        if (typeof INITIAL_PRODUCTS !== 'undefined') {
            products = INITIAL_PRODUCTS;
            return true;
        }
        return false;
    }
}

// Boshqa tabda admin o'zgartirganda avtomatik yangilansin
window.addEventListener('storage', (e) => {
    if (e.key === 'pharmegic_products') {
        console.log('🔄 Admin panelda o\'zgarish aniqlandi, yangilanmoqda...');
        loadProductsFromStorage();
        renderProducts(currentFilter);
        showNotification('Mahsulotlar ro\'yxati yangilandi', 'success');
    }
});

// Helper functions
function formatPrice(price) {
   return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function getProductName(product, lang) {
   switch(lang) {
       case 'uz': return product.nameUz;
       case 'en': return product.nameEn;
       default: return product.nameRu;
   }
}

function getProductDescription(product, lang) {
   switch(lang) {
       case 'uz': return product.descriptionUz;
       case 'en': return product.descriptionEn;
       default: return product.descriptionRu;
   }
}

const translations = {
    uz: {
        searchPlaceholder: "Mahsulot qidirish...",
        inStock: "Sotuvda",
        retail: "Chakana",
        wholesale: "Ulgurji",
        minQty: "Min. miqdor",
        addToCart: "Savatga qo'shish",
        emptyCart: "Savat bo'sh",
        total: "Jami",
        remove: "O'chirish",
        currencySymbol: "so'm",
        quantity: "Miqdor"
    },
    ru: {
        searchPlaceholder: "Поиск товаров...",
        inStock: "В наличии",
        retail: "Розница",
        wholesale: "Опт",
        minQty: "Мин. количество",
        addToCart: "В корзину",
        emptyCart: "Корзина пуста",
        total: "Итого",
        remove: "Удалить",
        currencySymbol: "сум",
        quantity: "Количество"
    },
    en: {
        searchPlaceholder: "Search products...",
        inStock: "In stock",
        retail: "Retail",
        wholesale: "Wholesale",
        minQty: "Min. qty",
        addToCart: "Add to cart",
        emptyCart: "Cart is empty",
        total: "Total",
        remove: "Remove",
        currencySymbol: "uzs",
        quantity: "Quantity"
    }
};

let currentLang = 'uz';
let cart = [];
let currentFilter = 'all';
let selectedUserType = null;
let productsLastUpdate = localStorage.getItem('products_last_update') || 0;
let customerSyncInterval = null;
let products = [];

document.addEventListener('DOMContentLoaded', () => {
;
    
    loadCart();
    setLang('uz');
    updateCartUI();
    
    // ✅ AVVAL localStorage dan yuklash
    const hasLocalProducts = loadProductsFromStorage();
    
    if (hasLocalProducts) {
        renderProducts();  // Darhol ko'rsatish
    }
    
    // ✅ KEYIN API dan yangilash
    loadProductsFromAPI().then(() => {
        renderProducts();
        startCustomerSync();
    }).catch((error) => {
        console.error('API xatosi:', error);
        if (!hasLocalProducts) {
            // Agar localStorage ham bo'sh bo'lsa, INITIAL_PRODUCTS dan yukla
            products = INITIAL_PRODUCTS;
            renderProducts();
        }
    });
});

// Render Products
function renderProducts(filter = 'all', searchTerm = '') {
   const grid = document.getElementById('productsGrid');
   
   // ✅ FAQAT AKTIV (inactive emas) mahsulotlarni ko'rsatish
   let filteredProducts = products.filter(p => p.status !== 'inactive');

   if (filter !== 'all') {
       filteredProducts = filteredProducts.filter(p => p.category === filter);
   }

   if (searchTerm) {
       const term = searchTerm.toLowerCase();
       filteredProducts = filteredProducts.filter(p => 
           p.nameRu.toLowerCase().includes(term) ||
           p.nameUz.toLowerCase().includes(term) ||
           p.nameEn.toLowerCase().includes(term)
       );
   }

   if (filteredProducts.length === 0) {
       grid.innerHTML = `
           <div class="no-results">
               <i class="fas fa-search"></i>
               <p>${currentLang === 'uz' ? 'Mahsulot topilmadi' : currentLang === 'ru' ? 'Товары не найдены' : 'No products found'}</p>
           </div>
       `;
       return;
   }

   const t = translations[currentLang];

   grid.innerHTML = filteredProducts.map(product => {
       const name = getProductName(product, currentLang);
       const retailPrice = formatPrice(product.prices.retail);
       const wholesalePrice = formatPrice(product.prices.wholesale);

       return `
       <div class="product-card" onclick="openProductModal(${product.id})">
           <div class="product-image">
               <img src="${product.image}" alt="${name}" loading="lazy" onerror="this.style.display='none'">
               <div class="product-badge" data-uz="Sotuvda" data-ru="В наличии" data-en="In stock">${t.inStock}</div>
           </div>
           <div class="product-info">
               <h3>${name}</h3>
               <div class="product-name-secondary">${currentLang === 'ru' ? product.nameUz : product.nameRu}</div>
               <div class="product-prices">
                   <div class="price-row">
                       <span class="price-label">${t.retail}:</span>
                       <span class="price-value">${retailPrice} ${t.currencySymbol}</span>
                   </div>
                   <div class="price-row wholesale">
                       <span class="price-label">${t.wholesale}:</span>
                       <span class="price-value wholesale">${wholesalePrice} ${t.currencySymbol}</span>
                   </div>
               </div>
               <div class="min-qty-info">
                   <i class="fas fa-box"></i> ${t.minQty}: ${product.minQty} kg
               </div>
               <button class="btn btn-red btn-sm" onclick="event.stopPropagation(); quickAddToCart(${product.id})">
                   <i class="fas fa-cart-plus"></i> ${t.addToCart}
               </button>
           </div>
       </div>
   `}).join('');
}


async function loadProductsFromAPI() {
    try {
        const response = await fetch('https://backend-production-c4f9.up.railway.app/api/products');
        if (!response.ok) throw new Error('API Error');
        
        const data = await response.json();
        const serverProducts = data.products || [];
        
        if (serverProducts.length === 0) {
            console.warn('⚠️ Server 0 ta mahsulot qaytardi');
            return;
        }
        
        // ✅ MERGE: Local dagilarni saqlab, serverdagilarni yangilash
        const localMap = new Map(products.map(p => [parseInt(p.id), p]));
        
        serverProducts.forEach(p => {
            localMap.set(parseInt(p.id), {
                id: parseInt(p.id),
                nameRu: p.name_ru,
                nameUz: p.name_uz,
                nameEn: p.name_en,
                category: p.category,
                image: p.image || '',
                prices: typeof p.prices === 'object' ? p.prices : (typeof p.prices === 'string' ? JSON.parse(p.prices) : {retail: 0, wholesale: 0}),
                minQty: p.min_qty || 1,
                descriptionRu: p.description_ru,
                descriptionUz: p.description_uz,
                descriptionEn: p.description_en,
                status: p.status || 'active'
            });
        });
        
        products = Array.from(localMap.values());
        localStorage.setItem('pharmegic_products', JSON.stringify(products));
        renderProducts();
        console.log('✅ Serverdan yangilandi. Jami:', products.length);
        
    } catch (error) {
        console.log('API xatosi:', error);
    }
}

function startCustomerSync() {
    // Har 30 sekundda yangilash
    customerSyncInterval = setInterval(() => {
        loadProductsFromAPI();
    }, 30000);
    
    // Sahifa ko'rinib turganida tez-tez tekshirish (Page Visibility API)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            // Sahifa yana ko'rinib qolganda darhol yangilash
            loadProductsFromAPI();
        }
    });
}

function filterProducts(category) {
   currentFilter = category;
   document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
   event.target.classList.add('active');
   renderProducts(category);
}

function searchProducts() {
   const searchTerm = document.getElementById('searchInput').value;
   renderProducts(currentFilter, searchTerm);
   document.getElementById('stock').scrollIntoView({ behavior: 'smooth' });
}

function searchProductsMobile() {
   const searchTerm = document.getElementById('mobileSearchInput').value;
   renderProducts(currentFilter, searchTerm);
   toggleMenu();
   document.getElementById('stock').scrollIntoView({ behavior: 'smooth' });
}

function quickAddToCart(productId) {
   // ID ni stringga aylantirish va solishtirish
   const id = String(productId);
   const product = products.find(p => String(p.id) === id);
   
   if (!product) {
       console.error('❌ Product not found for cart:', productId);
       showNotification('Mahsulot topilmadi', 'error');
       return;
   }

   const existingItem = cart.find(item => item.id === productId);
   const minQty = parseInt(product.minQty) || 1;

   if (existingItem) {
       existingItem.quantity = parseInt(existingItem.quantity) + minQty;
   } else {
       cart.push({
           id: product.id,
           nameRu: product.nameRu,
           nameUz: product.nameUz,
           nameEn: product.nameEn,
           price: product.prices.retail,
           wholesalePrice: product.prices.wholesale,
           quantity: minQty,
           minQty: minQty,
           image: product.image
       });
   }

   saveCart();
   updateCartUI();
   closeModal();
   toggleCart();
   showNotification(currentLang === 'uz' ? 'Savatga qo\'shildi' : currentLang === 'ru' ? 'Добавлено в корзину' : 'Added to cart');
}

function addToCart(productId, quantity) {
   const id = String(productId);
   const product = products.find(p => String(p.id) === id);
   
   if (!product) {
       console.error('❌ Product not found:', productId);
       return;
   }

   const qty = parseInt(quantity) || product.minQty;
   const existingItem = cart.find(item => item.id === productId);

   if (existingItem) {
       existingItem.quantity += qty;
   } else {
       cart.push({
           id: product.id,
           nameRu: product.nameRu,
           nameUz: product.nameUz,
           nameEn: product.nameEn,
           price: product.prices.retail,
           wholesalePrice: product.prices.wholesale,
           quantity: qty,
           minQty: product.minQty,
           image: product.image
       });
   }

   saveCart();
   updateCartUI();
   showNotification(currentLang === 'uz' ? 'Savatga qo\'shildi' : currentLang === 'ru' ? 'Добавлено в корзину' : 'Added to cart');
}

function updateCartUI() {
   const cartCount = document.getElementById('cartCount');
   const cartCountMobile = document.getElementById('cartCountMobile');
   const cartItems = document.getElementById('cartItems');
   const cartFooter = document.getElementById('cartFooter');
   const cartTotal = document.getElementById('cartTotal');
   const t = translations[currentLang];

   const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
   cartCount.textContent = totalItems;
   if (cartCountMobile) cartCountMobile.textContent = totalItems;

   if (cart.length === 0) {
       cartItems.innerHTML = `
           <div class="empty-cart">
               <i class="fas fa-shopping-cart"></i>
               <p>${t.emptyCart}</p>
           </div>
       `;
       cartFooter.style.display = 'none';
   } else {
       cartItems.innerHTML = cart.map(item => {
           const name = getProductName(item, currentLang);
           const itemTotal = item.quantity >= 25 ? item.wholesalePrice * item.quantity : item.price * item.quantity;
           const pricePerKg = item.quantity >= 25 ? item.wholesalePrice : item.price;

           return `
               <div class="cart-item">
                   <img src="${item.image}" alt="${name}" class="cart-item-image">
                   <div class="cart-item-details">
                       <h4>${name}</h4>
                       <div class="cart-item-price">${formatPrice(pricePerKg)} ${t.currencySymbol} × ${item.quantity}kg</div>
                       <div class="cart-item-total">${formatPrice(itemTotal)} ${t.currencySymbol}</div>
                   </div>
                   <div class="cart-item-actions">
                       <div class="quantity-control">
                           <button onclick="updateQuantity(${item.id}, -${item.minQty || 1})">-</button>
                           <span>${item.quantity}</span>
                           <button onclick="updateQuantity(${item.id}, ${item.minQty || 1})">+</button>
                       </div>
                       <button class="remove-btn" onclick="removeFromCart(${item.id})" title="${t.remove}">
                           <i class="fas fa-trash"></i>
                       </button>
                   </div>
               </div>
           `;
       }).join('');

       const total = cart.reduce((sum, item) => {
           return sum + (item.quantity >= 25 ? item.wholesalePrice * item.quantity : item.price * item.quantity);
       }, 0);

       cartTotal.textContent = `${formatPrice(total)} ${t.currencySymbol}`;
       cartFooter.style.display = 'block';
   }
}

function updateQuantity(productId, change) {
   const item = cart.find(item => item.id === productId);
   if (item) {
       const currentQty = parseInt(item.quantity) || 0;
       const changeQty = parseInt(change) || 0;
       const minQty = parseInt(item.minQty) || 1;

       item.quantity = currentQty + changeQty;

       if (item.quantity < minQty) {
           removeFromCart(productId);
       } else {
           saveCart();
           updateCartUI();
       }
   }
}

function removeFromCart(productId) {
   cart = cart.filter(item => item.id !== productId);
   saveCart();
   updateCartUI();
}

function toggleCart() {
   const sidebar = document.getElementById('cartSidebar');
   const overlay = document.getElementById('cartOverlay');
   sidebar.classList.toggle('active');
   overlay.classList.toggle('active');
   document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
}

function saveCart() {
   localStorage.setItem('pharmegic_cart', JSON.stringify(cart));
}

function loadCart() {
   const saved = localStorage.getItem('pharmegic_cart');
   if (saved) {
       cart = JSON.parse(saved);
   }
}

function openProductModal(productId) {
   // ID larni stringga aylantirib solishtirish (xavfsizroq)
   const id = String(productId);
   const product = products.find(p => String(p.id) === id);
   
   if (!product) {
       console.error('❌ Product not found:', productId);
       console.log('Available IDs:', products.map(p => p.id)); // Debug uchun
       showNotification('Mahsulot topilmadi', 'error');
       return;
   }
   
   const t = translations[currentLang];
   const name = getProductName(product, currentLang);
   const description = getProductDescription(product, currentLang);

   const modalBody = document.getElementById('modalBody');
   modalBody.innerHTML = `
       <div class="product-modal-layout">
           <div class="product-modal-image">
               <img src="${product.image}" alt="${name}">
           </div>
           <div class="product-modal-info">
               <h2 class="modal-product-name">${name}</h2>
               <div class="modal-product-subtitle">${currentLang === 'ru' ? product.nameUz : product.nameRu}</div>
               <div class="modal-product-description">${description}</div>

               <div class="modal-prices">
                   <div class="modal-price-row">
                       <span>${t.retail}:</span>
                       <strong>${formatPrice(product.prices.retail)} ${t.currencySymbol}</strong>
                   </div>
                   <div class="modal-price-row wholesale">
                       <span>${t.wholesale}:</span>
                       <strong style="color: var(--color-primary)">${formatPrice(product.prices.wholesale)} ${t.currencySymbol}</strong>
                   </div>
               </div>

               <div class="min-qty-info modal">
                   <i class="fas fa-info-circle"></i> ${t.minQty}: ${product.minQty} kg
               </div>

               <div class="quantity-selector">
                   <label>${t.quantity}:</label>
                   <div class="quantity-input-group">
                       <button onclick="adjustModalQuantity(-${product.minQty})">-</button>
                       <input type="number" id="modalQuantity" value="${product.minQty}" min="${product.minQty}" step="${product.minQty}" onchange="validateQuantity(this, ${product.minQty})">
                       <button onclick="adjustModalQuantity(${product.minQty})">+</button>
                   </div>
               </div>

               <div class="modal-buttons">
                   <button class="btn btn-red btn-large" onclick="addToCartFromModal(${product.id})">
                       <i class="fas fa-cart-plus"></i> ${t.addToCart}
                   </button>
               </div>

               <div class="stock-info">
                   <i class="fas fa-check-circle"></i>
                   <span>${t.inStock}</span>
               </div>
           </div>
       </div>
   `;

   document.getElementById('productModal').classList.add('active');
   document.body.style.overflow = 'hidden';
}

function adjustModalQuantity(change) {
   const input = document.getElementById('modalQuantity');
   let value = parseInt(input.value) + change;
   const min = parseInt(input.min);
   if (value < min) value = min;
   input.value = value;
}

function validateQuantity(input, min) {
   if (input.value < min) input.value = min;
}

function addToCartFromModal(productId) {
   const quantity = parseInt(document.getElementById('modalQuantity').value);
   addToCart(productId, quantity);
}

function closeModal() {
   document.getElementById('productModal').classList.remove('active');
   document.body.style.overflow = '';
}

function openUserTypeModal() {
   toggleCart();
   document.getElementById('userTypeModal').classList.add('active');
   document.body.style.overflow = 'hidden';
}

function closeUserTypeModal() {
   document.getElementById('userTypeModal').classList.remove('active');
   document.body.style.overflow = '';
}

function selectUserType(type) {
   selectedUserType = type;
   closeUserTypeModal();

   if (type === 'individual') {
       openIndividualCheckout();
   } else {
       openLegalCheckout();
   }
}

// JISMONIY SHAXS - Click to'lov
function openIndividualCheckout() {
   const t = translations[currentLang];
   const summary = document.getElementById('individualOrderSummary');

   const total = cart.reduce((sum, item) => {
       return sum + (item.quantity >= 25 ? item.wholesalePrice * item.quantity : item.price * item.quantity);
   }, 0);

   summary.innerHTML = `
       <h4>${currentLang === 'uz' ? 'Buyurtma tarkibi' : currentLang === 'ru' ? 'Состав заказа' : 'Order summary'}</h4>
       ${cart.map(item => {
           const name = getProductName(item, currentLang);
           const itemTotal = item.quantity >= 25 ? item.wholesalePrice * item.quantity : item.price * item.quantity;
           const pricePerKg = item.quantity >= 25 ? item.wholesalePrice : item.price;
           return `
               <div class="order-item">
                   <span>${name} (${item.quantity}kg × ${formatPrice(pricePerKg)} ${t.currencySymbol})</span>
                   <strong>${formatPrice(itemTotal)} ${t.currencySymbol}</strong>
               </div>
           `;
       }).join('')}
       <div class="order-total">
           <span>${t.total}</span>
           <strong>${formatPrice(total)} ${t.currencySymbol}</strong>
       </div>
   `;

   document.getElementById('individualCheckoutModal').classList.add('active');
   document.body.style.overflow = 'hidden';
}

function closeIndividualCheckout() {
   document.getElementById('individualCheckoutModal').classList.remove('active');
   document.body.style.overflow = '';
}

// ✅ JISMONIY SHAXS BUYURTMASI - To'g'ri yuborish
async function submitIndividualOrder(event) {
    event.preventDefault();

    const total = cart.reduce((sum, item) => {
        return sum + (item.quantity >= 25 ? item.wholesalePrice * item.quantity : item.price * item.quantity);
    }, 0);

    // ✅ TO'G'RI: userType = 'individual'
    const orderData = {
        customerName: document.getElementById('individualName').value,
        phone: document.getElementById('individualPhone').value,
        address: document.getElementById('individualAddress').value,
        comment: document.getElementById('individualComment').value,
        items: cart.map(item => ({
            name: getProductName(item, currentLang),
            quantity: item.quantity,
            price: item.quantity >= 25 ? item.wholesalePrice : item.price
        })),
        total: total,
        userType: 'individual'  // ✅ MUHIM: Jismoniy shaxs
    };

    console.log('📤 Sending individual order:', orderData);

    try {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'uz' ? 'Yuklanmoqda...' : 'Loading...');
        submitBtn.disabled = true;

        const response = await fetch('https://backend-production-c4f9.up.railway.app/api/orders/create-with-payment', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const data = await response.json();
        console.log('📥 Response:', data);

        if (data.success) {
            // Savatni tozalash
            cart = [];
            saveCart();
            updateCartUI();

            // LocalStorage ga saqlash (admin panel uchun)
            const orderForAdmin = {
                id: data.order_id,
                userType: 'individual',  // ✅ Jismoniy shaxs
                customer: orderData.customerName,
                phone: orderData.phone,
                address: orderData.address,
                comment: orderData.comment,
                items: orderData.items,
                total: total,
                paymentMethod: 'Click',
                status: 'new',
                paymentStatus: 'pending',
                date: new Date().toISOString()
            };

            const existingOrders = JSON.parse(localStorage.getItem('pharmegic_orders') || '[]');
            existingOrders.push(orderForAdmin);
            localStorage.setItem('pharmegic_orders', JSON.stringify(existingOrders));

            // Click to'lov sahifasiga o'tish
            if (data.payment_url) {
                window.location.href = data.payment_url;
            } else {
                showSuccessModal('individual');
            }
        } else {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            showNotification(data.error || 'Xatolik yuz berdi', 'error');
        }

    } catch (error) {
        console.error('Order error:', error);
        showNotification('Xatolik yuz berdi', 'error');
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.innerHTML = '<i class="fas fa-lock"></i> Buyurtma berish va to\'lov';
        submitBtn.disabled = false;
    }
}

// YURIDIK SHAXS - Dogovor
function openLegalCheckout() {
   const t = translations[currentLang];
   const summary = document.getElementById('legalOrderSummary');

   const total = cart.reduce((sum, item) => {
       return sum + (item.quantity >= 25 ? item.wholesalePrice * item.quantity : item.price * item.quantity);
   }, 0);

   summary.innerHTML = `
       <h4>${currentLang === 'uz' ? 'Buyurtma tarkibi' : currentLang === 'ru' ? 'Состав заказа' : 'Order summary'}</h4>
       ${cart.map(item => {
           const name = getProductName(item, currentLang);
           const itemTotal = item.quantity >= 25 ? item.wholesalePrice * item.quantity : item.price * item.quantity;
           const pricePerKg = item.quantity >= 25 ? item.wholesalePrice : item.price;
           return `
               <div class="order-item">
                   <span>${name} (${item.quantity}kg × ${formatPrice(pricePerKg)} ${t.currencySymbol})</span>
                   <strong>${formatPrice(itemTotal)} ${t.currencySymbol}</strong>
               </div>
           `;
       }).join('')}
       <div class="order-total">
           <span>${t.total}</span>
           <strong>${formatPrice(total)} ${t.currencySymbol}</strong>
       </div>
   `;

   document.getElementById('legalCheckoutModal').classList.add('active');
   document.body.style.overflow = 'hidden';
}

function closeLegalCheckout() {
   document.getElementById('legalCheckoutModal').classList.remove('active');
   document.body.style.overflow = '';
}

// ✅ YURIDIK SHAXS BUYURTMASI
async function submitLegalOrder(event) {
    event.preventDefault();

    const total = cart.reduce((sum, item) => {
        return sum + (item.quantity >= 25 ? item.wholesalePrice * item.quantity : item.price * item.quantity);
    }, 0);

    // ✅ TO'G'RI: userType = 'legal'
    const orderData = {
        customerName: document.getElementById('legalCompanyName').value,  // Kompaniya nomi
        phone: document.getElementById('legalPhone').value,
        address: document.getElementById('legalAddress').value,
        comment: document.getElementById('legalComment').value,
        items: cart.map(item => ({
            name: getProductName(item, currentLang),
            quantity: item.quantity,
            price: item.quantity >= 25 ? item.wholesalePrice : item.price
        })),
        total: total,
        userType: 'legal',  // ✅ MUHIM: Yuridik shaxs
        companyData: {
            inn: document.getElementById('legalInn').value,
            account: document.getElementById('legalAccount').value,
            bank: document.getElementById('legalBank').value,
            mfo: document.getElementById('legalMfo').value,
            director: document.getElementById('legalDirector').value,
            position: document.getElementById('legalPosition').value
        }
    };

    console.log('📤 Sending legal order:', orderData);

    try {
        const response = await fetch('https://backend-production-c4f9.up.railway.app/api/orders/create-with-payment', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const data = await response.json();
        console.log('📥 Response:', data);

        if (data.success) {
            // Savatni tozalash
            cart = [];
            saveCart();
            updateCartUI();

            // LocalStorage ga saqlash
            const orderForAdmin = {
                id: data.order_id,
                userType: 'legal',
                customer: orderData.customerName,
                phone: orderData.phone,
                address: orderData.address,
                comment: orderData.comment,
                items: orderData.items,
                total: total,
                paymentMethod: "Bank o'tkazmasi (Dogovor)",
                status: 'new',
                companyName: orderData.customerName,
                inn: orderData.companyData.inn,
                account: orderData.companyData.account,
                bank: orderData.companyData.bank,
                mfo: orderData.companyData.mfo,
                director: orderData.companyData.director,
                date: new Date().toISOString()
            };

            const existingOrders = JSON.parse(localStorage.getItem('pharmegic_orders') || '[]');
            existingOrders.push(orderForAdmin);
            localStorage.setItem('pharmegic_orders', JSON.stringify(existingOrders));

            closeLegalCheckout();
            showSuccessModal('legal');
        } else {
            showNotification(data.error || 'Xatolik yuz berdi', 'error');
        }
    } catch (error) {
        console.error('Order error:', error);
        showNotification('Xatolik yuz berdi', 'error');
    }
}

function showSuccessModal(userType) {
    const message = userType === 'legal'
        ? (currentLang === 'uz' ? "Dogovor va hisob-faktura telefon orqali yuboriladi. Tez orada siz bilan bog'lanamiz." : 
           currentLang === 'ru' ? "Договор и счет-фактура будут отправлены по телефону. Мы скоро с вами свяжемся." : 
           "Contract and invoice will be sent via phone. We will contact you soon.")
        : (currentLang === 'uz' ? "To'lov sahifasiga yo'naltirilmoqda..." : 
           currentLang === 'ru' ? "Перенаправление на страницу оплаты..." : 
           "Redirecting to payment page...");

    document.getElementById('successMessage').textContent = message;
    document.getElementById('successModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSuccessModal() {
   document.getElementById('successModal').classList.remove('active');
   document.body.style.overflow = '';
}

async function submitSourcingRequest(event) {
    event.preventDefault();

    const requestData = {
        product: document.getElementById('sourcingProduct').value.trim(),
        quantity: document.getElementById('sourcingQuantity').value,
        company: document.getElementById('sourcingCompany').value.trim(),
        phone: document.getElementById('sourcingPhone').value.trim()
    };

    // Validatsiya
    if (!requestData.product || !requestData.company || !requestData.phone) {
        showNotification(currentLang === 'uz' ? 'Barcha maydonlarni to\'ldiring' : 'Заполните все поля', 'error');
        return;
    }

    try {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'uz' ? 'Yuborilmoqda...' : 'Отправка...');
        submitBtn.disabled = true;

        const response = await fetch('https://backend-production-c4f9.up.railway.app/api/sourcing', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('sourcingForm').reset();
            showNotification(
                currentLang === 'uz' ? 'So\'rov yuborildi!' : 
                currentLang === 'ru' ? 'Запрос отправлен!' : 
                'Request sent!', 
                'success'
            );
        } else {
            showNotification(data.error || 'Xatolik yuz berdi', 'error');
        }

    } catch (error) {
        console.error('Sourcing error:', error);
        // Fallback: localStorage ga saqlash (offline rejim)
        const fallbackData = {
            id: 'SRC-' + Date.now(),
            product: requestData.product,
            quantity: requestData.quantity,
            company: requestData.company,
            phone: requestData.phone,
            status: 'new',
            date: new Date().toISOString()
        };
        
        try {
            const existing = JSON.parse(localStorage.getItem('pharmegic_sourcing') || '[]');
            existing.push(fallbackData);
            localStorage.setItem('pharmegic_sourcing', JSON.stringify(existing));
        } catch (e) {}
        
        showNotification('Server bilan aloqa yo\'q, mahalliy saqlangan', 'warning');
    } finally {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = currentLang === 'uz' ? 'So\'rov yuborish' : currentLang === 'ru' ? 'Отправить запрос' : 'Send request';
            submitBtn.disabled = false;
        }
    }
}

function setLang(lang) {
   currentLang = lang;

   document.querySelectorAll('.lang-btn').forEach(btn => {
       btn.classList.remove('active');
       if(btn.textContent.toLowerCase() === lang) btn.classList.add('active');
   });

   document.querySelectorAll('[data-uz]').forEach(el => {
       if (el.getAttribute(`data-${lang}`)) {
           el.textContent = el.getAttribute(`data-${lang}`);
       }
   });

   document.querySelectorAll(`[data-${lang}-placeholder]`).forEach(el => {
       el.placeholder = el.getAttribute(`data-${lang}-placeholder`);
   });

   const searchInput = document.getElementById('searchInput');
   if (searchInput && translations[lang]) {
       searchInput.placeholder = translations[lang].searchPlaceholder;
   }

   renderProducts(currentFilter);
   updateCartUI();
   localStorage.setItem('lang', lang);
}

// ==================== TELEGRAM WEB APP INTEGRATION ====================
let tg = null;
let isTelegram = false;

function initTelegramWebApp() {
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        isTelegram = true;

        // Initialize
        tg.ready();
        tg.expand();

        // Theme setup
        tg.setHeaderColor('#C40000');
        tg.setBackgroundColor('#ffffff');

        // BackButton handler
        tg.BackButton.onClick(() => {
            // Close any open modal
            closeModal();
            closeUserTypeModal();
            closeIndividualCheckout();
            closeLegalCheckout();
            closeSuccessModal();
            tg.BackButton.hide();
        });

        console.log('✅ Telegram WebApp initialized');
    }
}

// MainButton update for cart
function updateTelegramMainButton() {
    if (!tg) return;

    if (cart.length > 0) {
        const total = cart.reduce((sum, item) => {
            return sum + (item.quantity >= 25 ? item.wholesalePrice * item.quantity : item.price * item.quantity);
        }, 0);

        tg.MainButton.setParams({
            text: `${getTranslation('placeOrder')} (${formatPrice(total)} ${translations[currentLang].currencySymbol})`,
            color: '#C40000',
            textColor: '#ffffff',
            is_visible: true
        });
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}

// Override original updateCartUI to include Telegram MainButton
const originalUpdateCartUI = updateCartUI;
updateCartUI = function() {
    originalUpdateCartUI();
    updateTelegramMainButton();
};

// MainButton click handler
if (tg) {
    tg.MainButton.onClick(() => {
        if (cart.length > 0) {
            openUserTypeModal();
        }
    });
}

// Helper for Telegram button text
function getTranslation(key) {
    const texts = {
        uz: { placeOrder: 'Buyurtma berish' },
        ru: { placeOrder: 'Оформить заказ' },
        en: { placeOrder: 'Place order' }
    };
    return texts[currentLang]?.placeOrder || 'Buyurtma berish';
}

// Override modal functions to show/hide BackButton
const originalOpenProductModal = openProductModal;
openProductModal = function(productId) {
    originalOpenProductModal(productId);
    if (tg) tg.BackButton.show();
};

const originalCloseModal = closeModal;
closeModal = function() {
    originalCloseModal();
    if (tg) tg.BackButton.hide();
};

const originalOpenUserTypeModal = openUserTypeModal;
openUserTypeModal = function() {
    originalOpenUserTypeModal();
    if (tg) tg.BackButton.show();
};

const originalCloseUserTypeModal = closeUserTypeModal;
closeUserTypeModal = function() {
    originalCloseUserTypeModal();
    if (tg) tg.BackButton.hide();
};

const originalOpenIndividualCheckout = openIndividualCheckout;
openIndividualCheckout = function() {
    originalOpenIndividualCheckout();
    if (tg) tg.BackButton.show();
};

const originalCloseIndividualCheckout = closeIndividualCheckout;
closeIndividualCheckout = function() {
    originalCloseIndividualCheckout();
    if (tg) tg.BackButton.hide();
};

const originalOpenLegalCheckout = openLegalCheckout;
openLegalCheckout = function() {
    originalOpenLegalCheckout();
    if (tg) tg.BackButton.show();
};

const originalCloseLegalCheckout = closeLegalCheckout;
closeLegalCheckout = function() {
    originalCloseLegalCheckout();
    if (tg) tg.BackButton.hide();
};

const originalShowSuccessModal = showSuccessModal;
showSuccessModal = function(userType) {
    originalShowSuccessModal(userType);
    if (tg) tg.BackButton.hide();
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initTelegramWebApp();
});



function toggleMenu() {
   document.getElementById('mobileMenu').classList.toggle('active');
   document.body.style.overflow = document.getElementById('mobileMenu').classList.contains('active') ? 'hidden' : '';
}

function showNotification(message, type = 'success') {
   const notification = document.createElement('div');
   notification.className = 'notification';
   notification.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i> ${message}`;
   document.body.appendChild(notification);

   setTimeout(() => notification.classList.add('show'), 100);
   setTimeout(() => {
       notification.classList.remove('show');
       setTimeout(() => notification.remove(), 300);
   }, 3000);
}

// Event listeners
document.getElementById('productModal').addEventListener('click', (e) => {
   if (e.target === e.currentTarget) closeModal();
});

document.getElementById('userTypeModal').addEventListener('click', (e) => {
   if (e.target === e.currentTarget) closeUserTypeModal();
});

document.getElementById('individualCheckoutModal').addEventListener('click', (e) => {
   if (e.target === e.currentTarget) closeIndividualCheckout();
});

document.getElementById('legalCheckoutModal').addEventListener('click', (e) => {
   if (e.target === e.currentTarget) closeLegalCheckout();
});

document.getElementById('successModal').addEventListener('click', (e) => {
   if (e.target === e.currentTarget) closeSuccessModal();
});

document.addEventListener('keydown', (e) => {
   if (e.key === 'Escape') {
       closeModal();
       closeUserTypeModal();
       closeIndividualCheckout();
       closeLegalCheckout();
       closeSuccessModal();
       if (document.getElementById('cartSidebar').classList.contains('active')) {
           toggleCart();
       }
   }
});

document.getElementById('searchInput').addEventListener('keypress', (e) => {
   if (e.key === 'Enter') searchProducts();
});

const savedLang = localStorage.getItem('lang');
if (savedLang) setLang(savedLang);