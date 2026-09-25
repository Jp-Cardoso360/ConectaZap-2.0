// ===== CONSTANTS AND CONFIGURATION =====
const CONFIG = {
    API_BASE_URL: "https://netix-zae-api.vercel.app",
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

    getCartItems() {
        return Array.from(this.cart.values());
    }

    getCartTotal() {
        return this.getCartItems().reduce((total, item) => total + (item.price * item.quantity), 0);
    }

    getCartItemCount() {
        return this.getCartItems().reduce((total, item) => total + item.quantity, 0);
    }

    clearCart() {
        this.cart.clear();
        this.products.forEach(product => product.quantity = 0);
        this.saveCartToStorage();
    }

    // Storage management
    saveCartToStorage() {
        try {
            const cartData = Array.from(this.cart.entries());
            localStorage.setItem(CONFIG.CART_STORAGE_KEY, JSON.stringify(cartData));
        } catch (error) {
            console.warn('Failed to save cart to localStorage:', error);
        }
    }

    loadCartFromStorage() {
        try {
            const cartData = localStorage.getItem(CONFIG.CART_STORAGE_KEY);
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
    modalQuantity: document.getElementById('modal-quantity'),
    modalMinus: document.getElementById('modal-minus'),
    modalPlus: document.getElementById('modal-plus'),
    
    // Checkout Modal
    checkoutModal: document.getElementById('checkout-modal'),
    checkoutClose: document.getElementById('checkout-close'),
    checkoutForm: document.getElementById('checkout-form'),
    customerName: document.getElementById('customer-name'),
    customerAddress: document.getElementById('customer-address'),
    paymentMethod: document.getElementById('payment-method'),
    checkoutItems: document.getElementById('checkout-items'),
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

    getSystemColorVariants(color) {
        const primary = this.getSystemColor(color);
        const hex = primary.slice(1);
        const expandedHex = hex.length === 3
            ? hex.split('').map(digit => digit + digit).join('')
            : hex;
        const channels = [0, 2, 4].map(index => parseInt(expandedHex.slice(index, index + 2), 16));
        const adjust = (amount) => channels
            .map(channel => Math.max(0, Math.min(255, Math.round(channel + amount))))
            .map(channel => channel.toString(16).padStart(2, '0'))
            .join('');

        return {
            primary,
            dark: `#${adjust(-35)}`,
            light: `#${adjust(45)}`
        };
    }
};

// ===== API FUNCTIONS =====
const api = {
    async fetchProducts() {
        try {
            const urlPath = window.location.pathname;
            const userId = "6ab3f0698379f17db774368e";
            
            const response = await fetch(`${CONFIG.API_BASE_URL}/dashboard/${userId}`, { 
                mode: "cors" 
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const products = await response.json();
            return products.filter(product => product.status === true);
        } catch (error) {
            console.error('Error fetching products:', error);
            throw error;
        }
    },

    async fetchUserData() {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/sessions-list-counts`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const users = await response.json();
            const urlPath = window.location.pathname;
            const userId = urlPath.split("/").pop();
            
            const user = users.find(user => user._id === userId);
            
            if (!user) {
                throw new Error("User not found!");
            }
            
            return {
                name: user.nome,
                phone: user.tel,
                id: user._id,
                color: utils.getSystemColor(user.corSistema)
            };
        } catch (error) {
            console.error('Error fetching user data:', error);
            throw error;
        }
    },

    async fetchUserGoal() {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/metas/list`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const goals = await response.json();
            const urlPath = window.location.pathname;
            const userId = urlPath.split("/").pop();
            
            const userGoal = goals.find(goal => goal.user_id === userId);
            
            return userGoal ? userGoal.meta : null;
        } catch (error) {
            console.error('Error fetching user goal:', error);
            return null;
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
            elements.cartItems.innerHTML = cartItems.map(item => `
                <div class="cart-item">
                    <img src="${item.thumbnail_url}" alt="${item.description}" class="cart-item-image">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.description}</div>
                        <div class="cart-item-price">${utils.formatCurrency(item.price)}</div>
                        <div class="cart-item-quantity">Quantidade: ${item.quantity}</div>
                    </div>
                </div>
            `).join('');
        }

        // Check goal achievement
        this.checkGoalAchievement(total);
    },

    checkGoalAchievement(total) {
        if (appState.userGoal && total >= appState.userGoal && !appState.goalAchieved) {
            appState.goalAchieved = true;
            elements.goalAmount.textContent = utils.formatCurrency(appState.userGoal);
            utils.showModal(elements.goalAlert);
            localStorage.setItem(CONFIG.GOAL_STORAGE_KEY, 'true');
        }
    },

    renderProducts(products) {
        const productElements = products.map((product, index) => {
            const productElement = document.createElement('div');
            productElement.className = 'product-card';
            productElement.style.animationDelay = `${index * CONFIG.ANIMATION_DELAY}ms`;
            
            productElement.innerHTML = `
                <div class="product-image-container">
                    <img src="${product.thumbnail_url}" alt="${product.description}" class="product-image" loading="lazy">
                </div>
                <div class="product-content">
                    <h3 class="product-name">${product.description}</h3>
                    <div class="product-price">${utils.formatCurrency(product.price)}</div>
                    <div class="product-controls">
                        <div class="quantity-controls">
                            <button class="quantity-btn minus" data-product-id="${product._id}" data-action="decrease">
                                <i class="fas fa-minus"></i>
                            </button>
                            <span class="quantity-display" id="quantity-${product._id}">0</span>
                            <button class="quantity-btn plus" data-product-id="${product._id}" data-action="increase">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Add click event for product details
            productElement.addEventListener('click', (e) => {
                if (!e.target.closest('.quantity-controls')) {
                    this.showProductModal(product._id);
                }
            });

            return productElement;
        });

        elements.productsGrid.innerHTML = '';
        productElements.forEach(element => {
            elements.productsGrid.appendChild(element);
        });

        // Add quantity control event listeners
        this.attachQuantityControls();
    },

    attachQuantityControls() {
        const quantityButtons = document.querySelectorAll('.quantity-btn');
        
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

        elements.modalImage.src = product.thumbnail_url;
        elements.modalImage.alt = product.description;
        elements.modalName.textContent = product.description;
        elements.modalPrice.textContent = utils.formatCurrency(product.price);
        elements.modalDescription.textContent = product.description2 || "Sem descrição detalhada disponível.";
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
        const total = appState.getCartTotal();
        const itemCount = appState.getCartItemCount();

        elements.checkoutItems.textContent = itemCount;
        elements.checkoutTotal.textContent = utils.formatCurrency(total);

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
        const categoryButtons = elements.categoriesContainer.querySelectorAll('.category-btn');
        
        categoryButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons
                categoryButtons.forEach(btn => btn.classList.remove('active'));
                
                // Add active class to clicked button
                button.classList.add('active');
                
                // Scroll button into view
                button.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center',
                    block: 'nearest'
                });
            });
        });
    },

    async handleCheckoutSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const customerName = formData.get('name');
        const customerAddress = formData.get('address');
        const paymentMethod = formData.get('payment');

        if (!customerName || !customerAddress || !paymentMethod) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }

        try {
            const cartItems = appState.getCartItems();
            const total = appState.getCartTotal();
            const itemCount = appState.getCartItemCount();

            // Build WhatsApp message
            let message = `*Novo Pedido - ${appState.currentUser?.name || 'ConectaZap'}*\n\n`;
            message += `👤 *Cliente:* ${customerName}\n`;
            message += `📍 *Endereço:* ${customerAddress}\n`;
            message += `💳 *Pagamento:* ${paymentMethod}\n\n`;
            message += `🛍️ *Produtos:*\n`;

            cartItems.forEach(item => {
                message += `• ${item.description} (${item.quantity}x) - ${utils.formatCurrency(item.price * item.quantity)}\n`;
            });

            message += `\n📊 *Resumo:*\n`;
            message += `• Total de itens: ${itemCount}\n`;
            message += `• *Valor total: ${utils.formatCurrency(total)}*`;

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

            // Load cart from storage
            appState.loadCartFromStorage();

            // Initialize event handlers
            eventHandlers.init();

            // Fetch user data
            appState.currentUser = await api.fetchUserData();

            const systemColors = utils.getSystemColorVariants(appState.currentUser.color);
            document.documentElement.style.setProperty('--system-primary-color', systemColors.primary);
            document.documentElement.style.setProperty('--system-primary-dark', systemColors.dark);
            document.documentElement.style.setProperty('--system-primary-light', systemColors.light);
            
            // Update brand name with user's business name
            const brandNameElement = document.querySelector('.brand-name');
            if (brandNameElement && appState.currentUser) {
                brandNameElement.textContent = appState.currentUser.name;
            }

            // Fetch user goal
            appState.userGoal = await api.fetchUserGoal();

            // Check if goal was already achieved
            const goalAchieved = localStorage.getItem(CONFIG.GOAL_STORAGE_KEY);
            if (goalAchieved === 'true') {
                appState.goalAchieved = true;
            }

            // Fetch and render products
            const products = await api.fetchProducts();
            
            products.forEach(product => {
                appState.addProduct({
                    _id: product._id,
                    description: product.description,
                    price: product.price,
                    thumbnail_url: product.thumbnail_url,
                    description2: product.description2
                });
            });

            // Restore cart quantities from storage
            appState.cart.forEach((item, productId) => {
                const product = appState.getProduct(productId);
                if (product) {
                    product.quantity = item.quantity;
                }
            });

            ui.renderProducts(products);
            ui.updateCartBadge();
            ui.updateCartSidebar();

            ui.hideLoading();

        } catch (error) {
            console.error('Error initializing app:', error);
            ui.hideLoading();
            
            // Show error message
            elements.productsGrid.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <h3>Erro ao carregar produtos</h3>
                    <p>Tente recarregar a página ou entre em contato com o suporte.</p>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--primary-color); color: white; border: none; border-radius: 0.5rem; cursor: pointer;">
                        Recarregar Página
                    </button>
                </div>
            `;
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

