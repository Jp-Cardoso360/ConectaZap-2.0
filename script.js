// ===== CONSTANTS AND CONFIGURATION =====
const CONFIG = {
    API_BASE_URL: window.CONECTAZAP_API_BASE_URL || (
        ['localhost', '127.0.0.1'].includes(window.location.hostname)
            ? 'http://localhost:3333'
            : 'https://netix-zae-api.vercel.app'
    ),
    DEFAULT_PRIMARY_COLOR: "#2ECC71",
    ANIMATION_DELAY: 100,
    CART_STORAGE_KEY: "conectazap_cart",
    GOAL_STORAGE_KEY: "conectazap_goal_achieved"
};

// ===== GLOBAL STATE =====
class AppState {
    constructor() {
        this.products = new Map();
        this.cart = new Map();
        this.currentUser = null;
        this.userGoal = null;
        this.deliveryPlaces = [];
        this.selectedDeliveryPlace = null;
        this.categories = [];
        this.activeCategoryId = 'all';
        this.productQuery = '';
        this.goalAchieved = false;
        this.isLoading = false;
    }

    // Product management
    addProduct(product) {
        this.products.set(product._id, {
            ...product,
            quantity: 0
        });
    }

    getProduct(id) {
        return this.products.get(id);
    }

    getAllProducts() {
        return Array.from(this.products.values());
    }

    // Cart management
    updateCartItem(productId, quantity) {
        const product = this.getProduct(productId);
        if (!product) return false;

        if (quantity <= 0) {
            this.cart.delete(productId);
        } else {
            this.cart.set(productId, {
                ...product,
                quantity: quantity
            });
        }

        product.quantity = quantity;
        this.saveCartToStorage();
        return true;
    }

    updateProductObservation(productId, observation) {
        const product = this.getProduct(productId);
        if (!product) return false;

        product.observation = observation;
        const cartItem = this.cart.get(productId);
        if (cartItem) {
            cartItem.observation = observation;
        }
        this.saveCartToStorage();
        return true;
    }

    getCartItems() {
        return Array.from(this.cart.values());
    }

    getCartTotal() {
        return this.getCartItems().reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    getCartItemCount() {
        return this.getCartItems().reduce((total, item) => total + item.quantity, 0);
    }

    getCartStorageKey() {
        const userId = this.currentUser?.id || 'anonymous';
        return `${CONFIG.CART_STORAGE_KEY}:${userId}`;
    }

    clearCart() {
        this.cart.clear();
        this.products.forEach(product => {
            product.quantity = 0;
            product.observation = '';
        });
        this.saveCartToStorage();
    }

    // Storage management
    saveCartToStorage() {
        try {
            const cartData = Array.from(this.cart.entries());
            localStorage.setItem(this.getCartStorageKey(), JSON.stringify(cartData));
        } catch (error) {
            console.warn('Failed to save cart to localStorage:', error);
        }
    }

    loadCartFromStorage() {
        try {
            const cartData = localStorage.getItem(this.getCartStorageKey());
            if (cartData) {
                const entries = JSON.parse(cartData);
                this.cart = new Map(entries);
            }
        } catch (error) {
            console.warn('Failed to load cart from localStorage:', error);
        }
    }
}

// ===== GLOBAL INSTANCES =====
const appState = new AppState();

// ===== DOM ELEMENTS =====
const elements = {
    // Loading
    loadingScreen: document.getElementById('loading'),
    
    // Header
    cartButton: document.getElementById('cart-toggle'),
    cartBadge: document.getElementById('cart-badge'),
    searchToggle: document.getElementById('search-toggle'),
    searchForm: document.getElementById('product-search-form'),
    searchInput: document.getElementById('product-search-input'),
    searchClear: document.getElementById('search-clear'),
    searchEmpty: document.getElementById('search-empty'),
    categoryTabs: document.getElementById('category-tabs'),
    categoryLoading: document.getElementById('category-loading'),
    productsEmpty: document.getElementById('products-empty'),
    storeStatus: document.getElementById('store-status'),
    storeStatusMessage: document.getElementById('store-status-message'),
    storeStatusSpinner: document.getElementById('store-status-spinner'),
    storeStatusRetry: document.getElementById('store-status-retry'),
    brandName: document.querySelector('.brand-name'),
    storeHeroImage: document.querySelector('.store-hero-image'),
    
    // Categories
    categoriesContainer: document.getElementById('categories'),
    
    // Products
    productsGrid: document.getElementById('products-grid'),
    
    // Cart Sidebar
    cartSidebar: document.getElementById('cart-sidebar'),
    cartOverlay: document.getElementById('cart-overlay'),
    cartClose: document.getElementById('cart-close'),
    cartItems: document.getElementById('cart-items'),
    cartEmpty: document.getElementById('cart-empty'),
    totalItems: document.getElementById('total-items'),
    totalPrice: document.getElementById('total-price'),
    checkoutBtn: document.getElementById('checkout-btn'),
    
    // Product Modal
    productModal: document.getElementById('product-modal'),
    modalClose: document.getElementById('modal-close'),
    modalImage: document.getElementById('modal-image'),
    modalName: document.getElementById('modal-name'),
    modalPrice: document.getElementById('modal-price'),
    modalDescription: document.getElementById('modal-description'),
    modalObservation: document.getElementById('modal-observation'),
    modalQuantity: document.getElementById('modal-quantity'),
    modalMinus: document.getElementById('modal-minus'),
    modalPlus: document.getElementById('modal-plus'),
    
    // Checkout Modal
    checkoutModal: document.getElementById('checkout-modal'),
    checkoutClose: document.getElementById('checkout-close'),
    checkoutForm: document.getElementById('checkout-form'),
    customerName: document.getElementById('customer-name'),
    customerAddressGroup: document.getElementById('customer-address-group'),
    customerAddress: document.getElementById('customer-address'),
    deliveryPlace: document.getElementById('delivery-place'),
    paymentMethod: document.getElementById('payment-method'),
    checkoutItems: document.getElementById('checkout-items'),
    checkoutDeliveryFee: document.getElementById('checkout-delivery-fee'),
    checkoutTotal: document.getElementById('checkout-total'),
    
    // Success Modal
    successModal: document.getElementById('success-modal'),
    successClose: document.getElementById('success-close'),
    
    // Goal Alert
    goalAlert: document.getElementById('goal-alert'),
    goalAmount: document.getElementById('goal-amount'),
    continueShopping: document.getElementById('continue-shopping'),
    finishOrder: document.getElementById('finish-order')
};

// ===== UTILITY FUNCTIONS =====
const utils = {
    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    },

    getProductImageUrl(product) {
        const imageValues = [
            product?.thumbnail_url,
            product?.thumbnailUrl,
            product?.imageUrl,
            product?.imageURL,
            product?.image_url,
            product?.imagemUrl,
            product?.urlImagem,
            product?.url_imagem,
            product?.imagemProduto,
            product?.imagem_url,
            product?.imagem,
            product?.image,
            product?.imageKitUrl,
            product?.thumbnail,
            product?.fotoUrl,
            product?.foto,
            product?.photo
        ];

        for (const value of imageValues) {
            if (typeof value === 'string' && value.trim()) return value.trim();
            if (value && typeof value === 'object') {
                const nestedUrl = value.url || value.src || value.href || value.imageUrl || value.image_url;
                if (typeof nestedUrl === 'string' && nestedUrl.trim()) return nestedUrl.trim();
            }
        }

        return '';
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    showModal(modal) {
        modal.classList.add('visible');
        document.body.style.overflow = 'hidden';
    },

    hideModal(modal) {
        modal.classList.remove('visible');
        document.body.style.overflow = '';
    },

    showElement(element) {
        element.classList.remove('hidden');
        element.classList.add('visible');
    },

    hideElement(element) {
        element.classList.add('hidden');
        element.classList.remove('visible');
    },

    animateElement(element, animationClass) {
        element.classList.add(animationClass);
        setTimeout(() => {
            element.classList.remove(animationClass);
        }, 1000);
    },

    getSystemColor(color) {
        if (typeof color !== 'string') return CONFIG.DEFAULT_PRIMARY_COLOR;

        const normalizedColor = color.trim();
        return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalizedColor)
            ? normalizedColor
            : CONFIG.DEFAULT_PRIMARY_COLOR;
    },

    getDarkerSystemColor(color) {
        const hex = this.getSystemColor(color).slice(1);
        const expandedHex = hex.length === 3
            ? hex.split('').map(digit => digit + digit).join('')
            : hex;
        const darkerHex = [0, 2, 4]
            .map(index => Math.round(parseInt(expandedHex.slice(index, index + 2), 16) * 0.8))
            .map(channel => channel.toString(16).padStart(2, '0'))
            .join('');

        return `#${darkerHex}`;
    }
};

// ===== API FUNCTIONS =====
const api = {
    async fetchProducts(userId) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/produto/${encodeURIComponent(userId)}`, {
                mode: 'cors',
                headers: { user_id: userId }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            const products = Array.isArray(result)
                ? result
                : result.produtos || result.products || result.data || [];
            return Array.isArray(products)
                ? products.filter(product => product.status === true)
                : [];
        } catch (error) {
            console.error('Error fetching products:', error);
            throw error;
        }
    },

    async fetchCategories(userId) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/categories`, {
                headers: { user_id: userId }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            const categories = Array.isArray(result)
                ? result
                : result.categories || result.categorias || result.data || [];

            return Array.isArray(categories) ? categories : [];
        } catch (error) {
            console.warn('Error fetching categories:', error);
            return [];
        }
    },

    async fetchDeliveryPlaces(userId) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/lugares`, {
                headers: { user_id: userId }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            const places = Array.isArray(result)
                ? result
                : result.lugares || result.places || result.data || [];

            if (!Array.isArray(places)) return [];

            return places
                .filter(place => {
                    const ownerId = place.user_id || place.userId ||
                        (typeof place.user === 'object' ? place.user?._id : place.user);
                    return !ownerId || String(ownerId) === String(userId);
                })
                .filter(place => {
                    const availability = place.disponivel ?? place.available ?? place.isAvailable ??
                        place.ativo ?? place.active ?? place.status;
                    if (availability === undefined) return true;
                    if (availability === true) return true;
                    return ['1', 'true', 'ativo', 'active', 'available', 'disponivel', 'disponível']
                        .includes(String(availability).trim().toLocaleLowerCase('pt-BR'));
                })
                .map(place => ({
                    id: String(place._id || place.id || place.nome || place.name || ''),
                    name: String(place.nome || place.name || place.lugar || place.local || '')
                        .trim()
                        .replace(/^./u, character => character.toLocaleUpperCase('pt-BR')),
                    fee: Number(place.fee ?? place.taxaEntrega ?? place.taxa_entrega ?? place.taxa ?? place.deliveryFee ?? 0)
                }))
                .filter(place => place.id && place.name && Number.isFinite(place.fee) && place.fee >= 0);
        } catch (error) {
            console.warn('Error fetching delivery places:', error);
            return [];
        }
    },

    async fetchUserData() {
        try {
            const urlPath = window.location.pathname;
            const userId = urlPath.split('/').filter(Boolean).pop();
            const response = await fetch(`${CONFIG.API_BASE_URL}/sessions-list-counts`, {
                headers: { user_id: userId }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const users = await response.json();
            const user = users.find(user => user._id === userId);
            
            if (!user) {
                throw new Error("User not found!");
            }
            
            return {
                name: user.nome,
                phone: user.tel,
                id: user._id,
                banner: user.banner || user.bannerUrl || '',
                color: utils.getSystemColor(user.corSistema)
            };
        } catch (error) {
            console.error('Error fetching user data:', error);
            throw error;
        }
    },

    async fetchStoreAccount(userId) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/metas/list`, {
                headers: { user_id: userId }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            const records = Array.isArray(result)
                ? result
                : result.metas || result.data || result;
            const account = Array.isArray(records) ? records.find(record => {
                const ownerId = record.user_id && typeof record.user_id === 'object'
                    ? record.user_id._id || record.user_id.id
                    : record.user_id;
                return ownerId != null && String(ownerId) === String(userId);
            }) : null;

            if (!account) {
                throw new Error('No account status record found for this store.');
            }

            return {
                status: String(account.status || '').trim().toLocaleLowerCase('pt-BR'),
                goal: account.meta ?? null
            };
        } catch (error) {
            console.error('Error verifying store account:', error);
            throw error;
        }
    }
};

// ===== UI FUNCTIONS =====
const ui = {
    showLoading() {
        appState.isLoading = true;
        utils.showElement(elements.loadingScreen);
    },

    hideLoading() {
        appState.isLoading = false;
        elements.loadingScreen.classList.add('hidden');
    },

    showStoreStatus(message, { loading = false, retry = false } = {}) {
        elements.storeStatusMessage.textContent = message;
        elements.storeStatusSpinner.classList.toggle('hidden', !loading);
        elements.storeStatusRetry.classList.toggle('hidden', !retry);
        elements.storeStatus.classList.remove('hidden');
        elements.productsGrid.classList.add('hidden');
        elements.productsEmpty.classList.add('hidden');
    },

    hideStoreStatus() {
        elements.storeStatus.classList.add('hidden');
        elements.productsGrid.classList.remove('hidden');
    },

    updateCartBadge() {
        const itemCount = appState.getCartItemCount();
        elements.cartBadge.textContent = itemCount;
        
        if (itemCount > 0) {
            elements.cartBadge.classList.add('visible');
        } else {
            elements.cartBadge.classList.remove('visible');
        }
    },

    updateCartSidebar() {
        const cartItems = appState.getCartItems();
        const total = appState.getCartTotal();
        const itemCount = appState.getCartItemCount();

        // Update totals
        elements.totalItems.textContent = itemCount;
        elements.totalPrice.textContent = utils.formatCurrency(total);

        // Update checkout button
        elements.checkoutBtn.disabled = itemCount === 0;

        // Show/hide empty state
        if (cartItems.length === 0) {
            utils.showElement(elements.cartEmpty);
            utils.hideElement(elements.cartItems);
        } else {
            utils.hideElement(elements.cartEmpty);
            utils.showElement(elements.cartItems);
            
            // Render cart items
            elements.cartItems.innerHTML = cartItems.map(item => {
                const imageUrl = utils.getProductImageUrl(item);
                return `
                    <div class="cart-item">
                        <img ${imageUrl ? `src="${imageUrl}"` : ''} alt="${item.description}" class="cart-item-image">
                        <div class="cart-item-info">
                            <div class="cart-item-name">${item.description}</div>
                            <div class="cart-item-price">${utils.formatCurrency(item.price)}</div>
                            <div class="cart-item-quantity">Quantidade: ${item.quantity}</div>
                        </div>
                        <button class="cart-item-remove" type="button" data-product-id="${item._id}" aria-label="Remover ${item.description} do carrinho">
                            <i class="fas fa-times" aria-hidden="true"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }

        // Check goal achievement
        this.checkGoalAchievement(total);
    },

    renderDeliveryPlaces(places) {
        const pickupPlace = {
            id: '__pickup__',
            name: 'Retirada no local',
            fee: 0,
            type: 'pickup'
        };
        const sortedPlaces = [...places].sort((first, second) =>
            first.name.localeCompare(second.name, 'pt-BR', { sensitivity: 'base' })
        );
        appState.deliveryPlaces = [pickupPlace, ...sortedPlaces];
        elements.deliveryPlace.innerHTML = '';
        elements.deliveryPlace.add(new Option('Selecione um local', ''));

        elements.deliveryPlace.disabled = false;
        appState.deliveryPlaces.forEach(place => {
            const option = new Option(
                place.type === 'pickup'
                    ? `${place.name} · Grátis`
                    : `${place.name} · ${utils.formatCurrency(place.fee)}`,
                place.id
            );
            elements.deliveryPlace.add(option);
        });
    },

    updateDeliveryPlaceSelection() {
        const selectedPlace = appState.deliveryPlaces.find(
            place => place.id === elements.deliveryPlace.value
        ) || null;
        const needsAddress = selectedPlace && selectedPlace.type !== 'pickup';

        appState.selectedDeliveryPlace = selectedPlace;
        elements.customerAddress.disabled = !needsAddress;
        elements.customerAddress.required = Boolean(needsAddress);
        elements.customerAddressGroup.classList.toggle('hidden', !needsAddress);

        if (selectedPlace?.type === 'pickup') {
            elements.customerAddress.value = '';
        }

        this.updateCheckoutSummary();
    },

    updateCheckoutSummary() {
        const selectedPlace = appState.selectedDeliveryPlace;
        const deliveryFee = selectedPlace?.fee || 0;

        elements.checkoutDeliveryFee.textContent = selectedPlace
            ? utils.formatCurrency(deliveryFee)
            : 'Selecione um local';
        elements.checkoutTotal.textContent = utils.formatCurrency(appState.getCartTotal() + deliveryFee);
    },

    filterProducts(query) {
        const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
        appState.productQuery = normalizedQuery;
        const productCards = elements.productsGrid.querySelectorAll('.product-card');
        let visibleProducts = 0;

        productCards.forEach(card => {
            const categoryMatches = appState.activeCategoryId === 'all' ||
                card.dataset.categoryId === appState.activeCategoryId;
            const matches = categoryMatches && card.dataset.searchText.includes(normalizedQuery);
            card.classList.toggle('hidden', !matches);
            if (matches) visibleProducts++;
        });

        const sections = elements.productsGrid.querySelectorAll('.product-category-section');
        sections.forEach(section => {
            const categoryMatches = appState.activeCategoryId === 'all' ||
                section.dataset.categoryId === appState.activeCategoryId;
            const sectionCards = [...section.querySelectorAll('.product-card')];
            const matchingCards = sectionCards.filter(card => !card.classList.contains('hidden')).length;
            const isEmptyCategory = sectionCards.length === 0;
            const sectionEmpty = section.querySelector('.category-empty');

            sectionEmpty.classList.toggle('hidden', !isEmptyCategory || normalizedQuery.length > 0);
            section.classList.toggle('hidden', !categoryMatches || (
                normalizedQuery.length > 0 && matchingCards === 0
            ));
        });

        elements.searchEmpty.classList.toggle('hidden', normalizedQuery.length === 0 || visibleProducts > 0);
    },

    checkGoalAchievement(total) {
        if (appState.userGoal && total >= appState.userGoal && !appState.goalAchieved) {
            appState.goalAchieved = true;
            elements.goalAmount.textContent = utils.formatCurrency(appState.userGoal);
            utils.showModal(elements.goalAlert);
            localStorage.setItem(CONFIG.GOAL_STORAGE_KEY, 'true');
        }
    },

    renderCategoryTabs(categories, hasUncategorizedProducts) {
        elements.categoryTabs.replaceChildren();

        const tabs = [{ id: 'all', name: 'Todos' }, ...categories];
        if (hasUncategorizedProducts) {
            tabs.push({ id: 'uncategorized', name: 'Sem categoria' });
        }

        elements.categoryTabs.classList.toggle('hidden', tabs.length <= 1);
        tabs.forEach(category => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'category-tab';
            button.dataset.categoryId = category.id;
            button.textContent = category.name;
            const isActive = category.id === appState.activeCategoryId;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
            elements.categoryTabs.appendChild(button);
        });
    },

    renderProducts(products, categories = []) {
        const orderedCategories = categories
            .map((category, index) => ({
                ...category,
                _displayId: String(category._id ?? category.id ?? ''),
                _displayName: String(category.nome ?? category.name ?? '').trim(),
                _originalIndex: index
            }))
            .filter(category => category._displayId && category._displayName)
            .sort((left, right) => {
                const orderDifference = Number(left.ordem ?? Number.MAX_SAFE_INTEGER) -
                    Number(right.ordem ?? Number.MAX_SAFE_INTEGER);
                return orderDifference || left._originalIndex - right._originalIndex;
            });
        const knownCategoryIds = new Set(orderedCategories.map(category => category._displayId));
        const groupedProducts = new Map(orderedCategories.map(category => [category._displayId, []]));
        const uncategorizedProducts = [];

        products.forEach(product => {
            const rawCategoryId = product.categoriaId ?? product.categoryId;
            const categoryId = rawCategoryId && typeof rawCategoryId === 'object'
                ? String(rawCategoryId._id ?? rawCategoryId.id ?? '')
                : String(rawCategoryId ?? '');

            if (categoryId && knownCategoryIds.has(categoryId)) {
                groupedProducts.get(categoryId).push(product);
            } else {
                uncategorizedProducts.push(product);
            }
        });
        const populatedCategories = orderedCategories.filter(category =>
            groupedProducts.get(category._displayId).length > 0
        );

        elements.productsGrid.replaceChildren(elements.categoryLoading);
        let productIndex = 0;

        const renderCategorySection = (categoryId, categoryName, categoryProducts) => {
            const section = document.createElement('section');
            section.className = 'product-category-section';
            section.dataset.categoryId = categoryId;

            const title = document.createElement('h3');
            title.className = 'category-section-title';
            title.textContent = categoryName;

            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'category-empty';
            emptyMessage.textContent = 'Ainda não há produtos nesta categoria.';

            const productGrid = document.createElement('div');
            productGrid.className = 'category-products-grid';

            categoryProducts.forEach(product => {
            const productElement = document.createElement('div');
            productElement.className = 'product-card';
            const imageUrl = utils.getProductImageUrl(product);
            productElement.dataset.categoryId = categoryId;
            productElement.dataset.searchText = `${product.description} ${product.description2 || ''}`.toLocaleLowerCase('pt-BR');
                productElement.style.animationDelay = `${productIndex++ * CONFIG.ANIMATION_DELAY}ms`;
            
            productElement.innerHTML = `
                <div class="product-image-container">
                    <img alt="${product.description}" class="product-image" loading="lazy">
                </div>
                <div class="product-content">
                    <h3 class="product-name">${product.description}</h3>
                    <p class="product-description">${product.description2 || ''}</p>
                    <div class="product-purchase-row">
                        <div class="product-price">${utils.formatCurrency(product.price)}</div>
                        <div class="product-controls">
                            <div class="quantity-controls">
                                <button class="quantity-btn minus" data-product-id="${product._id}" data-action="decrease" aria-label="Diminuir quantidade">
                                    <i class="fas fa-minus" aria-hidden="true"></i>
                                </button>
                                <span class="quantity-display" id="quantity-${product._id}">0</span>
                                <button class="quantity-btn plus" data-product-id="${product._id}" data-action="increase" aria-label="Aumentar quantidade">
                                    <i class="fas fa-plus" aria-hidden="true"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const productImage = productElement.querySelector('.product-image');
            const imageContainer = productElement.querySelector('.product-image-container');
            if (imageUrl) {
                productImage.src = imageUrl;
                productImage.addEventListener('error', () => {
                    imageContainer.classList.add('image-unavailable');
                    productImage.removeAttribute('src');
                }, { once: true });
            } else {
                imageContainer.classList.add('image-unavailable');
            }

            // Add click event for product details
            productElement.addEventListener('click', (e) => {
                if (!e.target.closest('.quantity-controls')) {
                    this.showProductModal(product._id);
                }
            });

                productGrid.appendChild(productElement);
            });

            section.append(title, emptyMessage, productGrid);
            elements.productsGrid.appendChild(section);
        };

        populatedCategories.forEach(category => {
            renderCategorySection(
                category._displayId,
                category._displayName,
                groupedProducts.get(category._displayId)
            );
        });

        if (uncategorizedProducts.length > 0) {
            renderCategorySection('uncategorized', 'Sem categoria', uncategorizedProducts);
        }

        elements.productsEmpty.classList.toggle(
            'hidden',
            products.length > 0
        );
        this.renderCategoryTabs(populatedCategories.map(category => ({
            id: category._displayId,
            name: category._displayName
        })), uncategorizedProducts.length > 0);
        this.filterProducts(elements.searchInput.value);

        // Add quantity control event listeners
        this.attachQuantityControls();
    },

    attachQuantityControls() {
        const quantityButtons = elements.productsGrid.querySelectorAll('.quantity-btn[data-product-id]');
        
        quantityButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const productId = button.dataset.productId;
                const action = button.dataset.action;
                const product = appState.getProduct(productId);
                
                if (!product) return;

                let newQuantity = product.quantity;
                if (action === 'increase') {
                    newQuantity++;
                } else if (action === 'decrease') {
                    newQuantity = Math.max(0, newQuantity - 1);
                }

                appState.updateCartItem(productId, newQuantity);
                this.updateProductQuantityDisplay(productId, newQuantity);
                this.updateCartBadge();
                this.updateCartSidebar();

                // Add bounce animation to cart button
                if (newQuantity > product.quantity) {
                    utils.animateElement(elements.cartButton, 'bounce');
                }
            });
        });
    },

    updateProductQuantityDisplay(productId, quantity) {
        const quantityElement = document.getElementById(`quantity-${productId}`);
        if (quantityElement) {
            quantityElement.textContent = quantity;
        }
    },

    showProductModal(productId) {
        const product = appState.getProduct(productId);
        if (!product) return;

        const imageUrl = utils.getProductImageUrl(product);
        if (imageUrl) {
            elements.modalImage.src = imageUrl;
            elements.modalImage.classList.remove('hidden');
        } else {
            elements.modalImage.removeAttribute('src');
            elements.modalImage.classList.add('hidden');
        }
        elements.modalImage.alt = product.description;
        elements.modalName.textContent = product.description;
        elements.modalPrice.textContent = utils.formatCurrency(product.price);
        elements.modalDescription.textContent = product.description2 || "Sem descrição detalhada disponível.";
        elements.modalObservation.value = product.observation || '';
        elements.modalQuantity.textContent = product.quantity;

        // Store current product ID for modal controls
        elements.productModal.dataset.productId = productId;

        utils.showModal(elements.productModal);
    },

    openCart() {
        elements.cartSidebar.classList.add('open');
        elements.cartOverlay.classList.add('visible');
        document.body.style.overflow = 'hidden';
    },

    closeCart() {
        elements.cartSidebar.classList.remove('open');
        elements.cartOverlay.classList.remove('visible');
        document.body.style.overflow = '';
    },

    showCheckoutModal() {
        const cartItems = appState.getCartItems();
        const itemCount = appState.getCartItemCount();

        elements.checkoutItems.textContent = itemCount;
        this.updateCheckoutSummary();

        this.closeCart();
        utils.showModal(elements.checkoutModal);
    },

    showSuccessModal() {
        utils.hideModal(elements.checkoutModal);
        utils.showModal(elements.successModal);
        
        // Clear cart after successful order
        appState.clearCart();
        this.updateCartBadge();
        this.updateCartSidebar();
        this.updateAllProductQuantityDisplays();
    },

    updateAllProductQuantityDisplays() {
        appState.getAllProducts().forEach(product => {
            this.updateProductQuantityDisplay(product._id, product.quantity);
        });
    }
};

// ===== EVENT HANDLERS =====
const eventHandlers = {
    init() {
        // Cart controls
        elements.cartButton.addEventListener('click', () => ui.openCart());
        elements.cartClose.addEventListener('click', () => ui.closeCart());
        elements.cartOverlay.addEventListener('click', () => ui.closeCart());
        elements.checkoutBtn.addEventListener('click', () => ui.showCheckoutModal());
        elements.storeStatusRetry.addEventListener('click', () => app.retryStoreLoad());
        elements.deliveryPlace.addEventListener('change', () => {
            ui.updateDeliveryPlaceSelection();
        });
        elements.cartItems.addEventListener('click', event => {
            const removeButton = event.target.closest('.cart-item-remove');
            if (!removeButton) return;

            const productId = removeButton.dataset.productId;
            if (!appState.updateCartItem(productId, 0)) return;

            ui.updateProductQuantityDisplay(productId, 0);
            ui.updateCartBadge();
            ui.updateCartSidebar();
        });

        elements.searchToggle.addEventListener('click', () => {
            const isOpening = elements.searchForm.classList.contains('hidden');
            elements.searchForm.classList.toggle('hidden', !isOpening);
            elements.searchToggle.setAttribute('aria-expanded', String(isOpening));

            if (isOpening) {
                elements.searchInput.focus();
            } else {
                elements.searchInput.value = '';
                ui.filterProducts('');
            }
        });
        elements.searchInput.addEventListener('input', () => ui.filterProducts(elements.searchInput.value));
        elements.searchClear.addEventListener('click', () => {
            elements.searchInput.value = '';
            ui.filterProducts('');
            elements.searchInput.focus();
        });

        // Modal controls
        elements.modalClose.addEventListener('click', () => utils.hideModal(elements.productModal));
        elements.checkoutClose.addEventListener('click', () => utils.hideModal(elements.checkoutModal));
        elements.successClose.addEventListener('click', () => utils.hideModal(elements.successModal));

        // Product modal quantity controls
        elements.modalMinus.addEventListener('click', () => {
            const productId = elements.productModal.dataset.productId;
            const product = appState.getProduct(productId);
            if (product) {
                const newQuantity = Math.max(0, product.quantity - 1);
                appState.updateCartItem(productId, newQuantity);
                elements.modalQuantity.textContent = newQuantity;
                ui.updateProductQuantityDisplay(productId, newQuantity);
                ui.updateCartBadge();
                ui.updateCartSidebar();
            }
        });

        elements.modalPlus.addEventListener('click', () => {
            const productId = elements.productModal.dataset.productId;
            const product = appState.getProduct(productId);
            if (product) {
                const newQuantity = product.quantity + 1;
                appState.updateCartItem(productId, newQuantity);
                elements.modalQuantity.textContent = newQuantity;
                ui.updateProductQuantityDisplay(productId, newQuantity);
                ui.updateCartBadge();
                ui.updateCartSidebar();
                utils.animateElement(elements.cartButton, 'bounce');
            }
        });

        elements.modalObservation.addEventListener('input', () => {
            const productId = elements.productModal.dataset.productId;
            appState.updateProductObservation(productId, elements.modalObservation.value);
        });

        // Checkout form
        elements.checkoutForm.addEventListener('submit', this.handleCheckoutSubmit);

        // Goal alert controls
        elements.continueShopping.addEventListener('click', () => utils.hideModal(elements.goalAlert));
        elements.finishOrder.addEventListener('click', () => {
            utils.hideModal(elements.goalAlert);
            ui.showCheckoutModal();
        });

        // Category controls
        this.initCategoryControls();

        // Keyboard navigation
        document.addEventListener('keydown', this.handleKeydown);

        // Close modals on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                utils.hideModal(elements.productModal);
                utils.hideModal(elements.checkoutModal);
                utils.hideModal(elements.successModal);
                utils.hideModal(elements.goalAlert);
                ui.closeCart();
            }
        });
    },

    initCategoryControls() {
        elements.categoryTabs.addEventListener('click', event => {
            const button = event.target.closest('.category-tab');
            if (!button) return;

            appState.activeCategoryId = button.dataset.categoryId;
            elements.categoryTabs.querySelectorAll('.category-tab').forEach(tab => {
                const isActive = tab === button;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-pressed', String(isActive));
            });

            elements.categoryLoading.classList.remove('hidden');
            elements.categoryLoading.setAttribute('aria-hidden', 'false');
            elements.productsGrid.setAttribute('aria-busy', 'true');

            requestAnimationFrame(() => requestAnimationFrame(() => {
                ui.filterProducts(elements.searchInput.value);
                elements.categoryLoading.classList.add('hidden');
                elements.categoryLoading.setAttribute('aria-hidden', 'true');
                elements.productsGrid.setAttribute('aria-busy', 'false');

                if (appState.activeCategoryId !== 'all') {
                    const section = [...elements.productsGrid.querySelectorAll('.product-category-section')]
                        .find(item => item.dataset.categoryId === appState.activeCategoryId);
                    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }));
        });
    },

    async handleCheckoutSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const customerName = formData.get('name');
        const customerAddress = formData.get('address');
        const deliveryPlace = appState.deliveryPlaces.find(
            place => place.id === formData.get('deliveryPlace')
        );
        const paymentMethod = formData.get('payment');

        if (!deliveryPlace) {
            alert('Selecione um local de entrega disponível.');
            elements.deliveryPlace.focus();
            return;
        }

        const needsAddress = deliveryPlace.type !== 'pickup';
        if (!customerName || (needsAddress && !customerAddress) || !paymentMethod) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        try {
            const cartItems = appState.getCartItems();
            const subtotal = appState.getCartTotal();
            const deliveryFee = deliveryPlace.fee;
            const total = subtotal + deliveryFee;

            // Build WhatsApp message
            const businessName = (appState.currentUser?.name || 'ConectaZap').toLocaleUpperCase('pt-BR');
            const deliveryLabel = needsAddress ? 'Bairro' : 'Retirada';
            let message = `*NOVO PEDIDO - ${businessName}*\n\n`;
            message += `*Cliente:* ${customerName}\n`;
            message += `*${deliveryLabel}:* ${deliveryPlace.name}\n`;
            if (needsAddress) {
                message += `*Endereço:* ${customerAddress}\n`;
            }
            message += `*Pagamento:* ${paymentMethod}\n\n`;
            message += `*Itens do Pedido:*\n`;

            cartItems.forEach(item => {
                message += `- (${item.quantity}x) ${item.description} - ${utils.formatCurrency(item.price * item.quantity)}\n`;
                const observation = (appState.getProduct(item._id)?.observation || item.observation || '').trim();
                if (observation) {
                    message += ` _Obs: ${observation.replace(/\r?\n/g, '\n  ')}_\n`;
                }
            });

            message += `\n*Resumo:*\n`;
            message += `- Subtotal: ${utils.formatCurrency(subtotal)}\n`;
            message += `- Taxa de entrega: ${utils.formatCurrency(deliveryFee)}\n`;
            message += `*Valor Total: ${utils.formatCurrency(total)}*`;

            // Send to WhatsApp
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${appState.currentUser?.phone}&text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');

            // Show success modal
            ui.showSuccessModal();

        } catch (error) {
            console.error('Error processing checkout:', error);
            alert('Erro ao processar pedido. Tente novamente.');
        }
    },

    handleKeydown(e) {
        // Add keyboard shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'k':
                    e.preventDefault();
                    ui.openCart();
                    break;
            }
        }
    }
};

// ===== INITIALIZATION =====
const app = {
    async init() {
        try {
            ui.showLoading();

            // Initialize event handlers
            eventHandlers.init();

            // Fetch user data
            appState.currentUser = await api.fetchUserData();
            appState.loadCartFromStorage();

            document.documentElement.style.setProperty(
                '--system-primary-color',
                appState.currentUser.color
            );
            document.documentElement.style.setProperty(
                '--system-primary-hover-color',
                utils.getDarkerSystemColor(appState.currentUser.color)
            );
            
            // Update brand name with user's business name
            if (appState.currentUser) {
                elements.brandName.textContent = appState.currentUser.name;
                const bannerUrl = typeof appState.currentUser.banner === 'string'
                    ? appState.currentUser.banner.trim()
                    : '';

                if (bannerUrl) {
                    elements.storeHeroImage.src = bannerUrl;
                    elements.storeHeroImage.classList.remove('hidden');
                } else {
                    elements.storeHeroImage.removeAttribute('src');
                    elements.storeHeroImage.classList.add('hidden');
                }
            }

            ui.hideLoading();
            await this.loadStoreContent();

        } catch (error) {
            console.error('Error initializing app:', error);
            ui.hideLoading();
            ui.showStoreStatus('Não foi possível carregar a loja. Tente novamente.', { retry: true });
        }
    },

    async loadStoreContent() {
        ui.showStoreStatus('Verificando o status da loja...', { loading: true });

        let storeAccount;
        try {
            storeAccount = await api.fetchStoreAccount(appState.currentUser.id);
        } catch (error) {
            ui.showStoreStatus('Não foi possível verificar o status da conta. Confira sua conexão e tente novamente.', { retry: true });
            ui.hideLoading();
            return;
        }

        if (storeAccount.status === 'suspenso') {
            ui.showStoreStatus('Esta conta está suspensa. Entre em contato com o suporte.');
            ui.hideLoading();
            return;
        }

        if (storeAccount.status !== 'ativo') {
            ui.showStoreStatus('Não foi possível confirmar o status da conta. Tente novamente.', { retry: true });
            ui.hideLoading();
            return;
        }

        ui.showStoreStatus('Loja verificada. Carregando produtos...', { loading: true });
        appState.userGoal = storeAccount.goal;
        appState.categories = await api.fetchCategories(appState.currentUser.id);

        appState.deliveryPlaces = await api.fetchDeliveryPlaces(appState.currentUser.id);
        ui.renderDeliveryPlaces(appState.deliveryPlaces);

        if (localStorage.getItem(CONFIG.GOAL_STORAGE_KEY) === 'true') {
            appState.goalAchieved = true;
        }

        const products = await api.fetchProducts(appState.currentUser.id);

        products.forEach(product => {
            appState.addProduct({
                _id: product._id,
                description: product.description,
                price: product.price,
                thumbnail_url: utils.getProductImageUrl(product),
                description2: product.description2,
                categoriaId: product.categoriaId ?? product.categoryId ?? null
            });
        });

        appState.cart.forEach((item, productId) => {
            const product = appState.getProduct(productId);
            if (product) {
                product.quantity = item.quantity;
                product.observation = item.observation || '';
            } else {
                appState.cart.delete(productId);
            }
        });
        appState.saveCartToStorage();

        ui.hideStoreStatus();
        ui.renderProducts(products, appState.categories);
        ui.updateCartBadge();
        ui.updateCartSidebar();
    },

    async retryStoreLoad() {
        try {
            await this.loadStoreContent();
        } catch (error) {
            console.error('Error loading store content:', error);
            ui.showStoreStatus('Não foi possível carregar a loja. Tente novamente.', { retry: true });
        }
    }
};

// ===== START APPLICATION =====
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// ===== EXPORT FOR DEBUGGING =====
if (typeof window !== 'undefined') {
    window.ConectaZapApp = {
        appState,
        ui,
        api,
        utils
    };
}

