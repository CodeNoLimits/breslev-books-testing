/**
 * SYSTÈME DE PANIER - Inspiré d'Amazon & Shopify
 * Gestion complète du panier avec localStorage
 */

class BresledCart {
  constructor() {
    this.cart = this.loadCart();
    this.init();
  }

  init() {
    this.updateCartUI();
    this.attachEventListeners();
  }

  loadCart() {
    const saved = localStorage.getItem('breslev_cart');
    const defaultCart = { items: [], total: 0, total_price: 0 };
    if (!saved) return defaultCart;
    
    const parsed = JSON.parse(saved);
    // Migration: ensure total_price exists
    if (parsed.total_price === undefined) {
      parsed.total_price = parsed.total * 100; // Assuming old total was units
      // Convert items to cents if they look small (heuristic)
      parsed.items.forEach(item => {
        if (item.price < 1000) item.price = item.price * 100;
      });
      parsed.total = parsed.total_price; // Keep total as cents too for consistency? No, let's keep total_price as standard.
    }
    return parsed;
  }

  saveCart() {
    localStorage.setItem('breslev_cart', JSON.stringify(this.cart));
    this.updateCartUI();
  }

  addItem(product) {
    const existing = this.cart.items.find(item => item.id === product.id);
    
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart.items.push({
        id: product.id,
        title: product.title,
        author: product.author,
        price: product.price, // Assumed to be in cents
        image: product.image,
        quantity: 1
      });
    }
    
    this.calculateTotal();
    this.saveCart();
    this.showNotification(`${product.title} ajouté au panier`);
  }

  removeItem(productId) {
    this.cart.items = this.cart.items.filter(item => item.id !== productId);
    this.calculateTotal();
    this.saveCart();
  }

  updateQuantity(productId, quantity) {
    const item = this.cart.items.find(item => item.id === productId);
    if (item) {
      item.quantity = Math.max(1, quantity);
      this.calculateTotal();
      this.saveCart();
    }
  }

  calculateTotal() {
    this.cart.total_price = this.cart.items.reduce((sum, item) => {
      return sum + (item.price * item.quantity);
    }, 0);
    this.cart.total = this.cart.total_price; // Alias
  }

  updateCartUI() {
    // Update cart count badge
    const badge = document.querySelector('.cart-badge');
    if (badge) {
      const count = this.cart.items.reduce((sum, item) => sum + item.quantity, 0);
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  attachEventListeners() {
    // Add to cart buttons
    document.addEventListener('click', (e) => {
      if (e.target.closest('.btn-add-to-cart')) {
        e.preventDefault();
        const btn = e.target.closest('.btn-add-to-cart');
        const product = {
          id: btn.dataset.productId,
          title: btn.dataset.productTitle,
          author: btn.dataset.productAuthor,
          price: parseFloat(btn.dataset.productPrice) * 100, // Convert to cents
          image: btn.dataset.productImage
        };
        this.addItem(product);
      }
    });
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'cart-notification';
    notification.innerHTML = `
      <div class="cart-notification-content">
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  getCart() {
    return this.cart;
  }

  clearCart() {
    this.cart = { items: [], total: 0, total_price: 0 };
    this.saveCart();
  }

  formatMoney(cents) {
    const amount = cents / 100;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'ILS'
    }).format(amount);
  }
}

// Initialize cart
const breslevCart = new BresledCart();
window.breslevCart = breslevCart;
