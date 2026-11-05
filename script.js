const CONFIG = {
    API_BASE_URL: window.CONECTAZAP_API_BASE_URL || (
        ['localhost', '127.0.0.1'].includes(window.location.hostname)
            ? 'http://localhost:3333'
            : 'https://netix-zae-api.vercel.app'
    ),
    DEFAULT_PRIMARY_COLOR: "#2ECC71",
    CART_STORAGE_KEY: "conectazap_cart",
    GOAL_STORAGE_KEY: "conectazap_goal_achieved"
};

class AppState {
    constructor() {
        this.products = new Map();
        this.cart = new Map();
        this.currentUser = null;
        this.storeHoursStatus = null;
        this.storeSlug = null;
        this.userGoal = null;
        this.deliveryPlaces = [];
        this.selectedDeliveryPlace = null;
        this.categories = [];
        this.activeCategoryId = 'all';
        this.productQuery = '';
        this.goalAchieved = false;
        this.isLoading = false;
    }

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

    updateCartItem(productId, quantity) {
        const product = this.getProduct(productId);
        if (!product) return false;

        if (quantity <= 0) {
            this.cart.delete(productId);
        } else {
            this.cart.set(productId, {
                ...product,
                basePrice: product.price,
                observation: '',
                adicionaisSelecionados: [],
                quantity: quantity
            });
        }

        this.updateProductCartQuantity(productId);
        this.saveCartToStorage();
        return true;
    }

    adjustCartItem(productId, adjustment) {
        const product = this.getProduct(productId);
        if (!product || !adjustment) return false;

        const defaultItem = this.cart.get(productId);
        if (adjustment > 0) {
            if (defaultItem) {
                defaultItem.quantity += adjustment;
            } else {
                this.cart.set(productId, {
                    ...product,
                    basePrice: product.price,
                    observation: '',
                    adicionaisSelecionados: [],
                    quantity: adjustment
                });
            }
        } else {
            const itemToReduce = defaultItem || [...this.cart.entries()]
                .reverse()
                .find(([, item]) => String(item._id) === String(productId))?.[1];
            if (!itemToReduce) return false;
            itemToReduce.quantity = Math.max(0, itemToReduce.quantity + adjustment);
            if (itemToReduce.quantity === 0) {
                const cartKey = [...this.cart.entries()]
                    .find(([, item]) => item === itemToReduce)?.[0];
                if (cartKey !== undefined) this.cart.delete(cartKey);
            }
        }

        this.updateProductCartQuantity(productId);
        this.saveCartToStorage();
        return true;
    }

    removeCartItem(cartKey) {
        const item = this.cart.get(cartKey);
        if (!item) return false;

        this.cart.delete(cartKey);
        this.updateProductCartQuantity(item._id);
        this.saveCartToStorage();
        return true;
    }

    updateProductCartQuantity(productId) {
        const product = this.getProduct(productId);
        if (!product) return;

        product.quantity = this.getCartItems()
            .filter(item => String(item._id) === String(productId))
            .reduce((total, item) => total + item.quantity, 0);
    }

    setConfiguredCartItem(productId, quantity, observation, adicionaisSelecionados) {
        const product = this.getProduct(productId);
        if (!product) return false;

        const normalizedObservation = observation.trim();
        const configuration = JSON.stringify([
            String(productId),
            product.price,
            normalizedObservation,
            adicionaisSelecionados.map(additional => [
                additional.grupoId,
                additional.itemId,
                additional.quantidade
            ]).sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)))
        ]);
        const cartKey = `configured:${encodeURIComponent(configuration)}`;
        const additionalPrice = adicionaisSelecionados.reduce(
            (total, additional) => total + additional.preco * additional.quantidade,
            0
        );
        const existingItem = this.cart.get(cartKey);
        this.cart.set(cartKey, {
            ...product,
            basePrice: product.price,
            price: product.price + additionalPrice,
            quantity: (existingItem?.quantity || 0) + quantity,
            observation: normalizedObservation,
            adicionaisSelecionados
        });
        this.updateProductCartQuantity(productId);
        this.saveCartToStorage();
        return true;
    }

    updateProductObservation(productId, observation) {
        const product = this.getProduct(productId);
        if (!product) return false;

        product.observation = observation;
        this.saveCartToStorage();
        return true;
    }

    getCartItems() {
        return Array.from(this.cart.values());
    }

    getCartItemUnitPrice(item) {
        const additionsPrice = (item.adicionaisSelecionados || []).reduce(
            (total, additional) => total + Number(additional.preco) * Number(additional.quantidade || 1),
            0
        );
        const basePrice = item.basePrice != null && Number.isFinite(Number(item.basePrice))
            ? Number(item.basePrice)
            : Number(item.price) - additionsPrice;
        return basePrice + additionsPrice;
    }

    getCartTotal() {
        return this.getCartItems().reduce(
            (total, item) => total + this.getCartItemUnitPrice(item) * item.quantity,
            0
        );
    }

    getGroupedCartItems(cartItems = this.getCartItems()) {
        const groupedItems = new Map();
        cartItems.forEach(item => {
            const additions = (item.adicionaisSelecionados || []).map(additional => [
                String(additional.grupoId ?? ''),
                String(additional.itemId ?? additional.nome),
                Number(additional.quantidade || 1),
                Number(additional.preco)
            ]).sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)));
            const signature = JSON.stringify([
                String(item._id),
                this.getCartItemUnitPrice(item),
                String(item.observation || '').trim(),
                additions
            ]);
            const existing = groupedItems.get(signature);
            if (existing) {
                existing.quantity += item.quantity;
            } else {
                groupedItems.set(signature, {
                    ...item,
                    price: this.getCartItemUnitPrice(item),
                    quantity: item.quantity,
                    adicionaisSelecionados: item.adicionaisSelecionados || []
                });
            }
        });
        return [...groupedItems.values()];
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

const appState = new AppState();

const elements = {
    loadingScreen: document.getElementById('loading'),
    
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
    storeSuspendedScreen: document.getElementById('store-suspended-screen'),
    brandName: document.querySelector('.brand-name'),
    storeHeroImage: document.querySelector('.store-hero-image'),
    storeOpeningStatus: document.getElementById('store-opening-status'),
    storeOpeningStatusText: document.getElementById('store-opening-status-text'),
    storeDetailsScreen: document.getElementById('store-details-screen'),
    storeDetailsClose: document.getElementById('store-details-close'),
    storeDetailsLogo: document.getElementById('store-details-logo'),
    storeDetailsLogoPlaceholder: document.getElementById('store-details-logo-placeholder'),
    storeDetailsName: document.getElementById('store-details-name'),
    storeDetailsStatus: document.getElementById('store-details-status'),
    storeDetailsStatusText: document.getElementById('store-details-status-text'),
    storeDetailsHours: document.getElementById('store-details-hours'),
    storeDetailsDescription: document.getElementById('store-details-description'),
    
    categoriesContainer: document.getElementById('categories'),
    
    productsGrid: document.getElementById('products-grid'),
    
    cartSidebar: document.getElementById('cart-sidebar'),
    cartOverlay: document.getElementById('cart-overlay'),
    cartClose: document.getElementById('cart-close'),
    cartItems: document.getElementById('cart-items'),
    cartEmpty: document.getElementById('cart-empty'),
    totalItems: document.getElementById('total-items'),
    totalPrice: document.getElementById('total-price'),
    checkoutBtn: document.getElementById('checkout-btn'),
    cartOrderNotice: document.getElementById('cart-order-notice'),
    
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
    modalAdditionGroups: document.getElementById('modal-addition-groups'),
    modalAddToCart: document.getElementById('modal-add-to-cart'),

    storeClosedNotice: document.getElementById('store-closed-notice'),
    storeClosedConfirm: document.getElementById('store-closed-confirm'),
    
    checkoutModal: document.getElementById('checkout-modal'),
    checkoutClose: document.getElementById('checkout-close'),
    checkoutForm: document.getElementById('checkout-form'),
    checkoutSubmit: document.querySelector('#checkout-form button[type="submit"]'),
    checkoutOrderNotice: document.getElementById('checkout-order-notice'),
    customerName: document.getElementById('customer-name'),
    customerAddressGroup: document.getElementById('customer-address-group'),
    customerAddress: document.getElementById('customer-address'),
    deliveryPlace: document.getElementById('delivery-place'),
    paymentMethod: document.getElementById('payment-method'),
    checkoutItems: document.getElementById('checkout-items'),
    checkoutDeliveryFee: document.getElementById('checkout-delivery-fee'),
    checkoutTotal: document.getElementById('checkout-total'),
    
    successModal: document.getElementById('success-modal'),
    successClose: document.getElementById('success-close'),
    
    goalAlert: document.getElementById('goal-alert'),
    goalAmount: document.getElementById('goal-amount'),
    continueShopping: document.getElementById('continue-shopping'),
    finishOrder: document.getElementById('finish-order')
};

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

    getStoreSlug() {
        const segments = window.location.pathname.split('/').filter(segment => segment.trim());
        const lastSegment = segments.pop();
        if (!lastSegment) return '';

        try {
            return decodeURIComponent(lastSegment).trim();
        } catch (error) {
            console.warn('Invalid store slug encoding in URL:', error);
            return lastSegment.trim();
        }
    },

    getStoreImageUrl(value) {
        if (typeof value === 'string') {
            const url = value.trim();
            return ['null', 'undefined'].includes(url.toLocaleLowerCase('pt-BR')) ? '' : url;
        }
        if (!value || typeof value !== 'object') return '';

        const url = value.url || value.src || value.href || value.imageUrl || value.image_url;
        return typeof url === 'string' ? this.getStoreImageUrl(url) : '';
    },

    getStoreText(value) {
        if (typeof value !== 'string' && typeof value !== 'number') return '';
        const text = String(value).trim();
        return ['null', 'undefined'].includes(text.toLocaleLowerCase('pt-BR')) ? '' : text;
    },

    normalizeDayName(value) {
        return String(value ?? '')
            .trim()
            .toLocaleLowerCase('pt-BR')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
    },

    parseStoreTime(value) {
        if (typeof value !== 'string') return null;
        const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
        if (!match) return null;
        return Number(match[1]) * 60 + Number(match[2]);
    },

    getStoreDayIndex(value) {
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) {
            return value;
        }

        const normalized = this.normalizeDayName(value);
        const aliases = [
            ['domingo', 'dom', 'sunday', 'sun', '0'],
            ['segunda', 'segundafeira', 'seg', 'monday', 'mon', '1'],
            ['terca', 'tercafeira', 'ter', 'tuesday', 'tue', '2'],
            ['quarta', 'quartafeira', 'qua', 'wednesday', 'wed', '3'],
            ['quinta', 'quintafeira', 'qui', 'thursday', 'thu', '4'],
            ['sexta', 'sextafeira', 'sex', 'friday', 'fri', '5'],
            ['sabado', 'sab', 'saturday', 'sat', '6']
        ];
        return aliases.findIndex(day => day.includes(normalized));
    },

    parseStoreIntervals(value) {
        if (typeof value === 'string') {
            const intervals = [];
            const pattern = /(\d{1,2}:\d{2})\s*(?:-|–|—|às|as|a|até|ate)\s*(\d{1,2}:\d{2})/gi;
            let match;
            while ((match = pattern.exec(value)) !== null) {
                const start = this.parseStoreTime(match[1]);
                const end = this.parseStoreTime(match[2]);
                if (start !== null && end !== null && start !== end) {
                    intervals.push({ start, end });
                }
            }
            return intervals;
        }

        if (Array.isArray(value)) {
            if (value.length === 2) {
                const start = this.parseStoreTime(value[0]);
                const end = this.parseStoreTime(value[1]);
                if (start !== null && end !== null && start !== end) {
                    return [{ start, end }];
                }
            }
            return value.flatMap(item => this.parseStoreIntervals(item));
        }

        if (!value || typeof value !== 'object') return [];

        const startFields = ['inicio', 'horaInicio', 'hora_inicio', 'abertura', 'horaAbertura', 'hora_abertura', 'abre', 'start', 'from', 'open'];
        const endFields = ['fim', 'horaFim', 'hora_fim', 'fechamento', 'horaFechamento', 'hora_fechamento', 'fecha', 'end', 'to', 'close'];
        const startValue = startFields.map(field => value[field]).find(field => field != null);
        const endValue = endFields.map(field => value[field]).find(field => field != null);
        const start = this.parseStoreTime(startValue);
        const end = this.parseStoreTime(endValue);
        const intervals = start !== null && end !== null && start !== end ? [{ start, end }] : [];

        for (const field of ['intervalos', 'intervals', 'turnos', 'horarios', 'horario']) {
            if (value[field] != null) intervals.push(...this.parseStoreIntervals(value[field]));
        }
        return intervals;
    },

    isStoreDayDisabled(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return value === false || value === 0 ||
                (typeof value === 'string' && ['fechado', 'closed', 'false', '0'].includes(this.normalizeDayName(value)));
        }

        const toBoolean = candidate => {
            if (typeof candidate === 'boolean') return candidate;
            if (candidate === 0 || candidate === 1) return Boolean(candidate);
            if (typeof candidate !== 'string') return null;
            const normalized = this.normalizeDayName(candidate);
            if (['true', 'sim', '1', 'ativo', 'aberto', 'open'].includes(normalized)) return true;
            if (['false', 'nao', '0', 'inativo', 'fechado', 'closed'].includes(normalized)) return false;
            return null;
        };
        const disabledFields = ['fechado', 'closed'];
        const enabledFields = ['ativo', 'active', 'enabled', 'isActive', 'aberto', 'funciona', 'funcionando'];
        if (disabledFields.some(field => toBoolean(value[field]) === true)) return true;
        if (['status', 'situacao', 'situação'].some(field => {
            const state = this.normalizeDayName(value[field]);
            return ['fechado', 'closed', 'desativado', 'inativo'].includes(state);
        })) return true;
        return enabledFields.some(field => toBoolean(value[field]) === false);
    },

    parseStoreSchedule(schedule) {
        let source = schedule;
        if (typeof source === 'string') {
            try {
                source = JSON.parse(source);
            } catch {
                return null;
            }
        }
        if (!source || typeof source !== 'object') return null;
        source = source.diasSemana ?? source.dias ?? source.semana ??
            source.horariosFuncionamento ?? source;
        const values = Array(7).fill(null);

        if (Array.isArray(source)) {
            source.forEach((value, index) => {
                const dayValue = value && typeof value === 'object'
                    ? value.dia ?? value.day ?? value.diaSemana ?? value.weekday
                    : null;
                const dayIndex = dayValue == null ? index : this.getStoreDayIndex(dayValue);
                if (dayIndex >= 0 && dayIndex <= 6) values[dayIndex] = value;
            });
        } else {
            Object.entries(source).forEach(([key, value]) => {
                const dayIndex = this.getStoreDayIndex(key);
                if (dayIndex >= 0) values[dayIndex] = value;
            });
        }

        const days = values.map(value => ({
            configured: value != null,
            disabled: this.isStoreDayDisabled(value),
            intervals: this.parseStoreIntervals(value)
        }));
        const available = days.some(day => day.disabled || day.intervals.length > 0);
        return available ? days : null;
    },

    getStoreHoursStatus(schedule, now = new Date()) {
        const days = this.parseStoreSchedule(schedule);
        if (!days) return { available: false, isOpen: false, days: null };

        const dayIndex = now.getDay();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const today = days[dayIndex];
        if (today.disabled) return { available: true, isOpen: false, days };

        const previousDay = days[(dayIndex + 6) % 7];
        const isOpenOvernight = !previousDay.disabled && previousDay.intervals.some(({ start, end }) => (
            end < start && currentMinutes < end
        ));
        if (isOpenOvernight) return { available: true, isOpen: true, days };
        if (!today.configured || !today.intervals.length) {
            return { available: false, isOpen: false, days };
        }

        const isOpenToday = today.intervals.some(({ start, end }) => (
            end > start
                ? currentMinutes >= start && currentMinutes < end
                : currentMinutes >= start
        ));
        return { available: true, isOpen: isOpenToday, days };
    },

    formatStoreIntervals(intervals) {
        const formatTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        return intervals
            .map(({ start, end }) => `${formatTime(start)} às ${formatTime(end)}`)
            .join(' · ');
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

const api = {
    async fetchMenuBySlug(slug) {
        try {
            const response = await fetch(
                `${CONFIG.API_BASE_URL}/cardapio/${encodeURIComponent(slug)}`
            );

            if (!response.ok) {
                const error = new Error(`HTTP error! status: ${response.status}`);
                error.status = response.status;
                throw error;
            }

            const result = await response.json();
            if (!result || !result.loja || !Array.isArray(result.produtos)) {
                throw new Error('A resposta do cardápio não contém loja e produtos válidos.');
            }

            return result;
        } catch (error) {
            console.error('Error fetching store menu:', error);
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
            const account = Array.isArray(records)
                ? records.find(record => {
                    const ownerId = record.user_id && typeof record.user_id === 'object'
                        ? record.user_id._id || record.user_id.id
                        : record.user_id;
                    return ownerId != null && String(ownerId) === String(userId);
                })
                : null;

            if (!account) {
                throw new Error('No account status record found for this store.');
            }

            return {
                status: account.status,
                goal: account.meta ?? null
            };
        } catch (error) {
            console.error('Error verifying store account:', error);
            throw error;
        }
    },

};

const ui = {
    productModalState: {
        groups: [],
        quantity: 1
    },
    productRevealObserver: null,
    storeCatalogReady: false,
    storeClosedNoticeDismissed: false,
    storeClosedPreviousOverflow: '',

    storeDetailsOpen: false,
    storeDetailsPreviousOverflow: '',
    storeDetailsInertStates: [],
    storeDetailsUrl: '',
    storeDetailsPreviousHistoryState: null,

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
        this.storeCatalogReady = true;
        this.maybeShowStoreClosedNotice();
    },

    maybeShowStoreClosedNotice() {
        if (
            !this.storeCatalogReady ||
            this.storeClosedNoticeDismissed ||
            !appState.storeHoursStatus?.available ||
            appState.storeHoursStatus.isOpen
        ) return;

        this.storeClosedPreviousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        elements.storeClosedNotice.classList.remove('hidden');
        elements.storeClosedConfirm.focus({ preventScroll: true });
    },

    dismissStoreClosedNotice() {
        this.storeClosedNoticeDismissed = true;
        elements.storeClosedNotice.classList.add('hidden');
        document.body.style.overflow = this.storeClosedPreviousOverflow;
        elements.storeOpeningStatus.focus({ preventScroll: true });
    },

    revealProductCards(cards) {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion || !('IntersectionObserver' in window)) {
            cards.forEach(card => card.classList.add('is-revealed'));
            return;
        }

        if (!this.productRevealObserver) {
            this.productRevealObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add('is-revealed');
                    this.productRevealObserver.unobserve(entry.target);
                });
            }, {
                threshold: 0.08,
                rootMargin: '0px 0px 24px 0px'
            });
        }

        cards.forEach(card => this.productRevealObserver.observe(card));
    },

    updateStoreOpeningStatus() {
        const store = appState.currentUser;
        if (!store) return;

        const status = utils.getStoreHoursStatus(store.hours);
        appState.storeHoursStatus = status;
        const label = status.available
            ? status.isOpen ? 'Loja aberta' : 'Loja fechada'
            : 'Horário não informado';
        const statusClass = status.available
            ? status.isOpen ? 'is-open' : 'is-closed'
            : 'is-unavailable';

        elements.storeOpeningStatusText.textContent = label;
        elements.storeOpeningStatus.setAttribute(
            'aria-label',
            `${label}. Abrir detalhes e horários de funcionamento da loja.`
        );
        elements.storeOpeningStatus.classList.remove('is-open', 'is-closed', 'is-unavailable');
        elements.storeOpeningStatus.classList.add(statusClass);
        elements.storeOpeningStatus.classList.remove('hidden');
        this.updateStoreDetailsStatus(status);
        this.updateOrderAvailability(status);
        this.maybeShowStoreClosedNotice();
        return status;
    },

    updateOrderAvailability(status = appState.storeHoursStatus) {
        const unavailableMessage = !status?.available
            ? 'Horário de funcionamento indisponível. Não é possível enviar pedidos agora.'
            : !status.isOpen
                ? 'A loja está fechada no momento. Pedidos poderão ser enviados durante o horário de funcionamento.'
                : '';
        const hasUnavailableMessage = Boolean(unavailableMessage);

        elements.checkoutBtn.disabled = appState.getCartItemCount() === 0 || hasUnavailableMessage;
        elements.checkoutBtn.title = unavailableMessage;
        elements.checkoutSubmit.disabled = hasUnavailableMessage;
        [elements.cartOrderNotice, elements.checkoutOrderNotice].forEach(notice => {
            notice.textContent = unavailableMessage;
            notice.classList.toggle('hidden', !hasUnavailableMessage);
        });
    },

    updateStoreDetailsStatus(status) {
        const label = status.available
            ? status.isOpen ? 'Loja aberta' : 'Loja fechada'
            : 'Horário não informado';
        const statusClass = status.available
            ? status.isOpen ? 'is-open' : 'is-closed'
            : 'is-unavailable';
        elements.storeDetailsStatusText.textContent = label;
        elements.storeDetailsStatus.classList.remove('is-open', 'is-closed', 'is-unavailable');
        elements.storeDetailsStatus.classList.add(statusClass);
    },

    renderStoreDetails() {
        const store = appState.currentUser;
        if (!store) return;

        elements.storeDetailsName.textContent = store.displayName || 'Nome da loja não informado';
        elements.storeDetailsDescription.textContent = store.about || 'Descrição não informada.';
        const logoUrl = utils.getStoreImageUrl(store.logo);
        if (logoUrl) {
            elements.storeDetailsLogo.src = logoUrl;
            elements.storeDetailsLogo.alt = store.displayName
                ? `Logo da ${store.displayName}`
                : 'Logo da loja';
            elements.storeDetailsLogo.classList.remove('hidden');
            elements.storeDetailsLogoPlaceholder.classList.add('hidden');
        } else {
            elements.storeDetailsLogo.removeAttribute('src');
            elements.storeDetailsLogo.alt = '';
            elements.storeDetailsLogo.classList.add('hidden');
            elements.storeDetailsLogoPlaceholder.classList.remove('hidden');
        }

        const days = appState.storeHoursStatus?.days;
        const weekdayNames = [
            'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
            'Quinta-feira', 'Sexta-feira', 'Sábado'
        ];
        elements.storeDetailsHours.replaceChildren();
        weekdayNames.forEach((name, index) => {
            const item = document.createElement('li');
            const dayName = document.createElement('span');
            const hours = document.createElement('span');
            dayName.textContent = name;
            hours.textContent = !days
                ? 'Horário não informado'
                : days[index].disabled
                    ? 'Fechado'
                    : days[index].intervals.length
                        ? utils.formatStoreIntervals(days[index].intervals)
                        : days[index].configured
                            ? 'Horário não informado'
                            : 'Horário não informado';
            item.append(dayName, hours);
            elements.storeDetailsHours.append(item);
        });
        this.updateStoreDetailsStatus(appState.storeHoursStatus || {
            available: false,
            isOpen: false
        });
    },

    openStoreDetails() {
        if (this.storeDetailsOpen || !appState.currentUser) return;
        this.renderStoreDetails();
        this.storeDetailsOpen = true;
        this.storeDetailsPreviousOverflow = document.body.style.overflow;
        this.storeDetailsInertStates = [...document.body.children]
            .filter(child => child !== elements.storeDetailsScreen)
            .map(child => ({ element: child, inert: child.inert }));
        this.storeDetailsInertStates.forEach(({ element }) => { element.inert = true; });
        document.body.style.overflow = 'hidden';

        this.storeDetailsUrl = window.location.href;
        this.storeDetailsPreviousHistoryState = window.history.state;
        window.history.pushState(
            { ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}), storeDetailsOpen: true },
            '',
            this.storeDetailsUrl
        );
        elements.storeDetailsScreen.classList.remove('hidden');
        elements.storeDetailsScreen.setAttribute('aria-hidden', 'false');
        elements.storeDetailsClose.focus({ preventScroll: true });
    },

    closeStoreDetails({ restoreHistory = true, restoreFocus = true } = {}) {
        if (!this.storeDetailsOpen) return;
        this.storeDetailsOpen = false;
        elements.storeDetailsScreen.classList.add('hidden');
        elements.storeDetailsScreen.setAttribute('aria-hidden', 'true');
        this.storeDetailsInertStates.forEach(({ element, inert }) => { element.inert = inert; });
        this.storeDetailsInertStates = [];
        document.body.style.overflow = this.storeDetailsPreviousOverflow;

        if (restoreHistory && window.history.state?.storeDetailsOpen) {
            window.history.replaceState(
                this.storeDetailsPreviousHistoryState,
                '',
                this.storeDetailsUrl
            );
        }
        if (restoreFocus) elements.storeOpeningStatus.focus({ preventScroll: true });
    },

    showSuspendedStore() {
        document.body.classList.add('store-suspended');
        [...document.body.children]
            .filter(child => child !== elements.storeSuspendedScreen)
            .forEach(child => { child.inert = true; });
        elements.storeSuspendedScreen.classList.remove('hidden');
        elements.storeSuspendedScreen.focus({ preventScroll: true });
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

        elements.totalItems.textContent = itemCount;
        elements.totalPrice.textContent = utils.formatCurrency(total);

        this.updateOrderAvailability();

        if (cartItems.length === 0) {
            utils.showElement(elements.cartEmpty);
            utils.hideElement(elements.cartItems);
        } else {
            utils.hideElement(elements.cartEmpty);
            utils.showElement(elements.cartItems);

            elements.cartItems.replaceChildren();
            cartItems.forEach(item => {
                const imageUrl = utils.getProductImageUrl(item);
                const cartItem = document.createElement('div');
                cartItem.className = 'cart-item';

                const image = document.createElement('img');
                image.className = 'cart-item-image';
                image.alt = item.description;
                if (imageUrl) image.src = imageUrl;

                const info = document.createElement('div');
                info.className = 'cart-item-info';
                const name = document.createElement('div');
                name.className = 'cart-item-name';
                name.textContent = item.description;
                const price = document.createElement('div');
                price.className = 'cart-item-price';
                price.textContent = utils.formatCurrency(item.price);
                const quantity = document.createElement('div');
                quantity.className = 'cart-item-quantity';
                quantity.textContent = `Quantidade: ${item.quantity}`;
                info.append(name, price, quantity);
                if (item.adicionaisSelecionados?.length) {
                    const additions = document.createElement('div');
                    additions.className = 'cart-item-addons';
                    additions.textContent = item.adicionaisSelecionados
                        .map(additional => {
                            const quantity = additional.quantidade || 1;
                            const price = additional.preco === 0
                                ? 'Grátis'
                                : `${quantity}x ${utils.formatCurrency(additional.preco)}`;
                            return `${additional.nome} (${price})`;
                        })
                        .join(', ');
                    info.appendChild(additions);
                }

                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'cart-item-remove';
                removeButton.dataset.cartKey = [...appState.cart.entries()]
                    .find(([, cartItem]) => cartItem === item)?.[0] ?? item._id;
                removeButton.setAttribute(
                    'aria-label',
                    `Remover ${item.description} desta personalização do carrinho`
                );
                const icon = document.createElement('i');
                icon.className = 'fas fa-times';
                icon.setAttribute('aria-hidden', 'true');
                removeButton.appendChild(icon);

                cartItem.append(image, info, removeButton);
                elements.cartItems.appendChild(cartItem);
            });
        }

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
                productElement.dataset.categoryId = categoryId;
                productElement.dataset.searchText =
                    `${product.description} ${product.description2 || ''}`.toLocaleLowerCase('pt-BR');
                productElement.classList.add('product-card-reveal');

                const imageContainer = document.createElement('div');
                imageContainer.className = 'product-image-container';
                const productImage = document.createElement('img');
                productImage.alt = product.description;
                productImage.className = 'product-image';
                productImage.loading = 'lazy';
                const imageUrl = utils.getProductImageUrl(product);
                if (imageUrl) {
                    productImage.src = imageUrl;
                    productImage.addEventListener('error', () => {
                        imageContainer.classList.add('image-unavailable');
                        productImage.removeAttribute('src');
                    }, { once: true });
                } else {
                    imageContainer.classList.add('image-unavailable');
                }
                imageContainer.appendChild(productImage);

                const content = document.createElement('div');
                content.className = 'product-content';
                const name = document.createElement('h3');
                name.className = 'product-name';
                name.textContent = product.description;
                const description = document.createElement('p');
                description.className = 'product-description';
                description.textContent = product.description2 || '';

                const purchaseRow = document.createElement('div');
                purchaseRow.className = 'product-purchase-row';
                const price = document.createElement('div');
                price.className = 'product-price';
                price.textContent = utils.formatCurrency(product.price);

                const controls = document.createElement('div');
                controls.className = 'product-controls';
                const quantityControls = document.createElement('div');
                quantityControls.className = 'quantity-controls';
                ['decrease', 'increase'].forEach(action => {
                    if (action === 'increase') {
                        const quantity = document.createElement('span');
                        quantity.className = 'quantity-display';
                        quantity.id = `quantity-${product._id}`;
                        quantity.textContent = String(product.quantity ?? 0);
                        quantityControls.appendChild(quantity);
                    }

                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = `quantity-btn ${action === 'increase' ? 'plus' : 'minus'}`;
                    button.dataset.productId = product._id;
                    button.dataset.action = action;
                    button.setAttribute(
                        'aria-label',
                        action === 'increase' ? 'Aumentar quantidade' : 'Diminuir quantidade'
                    );
                    const icon = document.createElement('i');
                    icon.className = `fas fa-${action === 'increase' ? 'plus' : 'minus'}`;
                    icon.setAttribute('aria-hidden', 'true');
                    button.appendChild(icon);
                    quantityControls.appendChild(button);
                });
                controls.appendChild(quantityControls);
                purchaseRow.append(price, controls);
                content.append(name, description, purchaseRow);
                productElement.append(imageContainer, content);

                productElement.addEventListener('click', event => {
                    if (!event.target.closest('.quantity-controls')) {
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

        this.revealProductCards([...elements.productsGrid.querySelectorAll('.product-card-reveal')]);

        elements.productsEmpty.classList.toggle(
            'hidden',
            products.length > 0
        );
        this.renderCategoryTabs(populatedCategories.map(category => ({
            id: category._displayId,
            name: category._displayName
        })), uncategorizedProducts.length > 0);
        this.filterProducts(elements.searchInput.value);

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

                const previousQuantity = product.quantity;
                const adjustment = action === 'increase' ? 1 : -1;
                if (!appState.adjustCartItem(productId, adjustment)) return;
                const newQuantity = appState.getProduct(productId).quantity;
                this.updateProductQuantityDisplay(productId, newQuantity);
                this.updateCartBadge();
                this.updateCartSidebar();

                if (newQuantity > previousQuantity) {
                    utils.animateElement(elements.cartButton, 'bounce');
                }
            });
        });
    },

    updateProductQuantityDisplay(productId, quantity) {
        const quantityElement = document.getElementById(`quantity-${productId}`);
        if (quantityElement) {
            quantityElement.textContent = String(quantity ?? 0);
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
        const groups = this.getProductAdditionalGroups(product);
        this.productModalState = {
            groups,
            quantity: 1
        };
        elements.modalQuantity.textContent = this.productModalState.quantity;
        elements.productModal.dataset.productId = productId;
        elements.modalObservation.value = '';
        this.renderProductAdditionalGroups(groups, []);
        this.updateProductModalTotal();

        utils.showModal(elements.productModal);
    },

    getProductAdditionalGroups(product) {
        if (!Array.isArray(product.gruposAdicionaisIds)) return [];

        return product.gruposAdicionaisIds.flatMap((group, groupIndex) => {
            if (!group || typeof group !== 'object') return [];
            const rawItems = group.itens ?? group.items ?? group.adicionais ??
                group.opcoes ?? group.options;
            if (!Array.isArray(rawItems)) return [];

            const items = rawItems.flatMap((item, itemIndex) => {
                if (!item || typeof item !== 'object') return [];
                const name = String(item.nome ?? item.name ?? item.description ?? item.descricao ?? '').trim();
                const price = Number(item.preco ?? item.price ?? item.valor ?? 0);
                if (!name || !Number.isFinite(price)) return [];
                return [{
                    id: String(item._id ?? item.id ?? itemIndex),
                    name,
                    price
                }];
            });
            if (!items.length) return [];

            const maxValue = Number(group.max ?? group.maximo ?? group.quantidadeMaxima ?? items.length);
            const minValue = Number(group.min ?? group.minimo ?? group.quantidadeMinima ?? 0);
            const max = Number.isFinite(maxValue) ? Math.max(0, Math.floor(maxValue)) : items.length;
            const required = group.obrigatorio === true || group.obrigatorio === 1 ||
                ['true', '1'].includes(String(group.obrigatorio).toLowerCase());
            const configuredMin = Number.isFinite(minValue)
                ? Math.max(0, Math.ceil(minValue))
                : (required ? 1 : 0);
            const min = Math.min(max, required && configuredMin === 0 ? 1 : configuredMin);

            return [{
                id: String(group._id ?? group.id ?? groupIndex),
                name: String(group.nome ?? group.name ?? group.titulo ?? group.title ?? '').trim() ||
                    `Adicionais ${groupIndex + 1}`,
                required,
                min,
                max,
                items
            }];
        });
    },

    renderProductAdditionalGroups(groups, selectedAdditions) {
        elements.modalAdditionGroups.replaceChildren();
        elements.modalAdditionGroups.classList.toggle('hidden', groups.length === 0);

        groups.forEach((group, groupIndex) => {
            const fieldset = document.createElement('fieldset');
            fieldset.className = 'additional-group';
            fieldset.dataset.groupIndex = groupIndex;

            const title = document.createElement('legend');
            title.className = 'additional-group-title';
            title.textContent = group.name;

            const rule = document.createElement('p');
            rule.className = 'additional-group-rule';
            const choiceRule = group.min > 0
                ? `Mínimo de ${group.min} ${group.min === 1 ? 'unidade' : 'unidades'} • até ${group.max} de cada opção`
                : `Até ${group.max} de cada opção`;
            rule.textContent = `${group.required ? 'Obrigatório' : 'Opcional'} • ${choiceRule}`;
            fieldset.append(title, rule);

            group.items.forEach((item, itemIndex) => {
                const row = document.createElement('div');
                row.className = 'additional-option';

                const selectedAddition = selectedAdditions.find(additional => (
                    (additional.itemId && additional.itemId === item.id &&
                        (!additional.grupoId || additional.grupoId === group.id)) ||
                    (!additional.itemId && additional.nome === item.name && Number(additional.preco) === item.price)
                ));
                const requestedQuantity = selectedAddition
                    ? Math.max(1, Number(selectedAddition.quantidade) || 1)
                    : 0;
                const itemQuantity = Math.min(requestedQuantity, group.max);
                const quantity = document.createElement('span');
                quantity.className = 'additional-option-quantity';
                quantity.textContent = String(itemQuantity);
                quantity.dataset.groupIndex = groupIndex;
                quantity.dataset.itemIndex = itemIndex;

                const itemName = document.createElement('span');
                itemName.className = 'additional-option-name';
                itemName.textContent = item.name;

                const itemPrice = document.createElement('span');
                itemPrice.className = 'additional-option-price';
                itemPrice.textContent = item.price === 0
                    ? 'Grátis'
                    : utils.formatCurrency(item.price);

                const quantityControl = document.createElement('div');
                quantityControl.className = 'additional-quantity-control';

                const minusButton = document.createElement('button');
                minusButton.type = 'button';
                minusButton.className = 'additional-quantity-button';
                minusButton.dataset.action = 'decrease';
                minusButton.dataset.groupIndex = groupIndex;
                minusButton.dataset.itemIndex = itemIndex;
                minusButton.setAttribute('aria-label', `Remover uma unidade de ${item.name}`);
                minusButton.textContent = '−';
                minusButton.disabled = Number(quantity.textContent) === 0;

                const plusButton = document.createElement('button');
                plusButton.type = 'button';
                plusButton.className = 'additional-quantity-button';
                plusButton.dataset.action = 'increase';
                plusButton.dataset.groupIndex = groupIndex;
                plusButton.dataset.itemIndex = itemIndex;
                plusButton.setAttribute('aria-label', `Adicionar uma unidade de ${item.name}`);
                plusButton.textContent = '+';

                quantityControl.append(minusButton, quantity, plusButton);
                row.append(itemName, itemPrice, quantityControl);
                fieldset.appendChild(row);
            });

            elements.modalAdditionGroups.appendChild(fieldset);
        });

        this.updateAdditionalQuantityControls();
    },

    getSelectedProductAdditions() {
        return [...elements.modalAdditionGroups.querySelectorAll('.additional-option-quantity')]
            .flatMap(quantityElement => {
                const quantity = Number(quantityElement.textContent);
                if (!quantity) return [];

                const group = this.productModalState.groups[Number(quantityElement.dataset.groupIndex)];
                const item = group.items[Number(quantityElement.dataset.itemIndex)];
                return [{
                    nome: item.name,
                    preco: item.price,
                    quantidade: quantity,
                    grupoNome: group.name,
                    grupoId: group.id,
                    itemId: item.id
                }];
            });
    },

    getGroupSelectedQuantity(groupIndex) {
        return [
            ...elements.modalAdditionGroups.querySelectorAll(
                `.additional-option-quantity[data-group-index="${groupIndex}"]`
            )
        ].reduce((total, row) => total + Number(row.textContent), 0);
    },

    updateAdditionalQuantityControls() {
        this.productModalState.groups.forEach((group, groupIndex) => {
            const rows = [
                ...elements.modalAdditionGroups.querySelectorAll(
                    `.additional-option-quantity[data-group-index="${groupIndex}"]`
                )
            ];
            rows.forEach(row => {
                const quantity = Number(row.textContent);
                const itemIndex = row.dataset.itemIndex;
                const minusButton = elements.modalAdditionGroups.querySelector(
                    `.additional-quantity-button[data-action="decrease"][data-group-index="${groupIndex}"][data-item-index="${itemIndex}"]`
                );
                const plusButton = elements.modalAdditionGroups.querySelector(
                    `.additional-quantity-button[data-action="increase"][data-group-index="${groupIndex}"][data-item-index="${itemIndex}"]`
                );
                minusButton.disabled = quantity === 0;
                plusButton.disabled = quantity >= group.max;
            });
        });
    },

    updateProductModalTotal() {
        const product = appState.getProduct(elements.productModal.dataset.productId);
        if (!product) return;

        const additionsTotal = this.getSelectedProductAdditions().reduce(
            (total, additional) => total + additional.preco * additional.quantidade,
            0
        );
        const total = (product.price + additionsTotal) * this.productModalState.quantity;
        elements.modalAddToCart.textContent = `Adicionar • ${utils.formatCurrency(total)}`;
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
        const status = this.updateStoreOpeningStatus();
        if (!status?.available || !status.isOpen) {
            alert(status?.available
                ? 'A loja está fechada no momento e não pode receber pedidos.'
                : 'O horário de funcionamento não está disponível. Não é possível enviar pedidos agora.');
            return;
        }

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

const eventHandlers = {
    init() {
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

            const cartKey = removeButton.dataset.cartKey;
            const item = appState.cart.get(cartKey);
            if (!item || !appState.removeCartItem(cartKey)) return;

            const productId = item._id;
            ui.updateProductQuantityDisplay(productId, appState.getProduct(productId)?.quantity || 0);
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

        elements.modalClose.addEventListener('click', () => utils.hideModal(elements.productModal));
        elements.storeClosedNotice.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                return;
            }
            if (event.key === 'Tab') {
                event.preventDefault();
                elements.storeClosedConfirm.focus();
            }
        });
        elements.storeClosedConfirm.addEventListener('click', () => ui.dismissStoreClosedNotice());
        elements.checkoutClose.addEventListener('click', () => utils.hideModal(elements.checkoutModal));
        elements.successClose.addEventListener('click', () => utils.hideModal(elements.successModal));
        elements.storeOpeningStatus.addEventListener('click', () => ui.openStoreDetails());
        elements.storeDetailsClose.addEventListener('click', () => ui.closeStoreDetails());
        elements.storeDetailsLogo.addEventListener('error', () => {
            elements.storeDetailsLogo.classList.add('hidden');
            elements.storeDetailsLogoPlaceholder.classList.remove('hidden');
        });
        window.addEventListener('popstate', event => {
            if (!ui.storeDetailsOpen) return;
            window.history.pushState(event.state, '', ui.storeDetailsUrl);
            ui.closeStoreDetails({ restoreHistory: false });
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) ui.updateStoreOpeningStatus();
        });
        window.setInterval(() => ui.updateStoreOpeningStatus(), 60_000);

        elements.modalMinus.addEventListener('click', () => {
            ui.productModalState.quantity = Math.max(1, ui.productModalState.quantity - 1);
            elements.modalQuantity.textContent = ui.productModalState.quantity;
            ui.updateProductModalTotal();
        });

        elements.modalPlus.addEventListener('click', () => {
            ui.productModalState.quantity++;
            elements.modalQuantity.textContent = ui.productModalState.quantity;
            ui.updateProductModalTotal();
        });

        elements.modalAdditionGroups.addEventListener('click', event => {
            const button = event.target.closest('.additional-quantity-button');
            if (!button || button.disabled) return;

            const groupIndex = Number(button.dataset.groupIndex);
            const itemIndex = Number(button.dataset.itemIndex);
            const group = ui.productModalState.groups[groupIndex];
            const item = group?.items[itemIndex];
            const quantity = elements.modalAdditionGroups.querySelector(
                `.additional-option-quantity[data-group-index="${groupIndex}"][data-item-index="${itemIndex}"]`
            );
            if (!group || !item || !quantity) return;

            const currentQuantity = Number(quantity.textContent);
            if (button.dataset.action === 'increase') {
                if (currentQuantity >= group.max) return;
                quantity.textContent = String(currentQuantity + 1);
            } else {
                quantity.textContent = String(Math.max(0, currentQuantity - 1));
            }

            ui.updateAdditionalQuantityControls();
            ui.updateProductModalTotal();
        });

        elements.modalAddToCart.addEventListener('click', () => {
            const productId = elements.productModal.dataset.productId;
            const missingGroup = ui.productModalState.groups.find((group, groupIndex) => {
                if (!group.required) return false;
                const selectedCount = ui.getGroupSelectedQuantity(groupIndex);
                return selectedCount < group.min;
            });
            if (missingGroup) {
                alert(`Selecione os adicionais obrigatórios do grupo "${missingGroup.name}".`);
                elements.modalAdditionGroups
                    .querySelector(`[data-group-index="${ui.productModalState.groups.indexOf(missingGroup)}"]`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }

            const product = appState.getProduct(productId);
            if (!product) {
                console.error(`Não foi possível adicionar o produto ${productId}: produto não encontrado.`);
                return;
            }

            const quantity = ui.productModalState.quantity;
            const additions = ui.getSelectedProductAdditions();
            const observation = elements.modalObservation.value.trim();
            if (!appState.setConfiguredCartItem(productId, quantity, observation, additions)) return;

            ui.updateProductQuantityDisplay(productId, quantity);
            ui.updateCartBadge();
            ui.updateCartSidebar();
            utils.animateElement(elements.cartButton, 'bounce');
            utils.hideModal(elements.productModal);
        });

        elements.modalObservation.addEventListener('input', () => {
            const productId = elements.productModal.dataset.productId;
            appState.updateProductObservation(productId, elements.modalObservation.value);
        });

        elements.checkoutForm.addEventListener('submit', this.handleCheckoutSubmit);

        elements.continueShopping.addEventListener('click', () => utils.hideModal(elements.goalAlert));
        elements.finishOrder.addEventListener('click', () => {
            utils.hideModal(elements.goalAlert);
            ui.showCheckoutModal();
        });

        this.initCategoryControls();

        document.addEventListener('keydown', this.handleKeydown);

        document.addEventListener('keydown', (e) => {
            if (ui.storeDetailsOpen) {
                if (e.key === 'Escape') {
                    ui.closeStoreDetails();
                } else if (e.key === 'Tab') {
                    const focusable = [...elements.storeDetailsScreen.querySelectorAll(
                        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
                    )].filter(element => !element.classList.contains('hidden'));
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }
                return;
            }
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

        const status = ui.updateStoreOpeningStatus();
        if (!status?.available || !status.isOpen) {
            alert(status?.available
                ? 'A loja está fechada no momento e não pode receber pedidos.'
                : 'O horário de funcionamento não está disponível. Não é possível enviar pedidos agora.');
            return;
        }
        
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

            const orderLines = appState.getGroupedCartItems(cartItems).map(item => {
                const additions = item.adicionaisSelecionados || [];
                const lineTotal = item.price * item.quantity;
                let line = `- (${item.quantity}x) ${item.description} - ${utils.formatCurrency(lineTotal)}`;

                if (additions.length) {
                    const additionNames = additions
                        .map(additional => `${Number(additional.quantidade || 1)}x ${additional.nome}`)
                        .join(', ');
                    line += `\n  Adicionais: ${additionNames}${item.quantity > 1 ? ' (por unidade)' : ''}`;
                }

                const observation = (item.observation || '').trim();
                if (observation) {
                    line += `\n  Obs: ${observation.replace(/\r?\n/g, ' ')}`;
                }
                return line;
            });
            message += `${orderLines.join('\n-------------------------------------------------\n')}\n\n`;

            message += `*Resumo:*\n\n`;
            message += `- Subtotal: ${utils.formatCurrency(subtotal)}\n`;
            message += `- Taxa de entrega: ${utils.formatCurrency(deliveryFee)}\n`;
            message += `*Valor Total: ${utils.formatCurrency(total)}*`;

            const whatsappUrl = `https://api.whatsapp.com/send?phone=${appState.currentUser?.phone}&text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');

            ui.showSuccessModal();

        } catch (error) {
            console.error('Error processing checkout:', error);
            alert('Erro ao processar pedido. Tente novamente.');
        }
    },

    handleKeydown(e) {
        if (ui.storeDetailsOpen) return;
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

const app = {
    async init() {
        ui.showLoading();
        eventHandlers.init();

        appState.storeSlug = utils.getStoreSlug();

        if (!appState.storeSlug) {
            ui.hideLoading();
            ui.showStoreStatus('Acesse o cardápio pelo link da loja para ver os produtos.');
            return;
        }

        await this.loadStoreContent();
    },

    async loadStoreContent() {
        try {
            ui.showLoading();
            ui.showStoreStatus('Carregando cardápio...', { loading: true });
            const { loja, produtos } = await api.fetchMenuBySlug(appState.storeSlug);
            const storeId = loja.user_id ?? loja.userId ?? loja._id ?? loja.id ?? appState.storeSlug;
            const storeAccount = await api.fetchStoreAccount(String(storeId));
            const normalizeStatus = status => String(status ?? '')
                .trim()
                .toLocaleLowerCase('pt-BR')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
            const accountStatus = normalizeStatus(storeAccount.status);
            const statusValues = [
                storeAccount.status,
                loja.status,
                loja.statusConta,
                loja.status_conta
            ];
            const isSuspended = statusValues.some(status => {
                if (status === false) return true;
                const normalizedStatus = normalizeStatus(status);
                return ['suspenso', 'suspensa', 'suspended'].includes(normalizedStatus);
            });

            if (isSuspended) {
                ui.hideLoading();
                ui.hideStoreStatus();
                ui.showSuspendedStore();
                return;
            }

            if (!['ativo', 'active'].includes(accountStatus)) {
                throw new Error(`Unexpected store account status: ${storeAccount.status}`);
            }

            const color = utils.getSystemColor(
                loja.corSistema ?? loja.systemColor ?? loja.color
            );

            const displayName = utils.getStoreText(loja.nome ?? loja.name ?? loja.razaoSocial);
            appState.currentUser = {
                id: String(storeId),
                name: displayName || 'Loja',
                displayName,
                phone: String(loja.tel ?? loja.telefone ?? loja.phone ?? ''),
                banner: loja.banner ?? loja.bannerUrl ?? loja.banner_url ?? '',
                logo: loja.logo ?? '',
                hours: loja.horariosFuncionamento ?? null,
                about: utils.getStoreText(loja.sobre),
                color
            };
            appState.userGoal = storeAccount.goal ?? loja.meta ?? loja.goal ?? loja.objetivo ?? null;
            appState.categories = [];
            appState.products.clear();
            appState.loadCartFromStorage();

            document.documentElement.style.setProperty('--system-primary-color', color);
            document.documentElement.style.setProperty(
                '--system-primary-hover-color',
                utils.getDarkerSystemColor(color)
            );
            elements.brandName.textContent = appState.currentUser.name;
            ui.updateStoreOpeningStatus();

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

            const products = produtos.map((product, index) => {
                const id = product._id ?? product.id;
                const description = product.description ?? product.nome ?? product.name;
                const price = Number(
                    product.price ?? product.preco ?? product.precoBase ?? product.preco_base
                );
                if (id == null || !String(description || '').trim() || !Number.isFinite(price)) {
                    throw new Error(`Produto inválido na resposta do cardápio (posição ${index + 1}).`);
                }

                return {
                    ...product,
                    _id: String(id),
                    description: String(description),
                    price,
                    description2: String(
                        product.description2 ?? product.descricao ?? product.description ?? ''
                    ),
                    thumbnail_url: utils.getProductImageUrl(product),
                    categoriaId: product.categoriaId ?? product.categoryId ?? null
                };
            });

            products.forEach(product => appState.addProduct(product));
            appState.cart.forEach((item, cartKey) => {
                const productId = String(item._id ?? cartKey);
                const product = appState.getProduct(productId);
                if (product) {
                    item._id = productId;
                    item.basePrice = item.basePrice != null && Number.isFinite(Number(item.basePrice))
                        ? Number(item.basePrice)
                        : Number(item.price) - (item.adicionaisSelecionados || []).reduce(
                            (total, additional) => total +
                                Number(additional.preco) * Number(additional.quantidade || 1),
                            0
                        );
                    item.price = appState.getCartItemUnitPrice(item);
                    item.adicionaisSelecionados = (item.adicionaisSelecionados || []).map(additional => ({
                        ...additional,
                        quantidade: Math.max(1, Number(additional.quantidade) || 1)
                    }));
                    product.quantity += item.quantity;
                } else {
                    appState.cart.delete(cartKey);
                }
            });
            appState.saveCartToStorage();

            const categoriesPromise = api.fetchCategories(String(storeId));
            const deliveryPlacesPromise = api.fetchDeliveryPlaces(String(storeId));
            if (localStorage.getItem(CONFIG.GOAL_STORAGE_KEY) === 'true') {
                appState.goalAchieved = true;
            }

            const [categories, deliveryPlaces] = await Promise.all([
                categoriesPromise,
                deliveryPlacesPromise
            ]);
            appState.categories = categories;
            appState.deliveryPlaces = deliveryPlaces;
            ui.renderDeliveryPlaces(appState.deliveryPlaces);
            ui.renderProducts(products, appState.categories);

            ui.updateCartBadge();
            ui.updateCartSidebar();
            ui.hideStoreStatus();
            ui.hideLoading();
        } catch (error) {
            console.error('Error loading store menu:', error);
            ui.hideLoading();
            if (error.status === 404) {
                ui.showStoreStatus('Este estabelecimento não existe ou o link está incorreto.');
                return;
            }

            ui.showStoreStatus('Não foi possível carregar o cardápio. Confira sua conexão e tente novamente.', {
                retry: true
            });
        }
    },

    async retryStoreLoad() {
        await this.loadStoreContent();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

if (typeof window !== 'undefined') {
    window.ConectaZapApp = {
        appState,
        ui,
        api,
        utils
    };
}
