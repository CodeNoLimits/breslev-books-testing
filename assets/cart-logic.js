/**
 * BRESLEV BOOKS - CART LOGIC (CLIENT SIDE VERSION)
 * Gestion complète du panier avec LocalStorage (Serverless compatible)
 * Compatible Shopify 2.0 UI
 */

class BreslevCart {
  constructor() {
    this.cart = {
      items: [],
      item_count: 0,
      total_price: 0,
      original_total_price: 0
    };
    this.isUpdating = false;
    this.storageKey = 'breslev_cart_v1';
    this.init();
  }

  /**
   * Initialisation du système de panier
   */
  init() {
    this.bindEvents();
    this.fetchCart(); // Loads from LocalStorage
    this.initMiniCart();
  }

  /**
   * Liaison des événements
   */
  bindEvents() {
    // Boutons d'ajout au panier
    document.addEventListener('click', (e) => {
      const addToCartBtn = e.target.closest('[data-add-to-cart]');
      if (addToCartBtn) {
        e.preventDefault();
        this.addToCart(addToCartBtn);
      }

      // Ouverture du mini-cart
      const cartToggle = e.target.closest('[data-cart-toggle]');
      if (cartToggle) {
        e.preventDefault();
        this.toggleMiniCart();
      }

      // Mise à jour de quantité
      const updateQty = e.target.closest('[data-cart-update-qty]');
      if (updateQty) {
        e.preventDefault();
        this.updateQuantity(updateQty);
      }

      // Suppression d'item
      const removeItem = e.target.closest('[data-cart-remove]');
      if (removeItem) {
        e.preventDefault();
        this.removeItem(removeItem);
      }
    });

    // Changement de variante
    document.addEventListener('change', (e) => {
      if (e.target.matches('[data-variant-select]')) {
        this.handleVariantChange(e.target);
      }
    });
  }

  /**
   * Récupération du panier (LocalStorage)
   */
  fetchCart() {
    try {
      const storedCart = localStorage.getItem(this.storageKey);
      if (storedCart) {
        this.cart = JSON.parse(storedCart);
      } else {
        this.cart = { items: [], item_count: 0, total_price: 0, original_total_price: 0 };
      }
      this.updateCartUI();
      return this.cart;
    } catch (error) {
      console.error('Erreur lors de la récupération du panier:', error);
      this.cart = { items: [], item_count: 0, total_price: 0, original_total_price: 0 };
    }
  }

  /**
   * Sauvegarde du panier
   */
  saveCart() {
    // Recalculate totals
    this.cart.item_count = this.cart.items.reduce((sum, item) => sum + item.quantity, 0);
    this.cart.total_price = this.cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    this.cart.original_total_price = this.cart.total_price;

    localStorage.setItem(this.storageKey, JSON.stringify(this.cart));
    this.updateCartUI();
    
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('cart:updated', { detail: this.cart }));
  }

  /**
   * Get current cart (Helper for checkout)
   */
  getCart() {
    return this.cart;
  }

  /**
   * Ajout au panier
   */
  async addToCart(button) {
    if (this.isUpdating) return;

    const form = button.closest('form') || document.querySelector(`form[data-product-id="${button.dataset.productId}"]`);
    
    // Fallback if no form (e.g. direct button on card)
    let productId, productTitle, productPrice, productImage, productAuthor;
    let quantity = 1;

    if (form) {
        const formData = new FormData(form);
        productId = formData.get('id'); // This is actually product ID in our mock
        quantity = parseInt(formData.get('quantity') || 1);
    } else {
        // Try data attributes
        productId = button.dataset.productId;
        productTitle = button.dataset.productTitle;
        productPrice = button.dataset.productPrice;
        productImage = button.dataset.productImage;
        productAuthor = button.dataset.productAuthor;
    }

    if (!productId) {
      this.showNotification('Erreur: Produit non identifié', 'error');
      return;
    }

    this.isUpdating = true;
    this.setButtonLoading(button, true);

    try {
      // Fetch product details to ensure we have latest data
      const response = await fetch(`/products/${productId}.js`);
      if (!response.ok) throw new Error('Produit introuvable');
      
      const productData = await response.json();
      
      // Add to cart logic
      const existingItem = this.cart.items.find(item => item.id == productId);
      
      if (existingItem) {
        existingItem.quantity += quantity;
        existingItem.final_line_price = existingItem.price * existingItem.quantity;
        existingItem.original_line_price = existingItem.final_line_price;
      } else {
        this.cart.items.push({
          id: productData.id,
          quantity: quantity,
          title: productData.title,
          price: productData.price,
          final_line_price: productData.price * quantity,
          original_line_price: productData.price * quantity,
          discounted_price: productData.price,
          line_level_discount_allocations: [],
          featured_image: { url: productData.featured_image },
          image: productData.featured_image, // For checkout compatibility
          product_title: productData.title,
          variant_title: null,
          author: productAuthor || productData.author || "Breslev" // Add author if available
        });
      }

      this.saveCart();

      // Notification de succès
      this.showNotification(
        window.theme?.notifications?.addedToCart || 'Produit ajouté au panier!',
        'success'
      );

      // Ouverture du mini-cart
      this.openMiniCart();

      // Tracking analytics
      this.trackAddToCart({
        variant_id: productId,
        product_title: productData.title,
        price: productData.price,
        quantity: quantity
      });

    } catch (error) {
      console.error('Erreur d\'ajout au panier:', error);
      this.showNotification('Impossible d\'ajouter le produit', 'error');
    } finally {
      this.isUpdating = false;
      this.setButtonLoading(button, false);
    }
  }

  /**
   * Mise à jour de quantité
   */
  async updateQuantity(element) {
    // element is the input
    const lineIndex = parseInt(element.dataset.cartUpdateQty) - 1; // 1-based to 0-based
    const newQty = parseInt(element.value);

    if (newQty < 0) return;
    if (lineIndex < 0 || lineIndex >= this.cart.items.length) return;

    if (newQty === 0) {
        this.cart.items.splice(lineIndex, 1);
    } else {
        const item = this.cart.items[lineIndex];
        item.quantity = newQty;
        item.final_line_price = item.price * newQty;
        item.original_line_price = item.final_line_price;
    }

    this.saveCart();
  }

  /**
   * Suppression d'un item
   */
  async removeItem(button) {
    const lineIndex = parseInt(button.dataset.cartRemove) - 1; // 1-based to 0-based
    
    if (lineIndex < 0 || lineIndex >= this.cart.items.length) return;

    this.cart.items.splice(lineIndex, 1);
    this.saveCart();
    this.showNotification('Produit retiré du panier', 'info');
  }

  /**
   * Gestion du changement de variante
   */
  handleVariantChange(select) {
    // Simplified for now as we don't have complex variants
    console.log("Variant change not fully implemented in client-side cart");
  }

  /**
   * Initialisation du mini-cart
   */
  initMiniCart() {
    const miniCart = document.querySelector('[data-mini-cart]');
    if (!miniCart) return;

    // Fermeture en cliquant à l'extérieur
    document.addEventListener('click', (e) => {
      if (!miniCart.contains(e.target) &&
          !e.target.closest('[data-cart-toggle]')) {
        this.closeMiniCart();
      }
    });

    // Fermeture avec Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeMiniCart();
      }
    });
  }

  /**
   * Ouverture du mini-cart
   */
  openMiniCart() {
    const miniCart = document.querySelector('[data-mini-cart]');
    if (miniCart) {
      miniCart.classList.add('is-active');
      document.body.classList.add('cart-open');
    }
  }

  /**
   * Fermeture du mini-cart
   */
  closeMiniCart() {
    const miniCart = document.querySelector('[data-mini-cart]');
    if (miniCart) {
      miniCart.classList.remove('is-active');
      document.body.classList.remove('cart-open');
    }
  }

  /**
   * Toggle du mini-cart
   */
  toggleMiniCart() {
    const miniCart = document.querySelector('[data-mini-cart]');
    if (miniCart && miniCart.classList.contains('is-active')) {
      this.closeMiniCart();
    } else {
      this.openMiniCart();
    }
  }

  /**
   * Mise à jour de l'interface du panier
   */
  updateCartUI() {
    if (!this.cart) return;

    // Mise à jour du compteur
    const cartCounts = document.querySelectorAll('[data-cart-count]');
    cartCounts.forEach(count => {
      count.textContent = this.cart.item_count;
      count.classList.toggle('has-items', this.cart.item_count > 0);
      // Also show/hide badge
      const badge = count.closest('.cart-badge');
      if(badge) badge.style.display = this.cart.item_count > 0 ? 'block' : 'none';
    });

    // Mise à jour du total
    const cartTotals = document.querySelectorAll('[data-cart-total]');
    cartTotals.forEach(total => {
      total.textContent = this.formatMoney(this.cart.total_price);
    });

    // Mise à jour de la liste des items
    this.updateCartItems();

    // Vérification du seuil de livraison gratuite
    this.updateFreeShippingProgress();
  }

  /**
   * Mise à jour de la liste des items
   */
  updateCartItems() {
    const cartItemsContainer = document.querySelector('[data-cart-items]');
    if (!cartItemsContainer) return;

    if (this.cart.item_count === 0) {
      cartItemsContainer.innerHTML = `
        <div class="cart-empty">
          <p>Votre panier est vide</p>
          <a href="/collections/all" class="btn btn-primary">Continuer vos achats</a>
        </div>
      `;
      return;
    }

    const itemsHTML = this.cart.items.map((item, index) => `
      <div class="cart-item" data-cart-item="${index + 1}">
        <div class="cart-item__image">
          <img src="${item.featured_image?.url || item.image || ''}"
               alt="${item.title}"
               loading="lazy">
        </div>
        <div class="cart-item__details">
          <h4 class="cart-item__title">${item.product_title || item.title}</h4>
          ${item.variant_title ? `<p class="cart-item__variant">${item.variant_title}</p>` : ''}
          <div class="cart-item__price">
            ${this.formatMoney(item.final_line_price)}
          </div>
        </div>
        <div class="cart-item__quantity">
          <input type="number"
                 value="${item.quantity}"
                 min="0"
                 data-cart-update-qty="${index + 1}"
                 aria-label="Quantité">
        </div>
        <button type="button"
                class="cart-item__remove"
                data-cart-remove="${index + 1}"
                aria-label="Retirer ${item.title}">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    `).join('');

    cartItemsContainer.innerHTML = itemsHTML;
  }

  /**
   * Progression vers la livraison gratuite
   */
  updateFreeShippingProgress() {
    const threshold = (window.theme?.freeShippingThreshold || 300) * 100; // Default 300 shekels
    
    const progressBar = document.querySelector('[data-free-shipping-progress]');
    const progressText = document.querySelector('[data-free-shipping-text]');

    if (!progressBar || !progressText) return;

    const remaining = threshold - this.cart.total_price;
    const percentage = Math.min((this.cart.total_price / threshold) * 100, 100);

    progressBar.style.width = `${percentage}%`;

    if (remaining <= 0) {
      progressText.textContent = 'Vous bénéficiez de la livraison gratuite!';
      progressText.classList.add('success');
    } else {
      progressText.textContent = `Plus que ${this.formatMoney(remaining)} pour la livraison gratuite`;
      progressText.classList.remove('success');
    }
  }

  /**
   * État de chargement du bouton
   */
  setButtonLoading(button, isLoading) {
    if (isLoading) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.innerHTML = '<span class="spinner"></span> Ajout...';
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || 'Ajouter au panier';
    }
  }

  /**
   * Affichage de notifications
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.textContent = message;
    notification.setAttribute('role', 'alert');
    
    // Style basic if CSS not loaded
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '1rem 2rem';
    notification.style.background = type === 'error' ? '#ff4444' : '#4CAF50';
    notification.style.color = 'white';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '9999';
    notification.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';

    document.body.appendChild(notification);

    // Animation d'entrée
    setTimeout(() => notification.classList.add('is-visible'), 10);

    // Suppression automatique
    setTimeout(() => {
      notification.classList.remove('is-visible');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Formatage de prix
   */
  formatMoney(cents) {
    const amount = cents / 100;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: window.Shopify?.currency?.active || 'ILS'
    }).format(amount);
  }

  /**
   * Tracking analytics - Ajout au panier
   */
  trackAddToCart(item) {
    // Google Analytics 4
    if (typeof gtag !== 'undefined') {
      gtag('event', 'add_to_cart', {
        currency: 'ILS',
        value: item.price / 100,
        items: [{
          item_id: item.variant_id,
          item_name: item.product_title,
          price: item.price / 100,
          quantity: item.quantity
        }]
      });
    }
  }
}

// Initialisation au chargement de la page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.breslevCart = new BreslevCart();
  });
} else {
  window.breslevCart = new BreslevCart();
}
