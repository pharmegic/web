

// Placeholder SVG - lokal data URI
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27400%27 height=%27300%27%3E%3Crect width=%27400%27 height=%27300%27 fill=%27%23f0f0f0%27/%3E%3Ctext x=%2750%25%27 y=%2750%25%27 font-family=%27Arial%27 font-size=%2718%27 fill=%27%23999%27 text-anchor=%27middle%27 dy=%27.3em%27%3ERasm yo%27q%3C/text%3E%3C/svg%3E';

const PLACEHOLDER_IMAGE_SMALL = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27200%27 height=%27200%27%3E%3Crect width=%27200%27 height=%27200%27 fill=%27%23f1f5f9%27/%3E%3Ctext x=%2750%25%27 y=%2750%25%27 font-family=%27Arial%27 font-size=%2714%27 fill=%27%2394a3b8%27 text-anchor=%27middle%27 dy=%27.3em%27%3ERasm yo%27q%3C/text%3E%3C/svg%3E';

// Boshlang'ich mahsulotlarni localStorage ga import qilish

function importInitialProducts() {
    const stored = localStorage.getItem('pharmegic_products');
    
    if (!stored) {
        console.log('📦 Importing initial products to localStorage...');
        localStorage.setItem('pharmegic_products', JSON.stringify(INITIAL_PRODUCTS));
        return INITIAL_PRODUCTS;
    }
    
    try {
        const storedProducts = JSON.parse(stored);
        if (!Array.isArray(storedProducts)) {
            localStorage.setItem('pharmegic_products', JSON.stringify(INITIAL_PRODUCTS));
            return INITIAL_PRODUCTS;
        }
        
        // ✅ MERGE: INITIAL_PRODUCTS dagilar yo'qolsa, qayta tiklash
        const storedMap = new Map(storedProducts.map(p => [parseInt(p.id), p]));
        let changed = false;
        
        INITIAL_PRODUCTS.forEach(initProduct => {
            const id = parseInt(initProduct.id);
            if (!storedMap.has(id)) {
                storedMap.set(id, initProduct);
                changed = true;
            }
        });
        
        const merged = Array.from(storedMap.values()).sort((a, b) => a.id - b.id);
        
        if (changed) {
            console.log('📦 Yo\'qolgan mahsulotlar tiklandi. Jami:', merged.length);
            localStorage.setItem('pharmegic_products', JSON.stringify(merged));
        }
        
        return merged;
        
    } catch (e) {
        console.error('localStorage xato:', e);
        localStorage.setItem('pharmegic_products', JSON.stringify(INITIAL_PRODUCTS));
        return INITIAL_PRODUCTS;
    }
}

// PHARMEGIC Admin Panel JavaScript
// Products Management + Orders Management

const API_BASE_URL = 'https://backend-production-c4f9.up.railway.app';

let currentSection = 'dashboard';
let ordersData = [];
let sourcingData = [];
let productsData = []; // Bu boshlanishida bo'sh
let notifications = [];
let charts = {};
let sidebarOpen = false;
let editingProductId = null;
let lastSyncTime = 0;
let syncInterval = null;
let currentAdminId = Math.random().toString(36).substr(2, 9);
let isSyncing = false;
let initialLoadComplete = false;
let tg = null;
let isTelegramWebApp = false;


document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Admin panel yuklanmoqda...');
    
    // lastSync tekshirish
    const storedLastSync = localStorage.getItem('lastSyncTime');
    if (storedLastSync && parseInt(storedLastSync) > Date.now()) {
        localStorage.removeItem('lastSyncTime');
    }
    
    // MAHSULOTLAR — faqat API dan yuklash
    loadProductsFromAPI().then(() => {
        startRealTimeSync(); // <--- FAQAT SHU YERDA 1 marta
    });
    
    renderProductsTable();   // loading ko'rsatadi
    updateProductStats();
    
    // BUYURTMALAR
    loadOrdersFromLocalStorage();
    loadOrdersFromAPI();
    
    // TOPIB BERISH
    loadSourcingRequests();
    
    // Boshqa modullar
    initCharts();
    setupEventListeners();
    
    // Storage listenerlar
    window.addEventListener('storage', (e) => {
        if (e.key === 'pharmegic_products') {
            console.log('🔄 Boshqa tabda mahsulot o\'zgarishi aniqlandi');
            const newData = localStorage.getItem('pharmegic_products');
            if (newData) {
                try {
                    productsData = JSON.parse(newData);
                    renderProductsTable();
                    updateProductStats();
                } catch (err) {
                    console.error('Storage parse xato:', err);
                }
            }
        }
        
        if (e.key === 'pharmegic_orders') {
            console.log('🔄 Boshqa tabda buyurtma o\'zgarishi aniqlandi');
            loadOrdersFromLocalStorage();
        }
    });
    
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    console.log('✅ Admin panel yuklandi');
});

async function loadProductsFromAPI() {
    try {
        console.log('🔄 API dan mahsulotlar yuklanmoqda...');
        const response = await fetch(`${API_BASE_URL}/api/products`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const serverProducts = data.products || [];
        
        console.log('📥 Serverdan keldi:', serverProducts.length, 'ta mahsulot');
        
        if (serverProducts.length > 0) {
            // ✅ TO'G'RILANDI: Merge qilish, to'liq almashtirish emas
            const localMap = new Map(productsData.map(p => [parseInt(p.id), p]));
            
            serverProducts.forEach(p => {
                const id = parseInt(p.id);
                localMap.set(id, {
                    id: id,
                    nameUz: p.name_uz || '',
                    nameRu: p.name_ru || '',
                    nameEn: p.name_en || '',
                    category: p.category || 'other',
                    prices: typeof p.prices === 'object' ? p.prices : {retail: 0, wholesale: 0},
                    minQty: p.min_qty || 1,
                    descriptionUz: p.description_uz || '',
                    descriptionRu: p.description_ru || '',
                    descriptionEn: p.description_en || '',
                    image: p.image || PLACEHOLDER_IMAGE,
                    status: p.status || 'active',
                    updatedAt: p.updated_at || new Date().toISOString()
                });
            });
            
            productsData = Array.from(localMap.values()).sort((a, b) => a.id - b.id);
            
            localStorage.setItem('pharmegic_products', JSON.stringify(productsData));
            lastSyncTime = data.serverTime || Date.now();
            localStorage.setItem('lastSyncTime', lastSyncTime);
            
            renderProductsTable();
            updateStats();
            updateProductStats();
            console.log('✅ Merge qilindi. Jami:', productsData.length, 'ta');
        } else {
            console.warn('⚠️ Server 0 ta mahsulot qaytardi, local saqlanmoqda');
        }
    } catch (error) {
        console.error('❌ API xato:', error);
    }
}


function initTelegramAdmin() {
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        isTelegramWebApp = true;
        
        tg.ready();
        tg.expand();
        
        // Theme colors
        tg.setHeaderColor('#C40000');
        tg.setBackgroundColor('#ffffff');
        
        console.log('✅ Admin panel Telegram Web App mode');
        
        // Back button
        tg.BackButton.onClick(() => {
            // Asosiy sahifaga qaytish
            showSection('dashboard');
            tg.BackButton.hide();
        });
    }
}

async function syncProductsFromServer(force = false) {
    if (isSyncing) return;
    isSyncing = true;
    
    const syncStatus = document.getElementById('lastSyncTime');
    if (syncStatus) syncStatus.textContent = 'Yangilanmoqda...';
    
    try {
        let url = `${API_BASE_URL}/api/products`;
        if (lastSyncTime > 0 && !force) {
            url += `?lastSync=${lastSyncTime}`;
        }
        
        console.log('🔄 Serverdan yuklanmoqda:', url);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const serverProducts = data.products || [];
        
        console.log('📥 Serverdan keldi:', serverProducts.length, 'ta mahsulot');
        
        if (serverProducts.length > 0) {
            // ✅ TO'G'RILANDI: Merge qilish (server yangiligini ustunlik bilan)
            const localMap = new Map(productsData.map(p => [parseInt(p.id), p]));
            
            serverProducts.forEach(p => {
                const id = parseInt(p.id);
                localMap.set(id, {
                    id: id,
                    nameUz: p.name_uz || '',
                    nameRu: p.name_ru || '',
                    nameEn: p.name_en || '',
                    category: p.category || 'other',
                    prices: typeof p.prices === 'object' ? p.prices : (typeof p.prices === 'string' ? JSON.parse(p.prices) : {retail: 0, wholesale: 0}),
                    minQty: p.min_qty || 1,
                    descriptionUz: p.description_uz || '',
                    descriptionRu: p.description_ru || '',
                    descriptionEn: p.description_en || '',
                    image: p.image || PLACEHOLDER_IMAGE,
                    status: p.status || 'active',
                    updatedAt: p.updated_at || new Date().toISOString()
                });
            });
            
            productsData = Array.from(localMap.values()).sort((a, b) => a.id - b.id);
            
            localStorage.setItem('pharmegic_products', JSON.stringify(productsData));
            lastSyncTime = data.serverTime || Date.now();
            localStorage.setItem('lastSyncTime', lastSyncTime);
            
            renderProductsTable();
            updateStats();
            updateProductStats();
            console.log('✅ Real-time merge:', productsData.length, 'ta mahsulot');
        }
        
    } catch (error) {
        console.error('❌ Sync xato:', error);
    } finally {
        isSyncing = false;
        updateSyncStatus();
    }
}

// ============================================
// REAL-TIME SYNC FUNCTIONS
// ============================================

// Boshqa adminlar o'zgartirganda xabar ko'rsatish
function showSyncNotification(changesCount, changeType = 'update') {
    let message = '';
    
    if (changeType === 'new') {
        message = changesCount === 1 
            ? 'Yangi mahsulot qo\'shildi' 
            : `${changesCount} ta yangi mahsulot qo\'shildi`;
    } else if (changeType === 'delete') {
        message = 'Mahsulot o\'chirildi';
    } else {
        message = changesCount === 1 
            ? 'Boshqa admin tomonidan 1 ta o\'zgarish kiritildi' 
            : `Boshqa adminlar tomonidan ${changesCount} ta o'zgarish kiritildi`;
    }
    
    showNotification(message, 'info');
    
    // Agar products section ochiq bo'lsa, avtomatik yangilash
    if (currentSection === 'products') {
        renderProductsTable();
    }
}



function startRealTimeSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
        syncProductsFromServer();
    }, 5000);
    console.log('🔄 Real-time sync started');
}

// Sinxronizatsiya vaqtini ko'rsatish
function updateSyncStatus() {
    const statusEl = document.getElementById('lastSyncTime');
    if (statusEl) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        statusEl.textContent = `So'nggi yangilanish: ${timeStr}`;
        
        const icon = document.querySelector('#syncStatus i');
        if (icon) {
            icon.classList.add('fa-spin');
            setTimeout(() => icon.classList.remove('fa-spin'), 1000);
        }
    }
}

// admin.js da mahsulotlarni faqat API dan yuklash
async function loadProducts() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/products`);
        if (!response.ok) throw new Error('API Error');
        
        const data = await response.json();
        productsData = data.products.map(p => ({
            id: p.id,
            nameUz: p.name_uz,
            nameRu: p.name_ru,
            nameEn: p.name_en,
            category: p.category,
            prices: typeof p.prices === 'string' ? JSON.parse(p.prices) : p.prices,
            minQty: p.min_qty,
            descriptionUz: p.description_uz,
            descriptionRu: p.description_ru,
            descriptionEn: p.description_en,
            image: p.image,
            status: p.status || 'active',
            updatedAt: p.updated_at || new Date().toISOString()
        }));
        
        localStorage.setItem('pharmegic_products', JSON.stringify(productsData));
        renderProductsTable();
        updateProductStats();
        
    } catch (error) {
        console.error('❌ Products load error:', error);
        // Fallback: localStorage dan o'qish
        const stored = localStorage.getItem('pharmegic_products');
        if (stored) {
            productsData = JSON.parse(stored);
            renderProductsTable();
        }
    }
}

// API dan mahsulotlarni yuklash
async function fetchProductsFromAPI() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/products`);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log('ℹ️ API endpoint not ready, using localStorage only');
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const apiProducts = data.products || [];
        
        if (apiProducts.length > 0) {
            const localProducts = JSON.parse(localStorage.getItem('pharmegic_products') || '[]');
            
            apiProducts.forEach(apiProduct => {
                const exists = localProducts.find(p => p.id === apiProduct.id);
                if (!exists) {
                    localProducts.push({
                        id: apiProduct.id,
                        nameUz: apiProduct.name_uz,
                        nameRu: apiProduct.name_ru,
                        nameEn: apiProduct.name_en,
                        category: apiProduct.category,
                        prices: typeof apiProduct.prices === 'string' ? JSON.parse(apiProduct.prices) : apiProduct.prices,
                        minQty: apiProduct.min_qty,
                        descriptionUz: apiProduct.description_uz,
                        descriptionRu: apiProduct.description_ru,
                        descriptionEn: apiProduct.description_en,
                        image: apiProduct.image || PLACEHOLDER_IMAGE,
                        status: apiProduct.status,
                        updatedAt: apiProduct.updated_at
                    });
                }
            });
            
            productsData = localProducts;
            localStorage.setItem('pharmegic_products', JSON.stringify(productsData));
            renderProductsTable();
        }
    } catch (error) {
        console.log('ℹ️ API products fetch failed, using localStorage only:', error.message);
    }
}

function renderProductsTable() {
    const grid = document.getElementById('productsCardsGrid');
    
    if (!grid) {
        console.error('❌ productsCardsGrid elementi topilmadi!');
        return;
    }
    
    // Agar productsData bo'sh bo'lsa
    if (!productsData || !Array.isArray(productsData) || productsData.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #ddd; margin-bottom: 20px;"></i>
                <h3 style="color: #666;">Ma'lumotlar yuklanmoqda...</h3>
                <p style="color: #999;">Iltimos, kuting</p>
            </div>
        `;
        return;
    }

    console.log('🎨 Render qilinmoqda:', productsData.length, 'ta mahsulot');
    
    grid.innerHTML = productsData.map(product => {
        // Xavfsizlik tekshiruvi
        if (!product) return '';
        
        const isActive = product.status === 'active';
        const statusClass = isActive ? 'active' : 'inactive';
        const statusText = isActive ? 'Faol' : 'To\'xtatilgan';
        const toggleClass = isActive ? '' : 'active';
        const toggleIcon = isActive ? 'pause' : 'play';
        const toggleText = isActive ? 'To\'xtatish' : 'Faollashtirish';
        const productId = parseInt(product.id) || 0;
        
        // ✅ PLACEHOLDER o'rniga data URI ishlatish
        const imageUrl = product.image || PLACEHOLDER_IMAGE;
        
        return `
        <div class="product-card">
            <div class="product-card-image">
                <img src="${imageUrl}" 
                     alt="${product.nameUz || ''}" 
                     onerror="this.src='${PLACEHOLDER_IMAGE}'">
                <span class="product-card-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="product-card-body">
                <h3 class="product-card-title">${product.nameUz || 'Nomsiz'}</h3>
                <div class="product-card-subtitle">${product.nameRu || ''}</div>
                <span class="product-card-category">${getCategoryName(product.category)}</span>
                
                <div class="product-card-prices">
                    <div class="price-item">
                        <span class="price-label">Chakana</span>
                        <span class="price-value">${formatPrice(product.prices?.retail || 0)} so'm</span>
                    </div>
                    <div class="price-item">
                        <span class="price-label">Ulgurji</span>
                        <span class="price-value wholesale">${formatPrice(product.prices?.wholesale || 0)} so'm</span>
                    </div>
                </div>
                
                <div class="product-card-min-qty">
                    <i class="fas fa-box"></i>
                    <span>Min. miqdor: ${product.minQty || 1} kg</span>
                </div>
                
                <div class="product-card-actions">
                    <button type="button" class="product-card-btn edit" onclick="editProduct(${productId})">
                        <i class="fas fa-edit"></i>
                        <span>Tahrirlash</span>
                    </button>
                    <button type="button" class="product-card-btn toggle ${toggleClass}" onclick="toggleProductStatus(${productId})">
                        <i class="fas fa-${toggleIcon}"></i>
                        <span>${toggleText}</span>
                    </button>
                    <button type="button" class="product-card-btn delete" onclick="deleteProduct(${productId})">
                        <i class="fas fa-trash"></i>
                        <span>O'chirish</span>
                    </button>
                </div>
            </div>
        </div>
    `}).join('');
}

// FILTER FUNKSiyasi - kartochkalar uchun
function filterProductsCards() {
    const filter = document.getElementById('productsFilter').value;
    const search = document.getElementById('productsSearch').value.toLowerCase();
    
    let filtered = productsData;
    
    if (filter !== 'all') {
        filtered = filtered.filter(p => p.category === filter);
    }
    
    if (search) {
        filtered = filtered.filter(p => 
            (p.nameUz && p.nameUz.toLowerCase().includes(search)) ||
            (p.nameRu && p.nameRu.toLowerCase().includes(search)) ||
            (p.nameEn && p.nameEn.toLowerCase().includes(search))
        );
    }
    
    const grid = document.getElementById('productsCardsGrid');
    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; padding: 60px 20px;">
            <i class="fas fa-search" style="font-size: 48px; color: #ddd; margin-bottom: 16px;"></i>
            <p>Mahsulotlar topilmadi</p>
        </div>`;
        return;
    }
    
    grid.innerHTML = filtered.map(product => {
        const isActive = product.status === 'active';
        const statusClass = isActive ? 'active' : 'inactive';
        const statusText = isActive ? 'Faol' : 'To\'xtatilgan';
        const toggleClass = isActive ? '' : 'active';
        const toggleIcon = isActive ? 'pause' : 'play';
        const toggleText = isActive ? 'To\'xtatish' : 'Faollashtirish';
        const productId = parseInt(product.id);
        
        // ✅ PLACEHOLDER o'rniga data URI ishlatish
        const imageUrl = product.image || PLACEHOLDER_IMAGE;
        
        return `
        <div class="product-card">
            <div class="product-card-image">
                <img src="${imageUrl}" 
                     alt="${product.nameUz || ''}" 
                     onerror="this.src='${PLACEHOLDER_IMAGE}'">
                <span class="product-card-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="product-card-body">
                <h3 class="product-card-title">${product.nameUz || ''}</h3>
                <div class="product-card-subtitle">${product.nameRu || ''}</div>
                <span class="product-card-category">${getCategoryName(product.category)}</span>
                
                <div class="product-card-prices">
                    <div class="price-item">
                        <span class="price-label">Chakana</span>
                        <span class="price-value">${formatPrice(product.prices?.retail || 0)} so'm</span>
                    </div>
                    <div class="price-item">
                        <span class="price-label">Ulgurji</span>
                        <span class="price-value wholesale">${formatPrice(product.prices?.wholesale || 0)} so'm</span>
                    </div>
                </div>
                
                <div class="product-card-min-qty">
                    <i class="fas fa-box"></i>
                    <span>Min. miqdor: ${product.minQty || 1} kg</span>
                </div>
                
                <div class="product-card-actions">
                    <button type="button" class="product-card-btn edit" onclick="editProduct(${productId})">
                        <i class="fas fa-edit"></i>
                        <span>Tahrirlash</span>
                    </button>
                    <button type="button" class="product-card-btn toggle ${toggleClass}" onclick="toggleProductStatus(${productId})">
                        <i class="fas fa-${toggleIcon}"></i>
                        <span>${toggleText}</span>
                    </button>
                    <button type="button" class="product-card-btn delete" onclick="deleteProduct(${productId})">
                        <i class="fas fa-trash"></i>
                        <span>O'chirish</span>
                    </button>
                </div>
            </div>
        </div>
    `}).join('');
}

// Kategoriya nomini olish
function getCategoryName(category) {
    const names = {
        'oil': 'Moylar',
        'chemical': 'Kimyoviy',
        'excipient': 'Yordamchi',
        'vitamin': 'Vitaminlar',
        'mineral': 'Mineral',
        'other': 'Boshqa'
    };
    return names[category] || category;
}

// Yangi mahsulot qo'shish modalini ochish
function showAddProductModal() {
    editingProductId = null;
    document.getElementById('productModalTitle').textContent = 'Yangi mahsulot qo\'shish';
    document.getElementById('productForm').reset();
    // ✅ PLACEHOLDER o'rniga data URI
    document.getElementById('productPreviewImage').src = PLACEHOLDER_IMAGE_SMALL;
    document.getElementById('productModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Mahsulotni tahrirlash
function editProduct(productId) {
    const id = parseInt(productId);
    const product = productsData.find(p => p.id == id);
    
    if (!product) {
        console.error('Product not found:', id);
        showNotification('Mahsulot topilmadi', 'error');
        return;
    }

    editingProductId = id;
    document.getElementById('productModalTitle').textContent = 'Mahsulotni tahrirlash';
    
    document.getElementById('prodNameUz').value = product.nameUz || '';
    document.getElementById('prodNameRu').value = product.nameRu || '';
    document.getElementById('prodNameEn').value = product.nameEn || '';
    document.getElementById('prodCategory').value = product.category || 'chemical';
    document.getElementById('prodRetailPrice').value = product.prices?.retail || 0;
    document.getElementById('prodWholesalePrice').value = product.prices?.wholesale || 0;
    document.getElementById('prodMinQty').value = product.minQty || 1;
    document.getElementById('prodDescUz').value = product.descriptionUz || '';
    document.getElementById('prodDescRu').value = product.descriptionRu || '';
    document.getElementById('prodDescEn').value = product.descriptionEn || '';
    document.getElementById('prodImage').value = product.image || '';
    document.getElementById('prodStatus').value = product.status || 'active';
    
    // ✅ PLACEHOLDER o'rniga data URI yoki mahsulot rasmi
    if (product.image) {
        document.getElementById('productPreviewImage').src = product.image;
    } else {
        document.getElementById('productPreviewImage').src = PLACEHOLDER_IMAGE_SMALL;
    }
    
    document.getElementById('productModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Mahsulotni saqlash (yangi yoki tahrirlash)
async function saveProduct(event) {
    event.preventDefault();
    
    const productId = editingProductId ? parseInt(editingProductId) : Date.now();
    
    const productData = {
        id: productId,
        nameUz: document.getElementById('prodNameUz').value.trim(),
        nameRu: document.getElementById('prodNameRu').value.trim(),
        nameEn: document.getElementById('prodNameEn').value.trim() || '',
        category: document.getElementById('prodCategory').value,
        prices: {
            retail: parseFloat(document.getElementById('prodRetailPrice').value) || 0,
            wholesale: parseFloat(document.getElementById('prodWholesalePrice').value) || 0
        },
        minQty: parseInt(document.getElementById('prodMinQty').value) || 1,
        descriptionUz: document.getElementById('prodDescUz').value.trim(),
        descriptionRu: document.getElementById('prodDescRu').value.trim(),
        descriptionEn: document.getElementById('prodDescEn').value.trim(),
        image: document.getElementById('prodImage').value.trim() || PLACEHOLDER_IMAGE,
        status: document.getElementById('prodStatus').value,
        updatedAt: new Date().toISOString()
    };
    
    console.log('💾 Saving product:', productData);
    
    try {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saqlanmoqda...';
        submitBtn.disabled = true;
        
        const response = await fetch(`${API_BASE_URL}/api/products`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(productData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Server error:', response.status, errorText);
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ Server response:', data);
        
        // ✅ TO'G'RI: Yangi array yaratish (mutatsiyasiz)
        if (editingProductId) {
            const index = productsData.findIndex(p => p.id == productId);
            if (index >= 0) {
                // Yangi array yaratamiz
                productsData = [
                    ...productsData.slice(0, index),
                    productData,
                    ...productsData.slice(index + 1)
                ];
            }
            showNotification('Mahsulot yangilandi!', 'success');
        } else {
            productsData = [...productsData, productData];
            showNotification('Yangi mahsulot qo\'shildi!', 'success');
        }
        
        // localStorage ga saqlash
        localStorage.setItem('pharmegic_products', JSON.stringify(productsData));
        localStorage.setItem('products_updated', Date.now().toString());
        
        renderProductsTable();
        updateStats();
        closeProductModal();
        
        // Tez sinxronizatsiya qilish (force=true bilan)
        setTimeout(() => syncProductsFromServer(true), 1000);
        
    } catch (error) {
        console.error('❌ Save error:', error);
        showNotification('Xatolik: ' + error.message, 'error');
    } finally {
        const submitBtn = event.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.innerHTML = editingProductId ? 
                '<i class="fas fa-save"></i> Saqlash' : 
                '<i class="fas fa-save"></i> Qo\'shish';
            submitBtn.disabled = false;
        }
    }
}

// TO'G'RILANGAN VERSION - ID solishtirishni tekshirish
async function toggleProductStatus(productId) {
    console.log('🔄 toggleProductStatus chaqirildi, ID:', productId, 'type:', typeof productId);
    
    // ID ni number ga aylantirish
    const id = parseInt(productId);
    
    const product = productsData.find(p => {
        const pid = parseInt(p.id);
        return pid === id;
    });
    
    if (!product) {
        console.error('❌ Product not found:', id);
        console.log('   Mavjud ID lar:', productsData.map(p => p.id));
        return;
    }
    
    console.log('✅ Product topildi:', product.nameUz, 'Status:', product.status);
    
    const newStatus = product.status === 'active' ? 'inactive' : 'active';
    console.log('   Yangi status:', newStatus);
    
    // API ga yuborish
    try {
        const response = await fetch(`${API_BASE_URL}/api/products`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                id: product.id, // Asl ID ni saqlash
                nameUz: product.nameUz || '',
                nameRu: product.nameRu || '',
                nameEn: product.nameEn || '',
                category: product.category || 'other',
                prices: product.prices || { retail: 0, wholesale: 0 },
                minQty: product.minQty || 1,
                descriptionUz: product.descriptionUz || '',
                descriptionRu: product.descriptionRu || '',
                descriptionEn: product.descriptionEn || '',
                image: product.image || PLACEHOLDER_IMAGE,
                status: newStatus
            })
        });

        console.log('📤 API javobi:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API xatosi:', response.status, errorText);
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ API muvaffaqiyatli:', data);

        // LocalStorage yangilash
        product.status = newStatus;
        product.updatedAt = new Date().toISOString();
        localStorage.setItem('pharmegic_products', JSON.stringify(productsData));
        
        // UI ni yangilash
        renderProductsTable();
        updateProductStats();
        
        const actionText = newStatus === 'active' ? 'faollashtirildi' : 'to\'xtatildi';
        showNotification(`Mahsulot ${actionText}!`, 'success');
        
        // Boshqa tablarga xabar yuborish
        localStorage.setItem('products_updated', Date.now().toString());
        
        // Tez sinxronizatsiya
        setTimeout(() => syncProductsFromServer(true), 1000);
        
    } catch (error) {
        console.error('❌ Toggle status xatosi:', error);
        
        // API ishlamasa, faqat localStorage yangilash
        product.status = newStatus;
        product.updatedAt = new Date().toISOString();
        localStorage.setItem('pharmegic_products', JSON.stringify(productsData));
        
        renderProductsTable();
        updateProductStats();
        showNotification(`Mahsulot ${newStatus === 'active' ? 'faollashtirildi' : 'to\'xtatildi'}! (offline)`, 'warning');
        
        localStorage.setItem('products_updated', Date.now().toString());
    }
}

// Mahsulotni o'chirish
async function deleteProduct(productId) {
    if (!confirm('Haqiqatan ham bu mahsulotni o\'chirmoqchimisiz?')) return;
    
    try {
        // API ga yuborish
        try {
            await fetch(`${API_BASE_URL}/api/products/${productId}`, {
                method: 'DELETE'
            });
        } catch (apiError) {
            console.log('API delete failed');
        }
        
        // LocalStorage dan o'chirish
        productsData = productsData.filter(p => p.id !== productId);
        localStorage.setItem('pharmegic_products', JSON.stringify(productsData));
        
        renderProductsTable();
        showNotification('Mahsulot o\'chirildi! Boshqa adminlar 5 soniyada ko\'radi', 'success');
        
        localStorage.setItem('products_updated', Date.now().toString());
        
        // Tez sinxronizatsiya
        setTimeout(() => syncProductsFromServer(true), 1000);
        
    } catch (error) {
        console.error('Delete product error:', error);
        showNotification('Xatolik yuz berdi', 'error');
    }
}

// Rasm preview yangilash
function updateImagePreview() {
    const url = document.getElementById('prodImage').value;
    if (url) {
        document.getElementById('productPreviewImage').src = url;
    } else {
        // ✅ PLACEHOLDER o'rniga data URI
        document.getElementById('productPreviewImage').src = PLACEHOLDER_IMAGE_SMALL;
    }
}

// Mahsulot modalini yopish
function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
    document.body.style.overflow = '';
    editingProductId = null;
}

// ============================================
// ORDERS MANAGEMENT
// ============================================

// Mobile Sidebar Toggle
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    sidebarOpen = !sidebarOpen;

    if (sidebarOpen) {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function closeSidebarOnMobile() {
    if (window.innerWidth <= 1024) {
        toggleSidebar();
    }
}

// Event Listeners
function setupEventListeners() {
    document.getElementById('orderModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeOrderModal();
    });
    
    document.getElementById('productModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeProductModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeOrderModal();
            closeProductModal();
            document.getElementById('notificationPanel').classList.remove('active');
            if (sidebarOpen) toggleSidebar();
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024 && sidebarOpen) {
            toggleSidebar();
        }
    });

    // Touch swipe
    let touchStartX = 0;
    let touchEndX = 0;

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, false);

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, false);

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchEndX - touchStartX;

        if (diff > swipeThreshold && touchStartX < 50 && !sidebarOpen) {
            toggleSidebar();
        }
        if (diff < -swipeThreshold && sidebarOpen) {
            toggleSidebar();
        }
    }
}

// Load all data
async function loadAllData() {
    console.log('🔄 Barcha ma\'lumotlarni yuklash...');
    
    try {
        await loadOrdersFromAPI().catch(err => console.error('Orders xatosi:', err));
        await loadSourcingRequests().catch(err => console.error('Sourcing xatosi:', err)); // ✅ Qo'shildi
        await loadProductsFromAPI().catch(err => console.error('Products xatosi:', err));
        
        updateStats();
        updateCharts();
        
        console.log('✅ Barcha ma\'lumotlar yuklandi');
    } catch (error) {
        console.error('❌ loadAllData xatosi:', error);
    }
}

// Admin faqat 1 marta qabul qiladi
async function approveOrder(orderId) {
    try {
        // Serverga yuborish (ichki try-catch bilan)
        let serverUpdated = false;
        try {
            const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Server xatosi:', response.status, errorData);
                showNotification(errorData.error || `Server xatosi: ${response.status}`, 'error');
            } else {
                serverUpdated = true;
                console.log('✅ Serverda qabul qilindi:', orderId);
            }
        } catch (apiError) {
            console.log('API ulanish xatosi:', apiError.message);
            showNotification('Server bilan aloqa yo\'q, faqat mahalliy yangilanmoqda', 'warning');
        }

        // Har bir holatda localStorage va UI ni yangilash
        updateLocalOrderStatus(orderId, 'completed');
        showNotification('Buyurtma qabul qilindi!', 'success');
        renderOrders();
        updateStats();
        closeOrderModal();
        
        addNotification({
            title: 'Buyurtma qabul qilindi',
            message: `Buyurtma #${orderId} muvaffaqiyatli qabul qilindi`,
            type: 'success'
        });

        // Agar server yangilanmagan bo'lsa, keyinroq sinxronizatsiya qilish
        if (!serverUpdated) {
            setTimeout(() => loadOrdersFromAPI(), 2000);
        }
        
    } catch (error) {
        console.error('Approve error:', error);
        showNotification('Xatolik yuz berdi: ' + error.message, 'error');
    }
}

function updateLocalOrderStatus(orderId, status) {
    try {
        const orders = JSON.parse(localStorage.getItem('pharmegic_orders') || '[]');
        const orderIndex = orders.findIndex(o => o.id === orderId);
        if (orderIndex >= 0) {
            orders[orderIndex].status = status;
            orders[orderIndex].updated_at = new Date().toISOString();
            localStorage.setItem('pharmegic_orders', JSON.stringify(orders));

            const globalIndex = ordersData.findIndex(o => o.id === orderId);
            if (globalIndex >= 0) {
                ordersData[globalIndex].status = status;
            }
        }
    } catch (error) {
        console.error('Update localStorage error:', error);
    }
}

async function loadOrdersFromAPI() {
    try {
        console.log('🔄 Buyurtmalarni API dan yuklash...');
        const response = await fetch(`${API_BASE_URL}/api/orders`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const apiOrders = await response.json();
        console.log('📥 API dan keldi:', apiOrders.length, 'ta buyurtma');

        if (apiOrders.length === 0) {
            console.log('ℹ️ API da buyurtmalar yo\'q');
            // Bo'sh bo'lsa ham statistikani yangilash
            ordersData = [];
            renderOrders();
            updateStats(); // BU QATOR MUHIM!
            return;
        }

        // API formatidan admin formatiga o'tkazish
        ordersData = apiOrders.map(order => {
            let parsedItems = order.items;
            if (typeof order.items === 'string') {
                try {
                    parsedItems = JSON.parse(order.items);
                } catch (e) {
                    parsedItems = [];
                }
            }
            
            return {
                id: order.order_id || order.id,
                userType: order.customer_type || 'individual',
                customer: order.customer_name || 'Noma\'lum',
                phone: order.phone || '',
                address: order.address || '',
                comment: order.comment || '',
                items: parsedItems || [],
                total: parseFloat(order.total) || 0,
                paymentMethod: order.payment_method || 'Click',
                status: order.status || 'new',
                date: order.created_at || new Date().toISOString(),
                companyName: order.company_name || order.customer_name,
                inn: order.inn || '',
                account: order.account || '',
                bank: order.bank || '',
                mfo: order.mfo || '',
                director: order.director || ''
            };
        });

        console.log('✅ ordersData yangilandi:', ordersData.length, 'ta');
        
        // localStorage ga saqlash
        localStorage.setItem('pharmegic_orders', JSON.stringify(ordersData));
        
        // UI ni yangilash
        renderOrders();
        updateStats(); // BU QATOR MUHIM!
        updateCharts();
        
    } catch (error) {
        console.error('❌ API xatosi:', error.message);
        // Xatolik bo'lsa ham statistikani yangilash
        updateStats();
    }
}

function loadOrdersFromLocalStorage() {
    try {
        const stored = localStorage.getItem('pharmegic_orders');
        if (stored) {
            ordersData = JSON.parse(stored);
            console.log('💾 LocalStorage dan buyurtmalar yuklandi:', ordersData.length, 'ta');
        } else {
            console.log('💾 LocalStorage da buyurtmalar yo\'q');
            ordersData = [];
        }
        
        // Har holatda UI ni yangilash
        renderOrders();
        updateStats(); // BU QATOR MUHIM!
        updateCharts();
        
    } catch (error) {
        console.error('❌ LocalStorage xatosi:', error);
        ordersData = [];
        updateStats(); // Xatolik bo'lsa ham statistikani yangilash
    }
}

function syncWithLocalStorage(apiOrders) {
    const localOrders = JSON.parse(localStorage.getItem('pharmegic_orders') || '[]');

    apiOrders.forEach(apiOrder => {
        const exists = localOrders.find(o => o.id === apiOrder.id);
        if (!exists) {
            localOrders.push(apiOrder);
        } else {
            const index = localOrders.findIndex(o => o.id === apiOrder.id);
            if (localOrders[index].status !== 'completed' && localOrders[index].status !== 'cancelled') {
                localOrders[index] = apiOrder;
            }
        }
    });

    localStorage.setItem('pharmegic_orders', JSON.stringify(localOrders));
}

async function loadSourcingRequests() {
    try {
        console.log('🔄 Sourcing so\'rovlarni yuklash...');
        
        // 1. Serverdan o'qish
        const response = await fetch(`${API_BASE_URL}/api/sourcing`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const serverData = await response.json();
        console.log('📥 Serverdan sourcing:', serverData.length, 'ta');
        
        // 2. Formatlash
        sourcingData = serverData.map(req => ({
            id: req.request_id,
            product: req.product,
            quantity: req.quantity,
            company: req.company,
            phone: req.phone,
            status: req.status || 'new',
            date: req.created_at || new Date().toISOString()
        }));
        
        // 3. localStorage ga saqlash
        localStorage.setItem('pharmegic_sourcing', JSON.stringify(sourcingData));
        
    } catch (error) {
        console.error('❌ Serverdan sourcing yuklash xatosi:', error);
        
        // Fallback: localStorage dan
        try {
            const stored = localStorage.getItem('pharmegic_sourcing');
            if (stored) {
                sourcingData = JSON.parse(stored);
                console.log('💾 LocalStorage dan sourcing:', sourcingData.length, 'ta');
            }
        } catch (e) {
            sourcingData = [];
        }
    }
    
    renderSourcingTable();
    updateBadges();
}

function updateStats() {
    console.log('📊 Statistikani yangilash boshlandi...');
    console.log('   ordersData:', ordersData.length, 'ta');
    console.log('   productsData:', productsData.length, 'ta');
    
    // ========== BUYURTMALAR STATISTIKASI ==========
    const individualOrders = ordersData.filter(o => o.userType === 'individual');
    const legalOrders = ordersData.filter(o => o.userType === 'legal');
    const newOrders = ordersData.filter(o => o.status === 'new');
    const completedOrders = ordersData.filter(o => o.status === 'completed');
    
    console.log('   Jismoniy:', individualOrders.length, 'ta');
    console.log('   Yuridik:', legalOrders.length, 'ta');
    console.log('   Yangi:', newOrders.length, 'ta');
    console.log('   Qabul qilingan:', completedOrders.length, 'ta');

    // Jami buyurtmalar
    const totalOrdersEl = document.getElementById('totalOrders');
    if (totalOrdersEl) {
        totalOrdersEl.textContent = ordersData.length;
        console.log('   ✅ totalOrders yangilandi:', ordersData.length);
    } else {
        console.warn('   ⚠️ totalOrders elementi topilmadi!');
    }

    // Jami daromad (faqat completed buyurtmalardan)
    const totalRevenue = completedOrders.reduce((sum, o) => {
        const total = parseFloat(o.total) || 0;
        return sum + total;
    }, 0);
    
    const totalRevenueEl = document.getElementById('totalRevenue');
    if (totalRevenueEl) {
        totalRevenueEl.textContent = formatPrice(totalRevenue) + " so'm";
        console.log('   ✅ totalRevenue yangilandi:', formatPrice(totalRevenue));
    } else {
        console.warn('   ⚠️ totalRevenue elementi topilmadi!');
    }

    // Yangi buyurtmalar
    const pendingOrdersEl = document.getElementById('pendingOrders');
    if (pendingOrdersEl) {
        pendingOrdersEl.textContent = newOrders.length;
        console.log('   ✅ pendingOrders yangilandi:', newOrders.length);
    } else {
        console.warn('   ⚠️ pendingOrders elementi topilmadi!');
    }

    // Qabul qilingan buyurtmalar
    const paidOrdersEl = document.getElementById('paidOrders');
    if (paidOrdersEl) {
        paidOrdersEl.textContent = completedOrders.length;
        console.log('   ✅ paidOrders yangilandi:', completedOrders.length);
    } else {
        console.warn('   ⚠️ paidOrders elementi topilmadi!');
    }

    // ========== MAHSULOTLAR STATISTIKASI ==========
    const activeProducts = productsData.filter(p => p.status === 'active').length;
    const totalProducts = productsData.length;
    const inactiveProducts = productsData.filter(p => p.status === 'inactive').length;

    const productsStatsEl = document.getElementById('productsStats');
    if (productsStatsEl) {
        productsStatsEl.textContent = `${activeProducts} / ${totalProducts}`;
    }

    const activeProductsCountEl = document.getElementById('activeProductsCount');
    if (activeProductsCountEl) {
        activeProductsCountEl.textContent = activeProducts;
    }

    const inactiveProductsCountEl = document.getElementById('inactiveProductsCount');
    if (inactiveProductsCountEl) {
        inactiveProductsCountEl.textContent = inactiveProducts;
    }

    // ========== BADGE LAR ==========
    const individualBadge = document.getElementById('individualBadge');
    if (individualBadge) {
        individualBadge.textContent = individualOrders.length;
    }

    const legalBadge = document.getElementById('legalBadge');
    if (legalBadge) {
        legalBadge.textContent = legalOrders.length;
    }

    const sourcingBadge = document.getElementById('sourcingBadge');
    if (sourcingBadge) {
        sourcingBadge.textContent = sourcingData.filter(s => s.status === 'new').length;
    }

    console.log('📊 Statistika yangilash tugadi');
}

function updateProductStats() {
    const activeProducts = productsData.filter(p => p.status === 'active').length;
    const totalProducts = productsData.length;
    const inactiveProducts = productsData.filter(p => p.status === 'inactive').length;
    
    const statsEl = document.getElementById('productsStats');
    if (statsEl) statsEl.textContent = `${activeProducts} / ${totalProducts}`;
    
    const activeEl = document.getElementById('activeProductsCount');
    if (activeEl) activeEl.textContent = activeProducts;
    
    const inactiveEl = document.getElementById('inactiveProductsCount');
    if (inactiveEl) inactiveEl.textContent = inactiveProducts;
}

function updateBadges() {
    const individualCount = ordersData.filter(o => o.userType === 'individual').length;
    const legalCount = ordersData.filter(o => o.userType === 'legal').length;
    const sourcingCount = sourcingData.filter(s => s.status === 'new').length;

    document.getElementById('individualBadge').textContent = individualCount;
    document.getElementById('legalBadge').textContent = legalCount;
    document.getElementById('sourcingBadge').textContent = sourcingCount;
}

function renderOrders() {
    console.log('🔄 Jadvallarni yangilash...');
    renderIndividualOrders();
    renderLegalOrders();
    renderRecentOrders();
    // updateStats(); // BU YERDAN OLIB TASHLANG!
    console.log('✅ Jadvallar yangilandi');
}

function renderIndividualOrders(filter = 'all') {
    const tbody = document.getElementById('individualOrdersTable');
    if (!tbody) {
        console.error('❌ individualOrdersTable topilmadi!');
        return;
    }
    
    console.log('🎨 Jismoniy shaxslar buyurtmalari:', ordersData.length, 'ta umumiy');
    
    let filtered = ordersData.filter(o => o.userType === 'individual');
    console.log('👤 Jismoniy shaxslar:', filtered.length, 'ta');
    
    if (filter !== 'all') {
        filtered = filtered.filter(o => o.status === filter);
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Buyurtmalar yo'q</td></tr>`;
        return;
    }
    
    tbody.innerHTML = filtered.map(order => {
        const itemsCount = order.items ? order.items.length : 0;
        return `
        <tr>
            <td><strong>${order.id}</strong></td>
            <td>${order.customer}</td>
            <td><a href="tel:${order.phone}">${order.phone}</a></td>
            <td>${order.address || '-'}</td>
            <td>${itemsCount} ta</td>
            <td><strong>${formatPrice(order.total)} so'm</strong></td>
            <td>${order.paymentMethod || 'Click'}</td>
            <td><span class="status-badge status-${order.status}">${getStatusName(order.status)}</span></td>
            <td>${formatDate(order.date)}</td>
            <td>
                <button class="btn-action btn-view" onclick="viewOrder('${order.id}')">
                    <i class="fas fa-eye"></i> Ko'rish
                </button>
                ${order.status === 'new' ? `
                    <button class="btn-action btn-confirm" onclick="approveOrder('${order.id}')">
                        <i class="fas fa-check"></i> Qabul
                    </button>
                    <button class="btn-action btn-cancel" onclick="cancelOrder('${order.id}')">
                        <i class="fas fa-times"></i> Bekor
                    </button>
                ` : ''}
            </td>
        </tr>
    `}).join('');
}   

function renderLegalOrders(filter = 'all') {
    const tbody = document.getElementById('legalOrdersTable');
    if (!tbody) {
        console.error('❌ legalOrdersTable topilmadi!');
        return;
    }
    
    console.log('🏢 Yuridik shaxslar buyurtmalari...');
    
    let filtered = ordersData.filter(o => o.userType === 'legal');
    
    if (filter !== 'all') {
        filtered = filtered.filter(o => o.status === filter);
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Buyurtmalar topilmadi</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(order => {
        let actionButtons = '';
        if (order.status === 'new') {
            actionButtons = `
                <button class="btn-action btn-confirm" onclick="approveOrder('${order.id}')" title="Qabul qilish">
                    <i class="fas fa-check"></i> Qabul qilish
                </button>
                <button class="btn-action btn-cancel" onclick="cancelOrder('${order.id}')" title="Bekor qilish">
                    <i class="fas fa-times"></i> Bekor qilish
                </button>
            `;
        } else if (order.status === 'completed') {
            actionButtons = `<span style="color: #28a745; font-weight: 600;"><i class="fas fa-check-circle"></i> Qabul qilingan</span>`;
        } else if (order.status === 'cancelled') {
            actionButtons = `<span style="color: #dc3545; font-weight: 600;"><i class="fas fa-times-circle"></i> Bekor qilingan</span>`;
        }

        return `
        <tr>
            <td><strong>${order.id}</strong></td>
            <td>${order.companyName || order.customer || "Noma'lum"}</td>
            <td>${order.inn || '-'}</td>
            <td><a href="tel:${order.phone}">${order.phone}</a></td>
            <td>${order.items ? order.items.length : 0} ta</td>
            <td><strong>${formatPrice(order.total)} so'm</strong></td>
            <td><span class="status-badge status-${order.status}">${getStatusName(order.status)}</span></td>
            <td>${formatDate(order.date)}</td>
            <td>
                <button class="btn-action btn-view" onclick="viewOrder('${order.id}')">
                    <i class="fas fa-eye"></i>
                </button>
                ${actionButtons}
            </td>
        </tr>
    `}).join('');
}

function renderRecentOrders() {
    const tbody = document.getElementById('recentOrdersTable');
    if (!tbody) {
        console.error('❌ recentOrdersTable topilmadi!');
        return;
    }

    let recent = [...ordersData]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

    if (recent.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Hozircha buyurtmalar yo'q</td></tr>`;
        return;
    }

    tbody.innerHTML = recent.map(order => `
        <tr>
            <td>${order.id}</td>
            <td>${order.customer || order.companyName || "Noma'lum"}</td>
            <td>${order.phone}</td>
            <td><strong>${formatPrice(order.total)} so'm</strong></td>
            <td>${getPaymentMethodName(order.paymentMethod)}</td>
            <td><span class="status-badge status-${order.status}">${getStatusName(order.status)}</span></td>
            <td>${formatDate(order.date)}</td>
            <td>
                <button class="btn-action btn-view" onclick="viewOrder('${order.id}')">
                    <i class="fas fa-eye"></i> Ko'rish
                </button>
            </td>
        </tr>
    `).join('');
}


function renderSourcingTable() {
    const tbody = document.getElementById('sourcingTable');
    if (!tbody) return;

    if (sourcingData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">So'rovlar topilmadi</td></tr>`;
        return;
    }

    tbody.innerHTML = sourcingData.map(req => `
        <tr>
            <td>${req.id}</td>
            <td>${req.product}</td>
            <td>${req.quantity} kg</td>
            <td>${req.company}</td>
            <td><a href="tel:${req.phone}">${req.phone}</a></td>
            <td><span class="status-badge status-${req.status}">${getStatusName(req.status)}</span></td>
            <td>${formatDate(req.date)}</td>
            <td>
                <button class="btn-action btn-view" onclick="viewSourcing('${req.id}')">
                    <i class="fas fa-eye"></i>
                </button>
                ${req.status === 'new' ? `
                    <button class="btn-action btn-confirm" onclick="processSourcing('${req.id}')">
                        <i class="fas fa-check"></i>
                    </button>
                ` : ''}
            </td>
        </tr>
    `).join('');
}

async function viewOrder(orderId) {
    const order = ordersData.find(o => o.id === orderId);
    if (!order) return;

    const modalBody = document.getElementById('orderModalBody');
    const modalFooter = document.getElementById('orderModalFooter');


    let itemsHtml = '';
    if (order.items && order.items.length > 0) {
        itemsHtml = order.items.map(item => `
            <div class="order-item-row">
                <span style="flex: 1;">${item.name}</span>
                <span style="text-align: center; min-width: 100px;">${item.quantity} kg</span>
                <span style="text-align: right; min-width: 120px; font-weight: 600;">
                    ${formatPrice(item.price)} so'm
                </span>
            </div>
        `).join('');
    } else {
        itemsHtml = '<p style="color: #999;">Ma\'lumot yo\'q</p>';
    }

    const total = order.total || order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;

    modalBody.innerHTML = `
        <div class="order-detail-grid">
            <div class="detail-group">
                <h4>Buyurtma ma'lumotlari</h4>
                <div class="detail-row">
                    <span>Buyurtma ID:</span>
                    <span style="font-weight: 600; color: var(--primary);">${order.id}</span>
                </div>
                <div class="detail-row">
                    <span>Sana:</span>
                    <span>${formatDate(order.date)}</span>
                </div>
                <div class="detail-row">
                    <span>Status:</span>
                    <span class="status-badge status-${order.status}">
                        ${getStatusName(order.status)}
                    </span>
                </div>
                <div class="detail-row">
                    <span>Mijoz turi:</span>
                    <span>${order.userType === 'legal' ? 'Yuridik shaxs' : 'Jismoniy shaxs'}</span>
                </div>
                <div class="detail-row">
                    <span>To'lov usuli:</span>
                    <span>${getPaymentMethodName(order.paymentMethod)}</span>
                </div>
            </div>

            <div class="detail-group">
                <h4>Mijoz ma'lumotlari</h4>
                ${order.userType === 'legal' ? `
                    <div class="detail-row">
                        <span>Kompaniya:</span>
                        <span style="font-weight: 500;">${order.companyName || order.customer || "Noma'lum"}</span>
                    </div>
                    <div class="detail-row">
                        <span>INN:</span>
                        <span>${order.inn || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span>Hisob raqam:</span>
                        <span>${order.account || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span>Bank:</span>
                        <span>${order.bank || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span>MFO:</span>
                        <span>${order.mfo || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span>Rahbar:</span>
                        <span>${order.director || '-'}</span>
                    </div>
                ` : `
                    <div class="detail-row">
                        <span>FIO:</span>
                        <span style="font-weight: 500;">${order.customer || '-'}</span>
                    </div>
                `}
                <div class="detail-row">
                    <span>Telefon:</span>
                    <span><a href="tel:${order.phone}" style="color: var(--primary); text-decoration: none;">${order.phone}</a></span>
                </div>
                <div class="detail-row" style="flex-direction: column; align-items: flex-start;">
                    <span style="margin-bottom: 4px;">Manzil:</span>
                    <span style="color: var(--dark); line-height: 1.5;">${order.address || '-'}</span>
                </div>
            </div>

            <div class="detail-group full-width">
                <h4>Buyurtma tarkibi</h4>
                <div class="order-items" style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-top: 12px;">
                    <div style="display: flex; border-bottom: 2px solid #dee2e6; padding-bottom: 8px; margin-bottom: 8px; font-weight: 600; color: #666; font-size: 13px;">
                        <span style="flex: 1;">Mahsulot</span>
                        <span style="text-align: center; min-width: 100px;">Miqdor</span>
                        <span style="text-align: right; min-width: 120px;">Narx</span>
                    </div>
                    ${itemsHtml}
                    <div class="order-total" style="margin-top: 16px; padding-top: 16px; border-top: 2px solid var(--primary);">
                        <span style="font-size: 16px;">Jami summa:</span>
                        <span style="color: var(--primary); font-size: 20px;">${formatPrice(total)} so'm</span>
                    </div>
                </div>
            </div>

            ${order.comment ? `
                <div class="detail-group full-width">
                    <h4>Izoh</h4>
                    <p style="background: #f8f9fa; padding: 12px; border-radius: 8px; color: #555; line-height: 1.6;">
                        ${order.comment}
                    </p>
                </div>
            ` : ''}
        </div>
    `;

    let footerButtons = '';

    if (order.status === 'new') {
        footerButtons = `
            <button class="btn-action btn-confirm" onclick="approveOrder('${order.id}')" 
                    style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; border: none; padding: 12px 24px; font-size: 14px; flex: 1;">
                <i class="fas fa-check-circle"></i> Qabul qilish
            </button>
            <button class="btn-action btn-cancel" onclick="cancelOrder('${order.id}')" 
                    style="background: #dc3545; color: white; border: none; padding: 12px 24px; font-size: 14px;">
                <i class="fas fa-times-circle"></i> Bekor qilish
            </button>
        `;
    } else if (order.status === 'completed') {
        footerButtons = `
            <div style="color: #28a745; font-weight: 600; display: flex; align-items: center; gap: 8px; flex: 1;">
                <i class="fas fa-check-circle"></i> Buyurtma qabul qilingan
            </div>
        `;
    } else if (order.status === 'cancelled') {
        footerButtons = `
            <div style="color: #dc3545; font-weight: 600; display: flex; align-items: center; gap: 8px; flex: 1;">
                <i class="fas fa-times-circle"></i> Buyurtma bekor qilingan
            </div>
        `;
    }

    footerButtons += `
        <button class="btn-action btn-view" onclick="closeOrderModal()" 
                style="background: #6c757d; color: white; border: none; padding: 12px 24px; font-size: 14px;">
            <i class="fas fa-times"></i> Yopish
        </button>
    `;

    modalFooter.innerHTML = footerButtons;
    modalFooter.style.display = 'flex';
    modalFooter.style.gap = '10px';
    modalFooter.style.flexWrap = 'wrap';

    document.getElementById('orderModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function cancelOrder(orderId) {
    if (!confirm('Haqiqatan ham buyurtmani bekor qilmoqchimisiz?')) return;

    try {
        // Serverga yuborish (ichki try-catch bilan)
        let serverUpdated = false;
        try {
            const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Admin tomonidan bekor qilindi' })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Server xatosi:', response.status, errorData);
                showNotification(errorData.error || `Server xatosi: ${response.status}`, 'error');
            } else {
                serverUpdated = true;
                console.log('✅ Serverda bekor qilindi:', orderId);
            }
        } catch (apiError) {
            console.log('API ulanish xatosi:', apiError.message);
            showNotification('Server bilan aloqa yo\'q, faqat mahalliy yangilanmoqda', 'warning');
        }

        // Har bir holatda localStorage va UI ni yangilash
        updateLocalOrderStatus(orderId, 'cancelled');
        showNotification('Buyurtma bekor qilindi', 'warning');
        renderOrders();
        updateStats();
        closeOrderModal();

        if (!serverUpdated) {
            setTimeout(() => loadOrdersFromAPI(), 2000);
        }
        
    } catch (error) {
        console.error('Cancel error:', error);
        showNotification('Xatolik yuz berdi: ' + error.message, 'error');
    }
}

async function processSourcing(reqId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/sourcing/${reqId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error('Server xatosi');

        // Local yangilash
        const index = sourcingData.findIndex(r => r.id === reqId);
        if (index >= 0) {
            sourcingData[index].status = 'completed';
            localStorage.setItem('pharmegic_sourcing', JSON.stringify(sourcingData));
        }
        
        renderSourcingTable();
        updateBadges();
        showNotification("So'rov qayta ishlanmoqda", 'success');
        
    } catch (error) {
        console.error('Process sourcing error:', error);
        
        // Offline fallback
        const index = sourcingData.findIndex(r => r.id === reqId);
        if (index >= 0) {
            sourcingData[index].status = 'processing';
            localStorage.setItem('pharmegic_sourcing', JSON.stringify(sourcingData));
            renderSourcingTable();
            updateBadges();
        }
    }
}

function filterIndividualOrders() {
    const filter = document.getElementById('individualFilter').value;
    renderIndividualOrders(filter);
}

function filterLegalOrders() {
    const filter = document.getElementById('legalFilter').value;
    renderLegalOrders(filter);
}

function filterProductsTable() {
    const filter = document.getElementById('productsFilter').value;
    const search = document.getElementById('productsSearch').value.toLowerCase();
    
    let filtered = productsData;
    
    if (filter !== 'all') {
        filtered = filtered.filter(p => p.category === filter);
    }
    
    if (search) {
        filtered = filtered.filter(p => 
            (p.nameUz && p.nameUz.toLowerCase().includes(search)) ||
            (p.nameRu && p.nameRu.toLowerCase().includes(search)) ||
            (p.nameEn && p.nameEn.toLowerCase().includes(search))
        );
    }
    
    const tbody = document.getElementById('productsTable');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Mahsulotlar topilmadi</td></tr>`;
        return;
    }
    
    tbody.innerHTML = filtered.map(product => {
        const statusClass = product.status === 'active' ? 'status-paid' : 'status-cancelled';
        const statusText = product.status === 'active' ? 'Faol' : 'To\'xtatilgan';
        const productId = parseInt(product.id);
        
        // ✅ PLACEHOLDER o'rniga data URI ishlatish
        const imageUrl = product.image || PLACEHOLDER_IMAGE;
        
        return `
        <tr>
            <td><strong>#${product.id}</strong></td>
            <td>
                <img src="${imageUrl}" 
                     alt="${product.nameUz || ''}" 
                     style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;"
                     onerror="this.src='${PLACEHOLDER_IMAGE}'">
            </td>
            <td>
                <div style="font-weight: 600;">${product.nameUz || ''}</div>
                <div style="font-size: 12px; color: #666;">${product.nameRu || ''}</div>
            </td>
            <td>${getCategoryName(product.category)}</td>
            <td>${formatPrice(product.prices?.retail || 0)} so'm</td>
            <td>${formatPrice(product.prices?.wholesale || 0)} so'm</td>
            <td>${product.minQty || 1} kg</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td class="action-buttons">
                <button type="button" class="btn-action btn-view" onclick="editProduct(${productId})" title="Tahrirlash">
                    <i class="fas fa-edit"></i>
                </button>
                <button type="button" class="btn-action ${product.status === 'active' ? 'btn-cancel' : 'btn-confirm'}" 
                        onclick="toggleProductStatus(${productId})" 
                        title="${product.status === 'active' ? 'To\'xtatish' : 'Faollashtirish'}">
                    <i class="fas fa-${product.status === 'active' ? 'pause' : 'play'}"></i>
                </button>
                <button type="button" class="btn-action btn-cancel" onclick="deleteProduct(${productId})" title="O'chirish">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

function exportOrders(type) {
    const data = type === 'individual' 
        ? ordersData.filter(o => o.userType === 'individual')
        : ordersData.filter(o => o.userType === 'legal');

    const csv = convertToCSV(data);
    downloadCSV(csv, `orders_${type}_${new Date().toISOString().split('T')[0]}.csv`);
}

function exportProducts() {
    const csv = convertToCSV(productsData);
    downloadCSV(csv, `products_${new Date().toISOString().split('T')[0]}.csv`);
}

function convertToCSV(data) {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
        Object.values(row).map(val => 
            typeof val === 'string' ? `"${val}"` : val
        ).join(',')
    ).join('\\n');

    return `${headers}\\n${rows}`;
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function addNotification(notification) {
    notification.id = Date.now();
    notification.time = new Date().toISOString();
    notification.read = false;

    notifications.unshift(notification);
    updateNotificationUI();

    if (Notification.permission === 'granted') {
        new Notification(notification.title, {
            body: notification.message,
            icon: 'https://pharmegic.uz/favicon.ico'
        });
    }
}

function updateNotificationUI() {
    const count = notifications.filter(n => !n.read).length;
    document.getElementById('notificationCount').textContent = count;

    const bell = document.querySelector('.notification-bell');
    if (count > 0) {
        bell.classList.add('has-new');
    } else {
        bell.classList.remove('has-new');
    }

    const list = document.getElementById('notificationList');
    if (notifications.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>Bildirishnomalar yo\'q</p></div>';
        return;
    }

    list.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}" onclick="markRead(${n.id})">
            <h5><i class="fas fa-${n.type === 'success' ? 'check-circle' : n.type === 'order' ? 'shopping-cart' : 'info-circle'}"></i> ${n.title}</h5>
            <p>${n.message}</p>
            <small>${formatDate(n.time)}</small>
        </div>
    `).join('');
}

function toggleNotifications() {
    document.getElementById('notificationPanel').classList.toggle('active');
}

function markRead(id) {
    const notif = notifications.find(n => n.id === id);
    if (notif) {
        notif.read = true;
        updateNotificationUI();
    }
}

function markAllRead() {
    notifications.forEach(n => n.read = true);
    updateNotificationUI();
}

function showSection(sectionName) {
    closeSidebarOnMobile();

    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(sectionName).classList.add('active');

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const onclick = item.getAttribute('onclick');
        if (onclick && onclick.includes(`showSection('${sectionName}')`)) {
            item.classList.add('active');
        }
    });

    const titles = {
        'dashboard': 'Boshqaruv paneli',
        'individual-orders': 'Jismoniy shaxslar buyurtmalari',
        'legal-orders': 'Yuridik shaxslar buyurtmalari',
        'sourcing': "Topib berish so'rovlari",
        'products': 'Mahsulotlar boshqaruvi'
    };
    document.getElementById('pageTitle').textContent = titles[sectionName] || 'Admin Panel';

    if (sectionName === 'individual-orders') renderIndividualOrders();
    if (sectionName === 'legal-orders') renderLegalOrders();
    if (sectionName === 'sourcing') renderSourcingTable();
    if (sectionName === 'products') renderProductsTable();
}

function initCharts() {
    const ordersCtx = document.getElementById('ordersChart');
    if (ordersCtx) {
        charts.orders = new Chart(ordersCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Jismoniy shaxslar',
                    data: [],
                    borderColor: '#C40000',
                    backgroundColor: 'rgba(196, 0, 0, 0.1)',
                    tension: 0.4,
                    fill: true
                }, {
                    label: 'Yuridik shaxslar',
                    data: [],
                    borderColor: '#1976d2',
                    backgroundColor: 'rgba(25, 118, 210, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            padding: 10,
                            font: { size: 11 },
                            usePointStyle: true
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1, font: { size: 10 } },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        ticks: { font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    const revenueCtx = document.getElementById('revenueChart');
    if (revenueCtx) {
        charts.revenue = new Chart(revenueCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: "Daromad (so'm)",
                    data: [],
                    backgroundColor: '#C40000',
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: { size: 10 },
                            callback: function(value) {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(0) + 'k';
                                return value;
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        ticks: { font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }
}

function updateCharts() {
    console.log('📊 Chartlarni yangilash...');
    
    if (!charts.orders || !charts.revenue) {
        console.warn('⚠️ Chart obyektlari topilmadi!');
        return;
    }

    const days = 7;
    const labels = [];
    const individualData = [];
    const legalData = [];
    const revenueData = [];

    // So'nggi 7 kun uchun ma'lumotlar
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        // Hafta kunini qisqa formatda
        const dayName = date.toLocaleDateString('uz-UZ', { weekday: 'short' });
        labels.push(dayName);

        // Shu kundagi buyurtmalarni hisoblash
        const dayOrders = ordersData.filter(o => {
            if (!o.date) return false;
            const orderDate = new Date(o.date).toISOString().split('T')[0];
            return orderDate === dateStr;
        });

        individualData.push(dayOrders.filter(o => o.userType === 'individual').length);
        legalData.push(dayOrders.filter(o => o.userType === 'legal').length);

        // Daromad (faqat completed buyurtmalardan)
        const dayRevenue = dayOrders
            .filter(o => o.status === 'completed')
            .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
        revenueData.push(dayRevenue);
    }

    console.log('   Labels:', labels);
    console.log('   Jismoniy:', individualData);
    console.log('   Yuridik:', legalData);
    console.log('   Daromad:', revenueData);

    // Orders Chart yangilash
    charts.orders.data.labels = labels;
    charts.orders.data.datasets[0].data = individualData;
    charts.orders.data.datasets[1].data = legalData;
    charts.orders.update();

    // Revenue Chart yangilash
    charts.revenue.data.labels = labels;
    charts.revenue.data.datasets[0].data = revenueData;
    charts.revenue.update();

    console.log('✅ Chartlar yangilandi');
}

function formatPrice(price) {
    if (!price) return '0';
    return parseFloat(price).toFixed(0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' ');
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('uz-UZ', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncate(str, length) {
    if (!str) return '-';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

function getStatusName(status) {
    const names = {
        'new': 'Yangi',
        'completed': 'Qabul qilingan',
        'cancelled': 'Bekor qilingan',
        'processing': 'Jarayonda',
        'active': 'Faol',
        'inactive': 'To\'xtatilgan'
    };
    return names[status] || status;
}

function getPaymentMethodName(method) {
    const names = {
        'Click': 'Click',
        'Bank transfer (Contract)': "Bank o'tkazmasi (Dogovor)",
        'cash': 'Naqd',
        'card': 'Karta'
    };
    return names[method] || method;
}

function showNotification(message, type = 'success') {
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#f57c00' : '#1976d2'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        font-weight: 500;
        animation: slideIn 0.3s ease;
        max-width: 400px;
        word-wrap: break-word;
        font-size: 14px;
    `;
    notif.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i> ${message}`;

    document.body.appendChild(notif);

    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// ==================== ADMIN NOTIFICATIONS ====================
let notificationSound = null;
let originalTitle = document.title;
let titleFlashInterval = null;

// Create notification sound (base64 beep)
function initNotificationSound() {
    // Simple beep sound using AudioContext (no external file needed)
    notificationSound = {
        play: function() {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 800;
                gain.gain.value = 0.3;
                osc.start();
                setTimeout(() => osc.stop(), 200);
                setTimeout(() => {
                    const osc2 = ctx.createOscillator();
                    const gain2 = ctx.createGain();
                    osc2.connect(gain2);
                    gain2.connect(ctx.destination);
                    osc2.frequency.value = 1000;
                    gain2.gain.value = 0.3;
                    osc2.start();
                    setTimeout(() => osc2.stop(), 200);
                }, 250);
            } catch (e) { console.log('Sound error:', e); }
        }
    };
}

// Flash browser title
function flashTitle(message) {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    let flash = true;
    titleFlashInterval = setInterval(() => {
        document.title = flash ? `🔴 ${message}` : originalTitle;
        flash = !flash;
    }, 1000);

    // Stop flashing after 10 seconds or on click
    setTimeout(() => {
        if (titleFlashInterval) {
            clearInterval(titleFlashInterval);
            document.title = originalTitle;
        }
    }, 10000);
}

// Browser notification request
function requestBrowserNotification() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// Send browser notification
function sendBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: 'https://pharmegic.uz/favicon.ico',
            tag: 'pharmegic-order',
            requireInteraction: true
        });
    }
}

// Override addNotification function
const originalAddNotification = addNotification;
addNotification = function(notification) {
    originalAddNotification(notification);

    // Sound
    if (notificationSound) notificationSound.play();

    // Title flash
    flashTitle('Yangi buyurtma!');

    // Browser notification
    sendBrowserNotification(notification.title, notification.message);
};

// Check for new orders every 10 seconds (for admin panel)
function startAdminNotifications() {
    initNotificationSound();
    requestBrowserNotification();

    let lastOrderCount = 0;

    setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/orders`);
            if (!response.ok) return;
            const orders = await response.json();
            const newOrders = orders.filter(o => o.status === 'new');

            if (newOrders.length > lastOrderCount) {
                // New order detected!
                const diff = newOrders.length - lastOrderCount;
                addNotification({
                    title: 'Yangi buyurtma!',
                    message: `${diff} ta yangi buyurtma qabul qilindi`,
                    type: 'order'
                });
            }
            lastOrderCount = newOrders.length;
        } catch (e) {
            // Silent fail
        }
    }, 10000);
}

// Start notifications when admin panel loads
document.addEventListener('DOMContentLoaded', () => {
    initTelegramAdmin();
    if (document.getElementById('admin-panel-marker')) {
        startAdminNotifications();
    }
});

function closeOrderModal() {
    document.getElementById('orderModal').classList.remove('active');
    document.body.style.overflow = '';
}

function viewSourcing(reqId) {
    const req = sourcingData.find(r => r.id === reqId);
    if (!req) return;

    alert(`
So'rov ma'lumotlari:

ID: ${req.id}
Mahsulot: ${req.product}
Miqdor: ${req.quantity} kg
Kompaniya: ${req.company}
Telefon: ${req.phone}
Status: ${getStatusName(req.status)}
Sana: ${formatDate(req.date)}
    `);
}

function logout() {
    if (confirm('Haqiqatan ham chiqishni xohlaysizmi?')) {
        localStorage.removeItem('pharmegic_admin_token');
        window.location.reload();
    }
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);