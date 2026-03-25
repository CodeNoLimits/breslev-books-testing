/**
 * PAGE DE CHECKOUT - Inspirée d'Amazon & Shopify
 * Intégration Stripe + PayPal + Supabase
 */

// Étapes du checkout
const CHECKOUT_STEPS = {
  CART: 1,
  SHIPPING: 2,
  PAYMENT: 3,
  CONFIRMATION: 4
};

class CheckoutManager {
  constructor() {
    this.currentStep = CHECKOUT_STEPS.CART;
    this.checkoutData = {
      cart: null,
      shipping: null,
      payment: null,
      user: null
    };
    this.init();
  }

  init() {
    this.loadCart();
    this.detectUserLocation();
    this.renderCheckout();
    this.initializePaymentProviders();
  }

  loadCart() {
    this.checkoutData.cart = window.breslevCart ? window.breslevCart.getCart() : { items: [], total_price: 0 };
  }

  async detectUserLocation() {
    try {
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();
      this.checkoutData.detectedCountry = data.country_code;
    } catch (error) {
      this.checkoutData.detectedCountry = 'IL'; // Default to Israel
    }
  }

  renderCheckout() {
    const container = document.getElementById('checkout-container');
    if (!container) return;

    container.innerHTML = `
      <div class="checkout-wrapper">
        <!-- Progress Bar -->
        <div class="checkout-progress">
          ${this.renderProgressBar()}
        </div>

        <!-- Main Content -->
        <div class="checkout-content">
          <div class="checkout-main">
            ${this.renderCurrentStep()}
          </div>

          <div class="checkout-sidebar">
            ${this.renderOrderSummary()}
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();

    // Mount Stripe card element when on payment step
    if (this.currentStep === CHECKOUT_STEPS.PAYMENT) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        this.mountStripeCardElement();
      }, 100);
    }
  }

  renderProgressBar() {
    const steps = [
      { id: CHECKOUT_STEPS.CART, label: 'Panier', icon: 'shopping-cart' },
      { id: CHECKOUT_STEPS.SHIPPING, label: 'Livraison', icon: 'truck' },
      { id: CHECKOUT_STEPS.PAYMENT, label: 'Paiement', icon: 'credit-card' },
      { id: CHECKOUT_STEPS.CONFIRMATION, label: 'Confirmation', icon: 'check-circle' }
    ];

    return `
      <div class="progress-steps">
        ${steps.map(step => `
          <div class="progress-step ${step.id <= this.currentStep ? 'active' : ''} ${step.id < this.currentStep ? 'completed' : ''}">
            <div class="step-icon">
              <i class="fas fa-${step.icon}"></i>
            </div>
            <div class="step-label">${step.label}</div>
          </div>
        `).join('<div class="progress-connector"></div>')}
      </div>
    `;
  }

  renderCurrentStep() {
    switch (this.currentStep) {
      case CHECKOUT_STEPS.CART:
        return this.renderCartStep();
      case CHECKOUT_STEPS.SHIPPING:
        return this.renderShippingStep();
      case CHECKOUT_STEPS.PAYMENT:
        return this.renderPaymentStep();
      case CHECKOUT_STEPS.CONFIRMATION:
        return this.renderConfirmationStep();
      default:
        return '';
    }
  }

  renderCartStep() {
    const { items } = this.checkoutData.cart;
    
    if (items.length === 0) {
      return `
        <div class="empty-cart">
          <i class="fas fa-shopping-cart" style="font-size: 4rem; color: #ccc; margin-bottom: 1rem;"></i>
          <h2>Votre panier est vide</h2>
          <p>Découvrez notre collection de livres</p>
          <a href="/collections/all" class="btn btn-primary">Explorer la bibliothèque</a>
        </div>
      `;
    }

    return `
      <div class="cart-step">
        <h2>Votre Panier (${items.length} ${items.length > 1 ? 'articles' : 'article'})</h2>
        
        <div class="cart-items">
          ${items.map(item => `
            <div class="cart-item" data-item-id="${item.id}">
              <img src="${item.image}" alt="${item.title}" class="cart-item-image">
              <div class="cart-item-details">
                <h3>${item.title}</h3>
                <p class="cart-item-author">${item.author}</p>
                <div class="cart-item-quantity">
                  <button class="qty-btn" data-action="decrease" data-item-id="${item.id}">-</button>
                  <input type="number" value="${item.quantity}" min="1" class="qty-input" data-item-id="${item.id}">
                  <button class="qty-btn" data-action="increase" data-item-id="${item.id}">+</button>
                </div>
              </div>
              <div class="cart-item-price">
                <div class="item-price">${window.breslevCart.formatMoney(item.price)}</div>
                <button class="btn-remove" data-item-id="${item.id}">
                  <i class="fas fa-trash"></i> Retirer
                </button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="cart-actions">
          <a href="/collections/all" class="btn btn-outline">Continuer mes achats</a>
          <button class="btn btn-primary" onclick="checkoutManager.nextStep()">
            Procéder à la livraison <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  }

  renderShippingStep() {
    const shippingZone = this.checkoutData.detectedCountry ? 
      getShippingZone(this.checkoutData.detectedCountry) : 
      getShippingZone('IL');

    return `
      <div class="shipping-step">
        <h2>Informations de livraison</h2>
        
        <form id="shipping-form" class="checkout-form">
          <div class="form-section">
            <h3>Adresse de livraison</h3>
            
            <div class="form-row">
              <div class="form-group">
                <label>Prénom *</label>
                <input type="text" name="firstName" required>
              </div>
              <div class="form-group">
                <label>Nom *</label>
                <input type="text" name="lastName" required>
              </div>
            </div>

            <div class="form-group">
              <label>Email *</label>
              <input type="email" name="email" required>
            </div>

            <div class="form-group">
              <label>Téléphone *</label>
              <input type="tel" name="phone" required>
            </div>

            <div class="form-group">
              <label>Adresse *</label>
              <input type="text" name="address" required>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Ville *</label>
                <input type="text" name="city" required>
              </div>
              <div class="form-group">
                <label>Code postal *</label>
                <input type="text" name="zipCode" required>
              </div>
            </div>

            <div class="form-group">
              <label>Pays *</label>
              <select name="country" required onchange="checkoutManager.updateShippingRates(this.value)">
                <option value="IL" ${this.checkoutData.detectedCountry === 'IL' ? 'selected' : ''}>🇮🇱 Israël</option>
                <option value="FR" ${this.checkoutData.detectedCountry === 'FR' ? 'selected' : ''}>🇫🇷 France</option>
                <option value="US" ${this.checkoutData.detectedCountry === 'US' ? 'selected' : ''}>🇺🇸 États-Unis</option>
                <option value="CA" ${this.checkoutData.detectedCountry === 'CA' ? 'selected' : ''}>🇨🇦 Canada</option>
                <option value="BE">🇧🇪 Belgique</option>
                <option value="CH">🇨🇭 Suisse</option>
                <option value="DE">🇩🇪 Allemagne</option>
                <option value="GB">🇬🇧 Royaume-Uni</option>
              </select>
            </div>
          </div>

          <div class="form-section">
            <h3>Mode de livraison</h3>
            <div id="shipping-options">
              ${this.renderShippingOptions(shippingZone)}
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-outline" onclick="checkoutManager.previousStep()">
              <i class="fas fa-arrow-left"></i> Retour au panier
            </button>
            <button type="submit" class="btn btn-primary">
              Continuer vers le paiement <i class="fas fa-arrow-right"></i>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  renderShippingOptions(shippingZone) {
    if (!shippingZone || !shippingZone.rates) {
      return '<p style="color: #666;">Erreur de chargement des options de livraison</p>';
    }
    
    return shippingZone.rates.map((rate, index) => {
      const rateName = rate.name || 'Option de livraison';
      const rateDays = rate.days || '5-7';
      const ratePrice = rate.price !== undefined ? rate.price : 0;
      const currency = shippingZone.currency || 'ILS';
      
      return `
        <label class="shipping-option" style="display: block; cursor: pointer;">
          <input type="radio" name="shippingMethod" value="${index}" data-price="${ratePrice}" ${index === 0 ? 'checked' : ''} required style="margin-right: 1rem;">
          <div class="shipping-option-content" style="display: inline-flex; justify-content: space-between; width: calc(100% - 2rem); vertical-align: middle;">
            <div class="shipping-option-name" style="font-weight: 600; color: #1a1a2e;">${rateName}</div>
            <div class="shipping-option-details" style="display: flex; gap: 1rem;">
              <span class="shipping-days" style="color: #333; font-weight: 500;">${rateDays} jours ouvrés</span>
              <span class="shipping-price" style="color: #d4af37; font-weight: bold;">${ratePrice > 0 ? `${ratePrice} ${currency}` : 'GRATUIT'}</span>
            </div>
          </div>
        </label>
      `;
    }).join('');
  }

  renderPaymentStep() {
    return `
      <div class="payment-step">
        <h2>Paiement sécurisé</h2>
        
        <div class="payment-methods">
          <div class="payment-method-tabs">
            <button class="payment-tab active" data-method="stripe">
              <i class="fas fa-credit-card"></i> Carte bancaire
            </button>
            <button class="payment-tab" data-method="paypal">
              <i class="fab fa-paypal"></i> PayPal
            </button>
          </div>

          <div class="payment-method-content">
            <!-- Stripe Payment Form -->
            <div id="stripe-payment" class="payment-form active">
              <div class="trust-badges">
                <img src="https://img.shields.io/badge/Secured%20by-Stripe-blue" alt="Stripe">
                <img src="https://img.shields.io/badge/SSL-Encrypted-green" alt="SSL">
              </div>
              
              <form id="stripe-payment-form">
                <div id="card-element" class="stripe-element"></div>
                <div id="card-errors" class="payment-errors"></div>
                
                <button type="submit" class="btn btn-primary btn-pay" id="stripe-submit">
                  <i class="fas fa-lock"></i> Payer ${this.calculateTotal()}₪
                </button>
              </form>
            </div>

            <!-- PayPal Payment -->
            <div id="paypal-payment" class="payment-form">
              <div class="trust-badges">
                <img src="https://img.shields.io/badge/Secured%20by-PayPal-blue" alt="PayPal">
              </div>
              
              <div id="paypal-button-container"></div>
            </div>
          </div>
        </div>

        <div class="security-info">
          <i class="fas fa-shield-alt"></i>
          <p>Vos informations de paiement sont cryptées et sécurisées. Nous ne stockons jamais vos données bancaires.</p>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-outline" onclick="checkoutManager.previousStep()">
            <i class="fas fa-arrow-left"></i> Retour à la livraison
          </button>
        </div>
      </div>
    `;
  }

  renderOrderSummary() {
    const { items = [], total_price = 0 } = this.checkoutData.cart || {};
    const shipping = this.checkoutData.shipping || { price: 0 };
    const shippingCents = shipping.price * 100; // Convert units to cents
    const finalTotal = total_price + shippingCents;

    // Fallback if breslevCart not available
    const formatMoney = window.breslevCart?.formatMoney?.bind(window.breslevCart) || ((cents) => {
      const amount = cents / 100;
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'ILS' }).format(amount);
    });

    return `
      <div class="order-summary">
        <h3>Récapitulatif de commande</h3>
        
        ${items.length > 0 ? `
          <div class="summary-items">
            ${items.map(item => `
              <div class="summary-item">
                <span style="color: #333; font-weight: 500;">${item.title || item.product_title || 'Produit'} × ${item.quantity || 1}</span>
                <span style="color: #d4af37; font-weight: bold;">${formatMoney(item.price * item.quantity)}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="summary-items" style="padding: 2rem; text-align: center; color: #666;">
            <p>Votre panier est vide</p>
          </div>
        `}

        <div class="summary-totals">
          <div class="summary-row">
            <span style="color: #333;">Sous-total</span>
            <span style="color: #333; font-weight: 600;">${formatMoney(total_price)}</span>
          </div>
          <div class="summary-row">
            <span style="color: #333;">Livraison</span>
            <span style="color: #666;">${shipping.price > 0 ? `${shipping.price} ₪` : 'Calculé à l\'étape suivante'}</span>
          </div>
          <div class="summary-row summary-total">
            <span>Total</span>
            <span>${formatMoney(finalTotal)}</span>
          </div>
        </div>

        <div class="trust-indicators">
          <div class="trust-item">
            <i class="fas fa-lock"></i>
            <span>Paiement sécurisé</span>
          </div>
          <div class="trust-item">
            <i class="fas fa-shipping-fast"></i>
            <span>Livraison depuis Jérusalem</span>
          </div>
          <div class="trust-item">
            <i class="fas fa-undo"></i>
            <span>Retours acceptés</span>
          </div>
        </div>
      </div>
    `;
  }

  calculateTotal() {
    const { total_price = 0 } = this.checkoutData.cart || {};
    const shipping = this.checkoutData.shipping || { price: 0 };
    const shippingPrice = typeof shipping.price === 'number' ? shipping.price : 0;
    const totalInUnits = (total_price / 100) + shippingPrice;
    // Return in UNITS for display, ensure it's a valid number
    const result = Math.round(totalInUnits * 100) / 100;
    return isNaN(result) ? 0 : result;
  }

  async initializePaymentProviders() {
    // Initialize Stripe only once (get the Stripe instance)
    if (typeof Stripe !== 'undefined' && window.STRIPE_PUBLISHABLE_KEY && !this.stripe) {
      try {
        this.stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);
      } catch (error) {
        console.error('Stripe initialization error:', error);
      }
    }
  }

  // Create and mount a fresh Stripe card element
  mountStripeCardElement() {
    if (!this.stripe) {
      console.error('Stripe not initialized');
      return;
    }

    const cardElementContainer = document.getElementById('card-element');
    if (!cardElementContainer) {
      console.error('Card element container not found');
      return;
    }

    // Destroy old element if it exists
    if (this.cardElement) {
      try {
        this.cardElement.destroy();
      } catch (e) {
        // Ignore destroy error
      }
    }

    // Create fresh elements instance and card element
    this.elements = this.stripe.elements();
    this.cardElement = this.elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#32325d',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          '::placeholder': { color: '#aab7c4' }
        },
        invalid: {
          color: '#fa755a',
          iconColor: '#fa755a'
        }
      },
      hidePostalCode: true
    });

    // Mount the fresh element
    this.cardElement.mount('#card-element');

    // Listen for errors
    this.cardElement.on('change', (event) => {
      const errorElement = document.getElementById('card-errors');
      if (errorElement) {
        errorElement.textContent = event.error ? event.error.message : '';
      }
    });
  }

  nextStep() {
    if (this.currentStep < CHECKOUT_STEPS.CONFIRMATION) {
      this.currentStep++;
      this.renderCheckout();
      window.scrollTo(0, 0);
    }
  }

  previousStep() {
    if (this.currentStep > CHECKOUT_STEPS.CART) {
      this.currentStep--;
      this.renderCheckout();
      window.scrollTo(0, 0);
    }
  }

  attachEventListeners() {
    // Quantity controls
    document.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.target.dataset.itemId;
        const action = e.target.dataset.action;
        const input = document.querySelector(`.qty-input[data-item-id="${itemId}"]`);
        let qty = parseInt(input.value);
        
        if (action === 'increase') qty++;
        if (action === 'decrease' && qty > 1) qty--;
        
        input.value = qty;
        window.breslevCart.updateQuantity(itemId, qty);
        this.renderCheckout();
      });
    });

    // Remove item
    document.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.target.closest('.btn-remove').dataset.itemId;
        window.breslevCart.removeItem(itemId);
        this.loadCart();
        this.renderCheckout();
      });
    });

    // Shipping form
    const shippingForm = document.getElementById('shipping-form');
    if (shippingForm) {
      shippingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const shippingData = Object.fromEntries(formData);
        
        // Get selected shipping rate price
        const selectedRadio = document.querySelector('input[name="shippingMethod"]:checked');
        if (selectedRadio) {
          shippingData.price = parseFloat(selectedRadio.dataset.price || 0);
        }
        
        this.checkoutData.shipping = shippingData;
        this.nextStep();
      });
    }

    // Real-time shipping update
    const shippingOptionsContainer = document.getElementById('shipping-options');
    if (shippingOptionsContainer) {
      shippingOptionsContainer.addEventListener('change', (e) => {
        if (e.target.name === 'shippingMethod') {
          const selectedRadio = e.target;
          const price = parseFloat(selectedRadio.dataset.price || 0);
          
          // Update internal state
          if (!this.checkoutData.shipping) this.checkoutData.shipping = {};
          this.checkoutData.shipping.price = price;
          
          // Update UI
          this.updateOrderSummaryUI();
        }
      });
    }
    
    // Payment method tabs
    document.querySelectorAll('.payment-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const method = e.currentTarget.dataset.method;
        
        // Update tabs
        document.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        // Update forms
        document.querySelectorAll('.payment-form').forEach(f => f.classList.remove('active'));
        const targetForm = document.getElementById(`${method}-payment`);
        if (targetForm) {
          targetForm.classList.add('active');
          
          // Mount Stripe elements if switching to Stripe
          if (method === 'stripe') {
            setTimeout(() => {
              this.mountStripeCardElement();
            }, 50);
          }
          
          // Initialize PayPal if switching to PayPal
          if (method === 'paypal' && typeof paypal !== 'undefined') {
            this.initializePayPal();
          }
        }
      });
    });
    
    // Stripe payment form submission
    const stripeForm = document.getElementById('stripe-payment-form');
    if (stripeForm) {
      stripeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleStripePayment();
      });
    }
  }

  updateShippingRates(countryCode) {
    const shippingZone = getShippingZone(countryCode);
    const optionsContainer = document.getElementById('shipping-options');
    if (optionsContainer) {
      optionsContainer.innerHTML = this.renderShippingOptions(shippingZone);
    }
  }

  async handleStripePayment() {
    if (!this.stripe || !this.cardElement) {
      alert('Stripe n\'est pas initialisé. Veuillez rafraîchir la page.');
      return;
    }

    const submitButton = document.getElementById('stripe-submit');
    const errorElement = document.getElementById('card-errors');

    try {
      // Disable button and show loading
      submitButton.disabled = true;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement en cours...';
      errorElement.textContent = '';

      // Create payment method
      const { error, paymentMethod } = await this.stripe.createPaymentMethod({
        type: 'card',
        card: this.cardElement,
        billing_details: {
          name: `${this.checkoutData.shipping?.firstName || ''} ${this.checkoutData.shipping?.lastName || ''}`,
          email: this.checkoutData.shipping?.email || '',
          address: {
            line1: this.checkoutData.shipping?.address || '',
            city: this.checkoutData.shipping?.city || '',
            postal_code: this.checkoutData.shipping?.zipCode || '',
            country: this.checkoutData.shipping?.country || 'IL'
          }
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      // Send to backend to create payment intent
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(this.calculateTotal() * 100), // Convert to cents
          currency: 'ils',
          paymentMethodId: paymentMethod.id,
          cart: this.checkoutData.cart,
          shipping: this.checkoutData.shipping
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur de paiement');
      }

      const { clientSecret } = await response.json();

      // Confirm payment client-side (automatic confirmation_method)
      const { error: confirmError, paymentIntent } = await this.stripe.confirmCardPayment(clientSecret, {
        payment_method: paymentMethod.id
      });

      if (confirmError) {
        throw new Error(confirmError.message);
      }

      if (paymentIntent.status === 'succeeded') {
        // Payment succeeded!
        this.handlePaymentSuccess(paymentIntent);
      }

    } catch (error) {
      console.error('Stripe payment error:', error);
      errorElement.textContent = error.message || 'Une erreur est survenue lors du paiement';
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-lock"></i> Payer ' + this.calculateTotal() + '₪';
    }
  }

  initializePayPal() {
    const container = document.getElementById('paypal-button-container');
    if (!container) return;

    // Clear existing buttons
    container.innerHTML = '';

    if (typeof paypal === 'undefined') {
      container.innerHTML = '<p style="color: #dc3545;">PayPal n\'est pas chargé. Veuillez rafraîchir la page.</p>';
      return;
    }

    const totalAmount = this.calculateTotal().toFixed(2);

    paypal.Buttons({
      createOrder: async (data, actions) => {
        try {
          const response = await fetch('/api/paypal/create-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: Math.round(this.calculateTotal() * 100),
              currency: 'ILS',
              cart: this.checkoutData.cart,
              shipping: this.checkoutData.shipping
            }),
          });
          
          const orderData = await response.json();
          if (orderData.id) {
            return orderData.id;
          } else {
            const errorDetail = orderData?.details?.[0];
            const errorMessage = errorDetail ? `${errorDetail.issue} ${errorDetail.description} (${orderData.debug_id})` : 'Impossible de créer la commande PayPal';
            throw new Error(errorMessage);
          }
        } catch (error) {
          console.error('PayPal create order error:', error);
          alert('Erreur lors de la création de la commande PayPal: ' + error.message);
        }
      },
      onApprove: async (data, actions) => {
        try {
          const response = await fetch('/api/paypal/capture-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              orderID: data.orderID
            }),
          });
          
          const captureData = await response.json();
          
          if (captureData.status === 'COMPLETED') {
            this.handlePaymentSuccess(captureData);
          } else {
            alert('Le paiement n\'a pas pu être complété (Statut: ' + captureData.status + ')');
          }
        } catch (error) {
          console.error('PayPal capture error:', error);
          alert('Erreur lors de la capture du paiement PayPal');
        }
      },
      onError: (err) => {
        console.error('PayPal error:', err);
        alert('Une erreur est survenue avec PayPal');
      },
      style: {
        layout: 'vertical',
        color: 'gold',
        shape: 'rect',
        label: 'pay'
      }
    }).render('#paypal-button-container');
  }

  handlePaymentSuccess(paymentData) {
    console.log('Payment successful:', paymentData);
    
    // Clear cart
    if (window.breslevCart) {
      window.breslevCart.clearCart();
    }

    // Move to confirmation step
    this.currentStep = CHECKOUT_STEPS.CONFIRMATION;
    this.checkoutData.payment = paymentData;
    this.renderCheckout();
  }

  renderConfirmationStep() {
    return `
      <div class="confirmation-step" style="text-align: center; padding: 3rem;">
        <div style="background: #d4f8d4; border-radius: 50%; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem;">
          <i class="fas fa-check" style="font-size: 3rem; color: #28a745;"></i>
        </div>
        <h2 style="color: #28a745; margin-bottom: 1rem;">Commande confirmée !</h2>
        <p style="font-size: 1.2rem; margin-bottom: 2rem;">Merci pour votre achat. Votre commande a été enregistrée avec succès.</p>
        <div style="background: #f8f9fa; padding: 2rem; border-radius: 8px; margin-bottom: 2rem;">
          <p><strong>Montant total :</strong> ${this.calculateTotal()} ₪</p>
          <p><strong>Livraison à :</strong> ${this.checkoutData.shipping?.address}, ${this.checkoutData.shipping?.city}</p>
        </div>
        <a href="/collections/all" class="btn btn-primary">Continuer vos achats</a>
      </div>
    `;
  }
}

// Initialize on page load - wait for cart to be ready
let checkoutManager;

function initCheckout() {
  // Wait for breslevCart to be available
  if (!window.breslevCart) {
    // If cart-system.js hasn't loaded yet, wait a bit
    setTimeout(initCheckout, 100);
    return;
  }

  checkoutManager = new CheckoutManager();
  window.checkoutManager = checkoutManager;
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCheckout);
} else {
  // DOM already loaded
  initCheckout();
}
