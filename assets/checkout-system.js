/**
 * PAGE DE CHECKOUT — PayPal + Virement bancaire
 */

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
      this.checkoutData.detectedCountry = 'IL';
    }
  }

  renderCheckout() {
    const container = document.getElementById('checkout-container');
    if (!container) return;

    container.innerHTML = `
      <div class="checkout-wrapper">
        <div class="checkout-progress">
          ${this.renderProgressBar()}
        </div>
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

    if (this.currentStep === CHECKOUT_STEPS.PAYMENT) {
      setTimeout(() => this.initializePayPal(), 100);
    }
  }

  renderProgressBar() {
    const steps = [
      { num: 1, label: 'Panier' },
      { num: 2, label: 'Livraison' },
      { num: 3, label: 'Paiement' },
      { num: 4, label: 'Confirmation' }
    ];
    return `
      <div class="progress-steps">
        ${steps.map(s => `
          <div class="progress-step ${this.currentStep >= s.num ? 'active' : ''} ${this.currentStep > s.num ? 'completed' : ''}">
            <div class="step-circle">${this.currentStep > s.num ? '✓' : s.num}</div>
            <span class="step-label">${s.label}</span>
          </div>
        `).join('<div class="step-connector"></div>')}
      </div>
    `;
  }

  renderCurrentStep() {
    switch (this.currentStep) {
      case CHECKOUT_STEPS.CART:     return this.renderCartStep();
      case CHECKOUT_STEPS.SHIPPING: return this.renderShippingStep();
      case CHECKOUT_STEPS.PAYMENT:  return this.renderPaymentStep();
      case CHECKOUT_STEPS.CONFIRMATION: return this.renderConfirmationStep();
      default: return this.renderCartStep();
    }
  }

  renderCartStep() {
    const { items = [], total_price = 0 } = this.checkoutData.cart || {};
    const formatMoney = window.breslevCart?.formatMoney?.bind(window.breslevCart) || ((cents) =>
      new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
    );

    if (items.length === 0) {
      return `
        <div class="cart-step">
          <h2>Votre panier</h2>
          <div style="text-align:center; padding:3rem; color:#666;">
            <i class="fas fa-shopping-cart" style="font-size:3rem; margin-bottom:1rem; color:#d4af37;"></i>
            <p>Votre panier est vide</p>
            <a href="/collections/all" class="btn btn-primary">Découvrir nos livres</a>
          </div>
        </div>
      `;
    }

    return `
      <div class="cart-step">
        <h2>Votre panier</h2>
        <div class="cart-items">
          ${items.map(item => `
            <div class="cart-item">
              <div class="item-info">
                <h4>${item.title || item.product_title || 'Produit'}</h4>
                <p style="color:#888; font-size:0.9rem;">${item.variant_title || ''}</p>
              </div>
              <div class="item-qty">
                <button class="qty-btn" data-item-id="${item.id}" data-action="decrease">−</button>
                <input class="qty-input" type="number" value="${item.quantity || 1}" min="1" data-item-id="${item.id}">
                <button class="qty-btn" data-item-id="${item.id}" data-action="increase">+</button>
              </div>
              <div class="item-price">${formatMoney((item.price || 0) * (item.quantity || 1))}</div>
              <button class="btn-remove" data-item-id="${item.id}"><i class="fas fa-times"></i></button>
            </div>
          `).join('')}
        </div>
        <div class="cart-total">
          <span>Total :</span>
          <strong>${formatMoney(total_price)}</strong>
        </div>
        <div class="form-actions" style="justify-content:flex-end;">
          <button class="btn btn-primary" onclick="checkoutManager.nextStep()">
            Continuer vers la livraison <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    `;
  }

  renderShippingStep() {
    const detectedCountry = this.checkoutData.detectedCountry || 'IL';
    const zone = getShippingZone(detectedCountry);

    return `
      <div class="shipping-step">
        <h2>Adresse de livraison</h2>
        <form id="shipping-form">
          <div class="form-row">
            <div class="form-group">
              <label>Prénom *</label>
              <input type="text" name="firstName" required placeholder="Prénom">
            </div>
            <div class="form-group">
              <label>Nom *</label>
              <input type="text" name="lastName" required placeholder="Nom">
            </div>
          </div>
          <div class="form-group">
            <label>Email *</label>
            <input type="email" name="email" required placeholder="email@exemple.com">
          </div>
          <div class="form-group">
            <label>Adresse *</label>
            <input type="text" name="address" required placeholder="Adresse complète">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Ville *</label>
              <input type="text" name="city" required placeholder="Ville">
            </div>
            <div class="form-group">
              <label>Code postal</label>
              <input type="text" name="zipCode" placeholder="Code postal">
            </div>
          </div>
          <div class="form-group">
            <label>Pays *</label>
            <select name="country" required onchange="checkoutManager.updateShippingRates(this.value)">
              <option value="IL" ${detectedCountry === 'IL' ? 'selected' : ''}>🇮🇱 Israël</option>
              <option value="FR" ${detectedCountry === 'FR' ? 'selected' : ''}>🇫🇷 France</option>
              <option value="BE" ${detectedCountry === 'BE' ? 'selected' : ''}>🇧🇪 Belgique</option>
              <option value="CH">🇨🇭 Suisse</option>
              <option value="CA">🇨🇦 Canada</option>
              <option value="US">🇺🇸 États-Unis</option>
              <option value="OTHER">🌍 Autre pays</option>
            </select>
          </div>

          <h3 style="margin-top:1.5rem;">Mode de livraison</h3>
          <div id="shipping-options">
            ${this.renderShippingOptions(zone)}
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-outline" onclick="checkoutManager.previousStep()">
              <i class="fas fa-arrow-left"></i> Retour
            </button>
            <button type="submit" class="btn btn-primary">
              Continuer vers le paiement <i class="fas fa-arrow-right"></i>
            </button>
          </div>
        </form>
      </div>
    `;
  }

  renderShippingOptions(zone) {
    if (!zone || !zone.methods) return '<p>Livraison calculée selon votre adresse.</p>';
    return zone.methods.map((method, i) => `
      <label class="shipping-option">
        <input type="radio" name="shippingMethod" value="${method.id || i}"
          data-price="${method.price || 0}"
          ${i === 0 ? 'checked' : ''}>
        <span class="shipping-method-name">${method.name || 'Standard'}</span>
        <span class="shipping-method-price">${method.price ? method.price + ' €' : 'Gratuit'}</span>
      </label>
    `).join('');
  }

  renderPaymentStep() {
    return `
      <div class="payment-step">
        <h2>Paiement sécurisé</h2>

        <div class="payment-methods">
          <div class="payment-method-tabs">
            <button class="payment-tab active" data-method="paypal">
              <i class="fab fa-paypal"></i> PayPal
            </button>
            <button class="payment-tab" data-method="virement">
              <i class="fas fa-university"></i> Virement bancaire
            </button>
          </div>

          <div class="payment-method-content">
            <!-- PayPal -->
            <div id="paypal-payment" class="payment-form active">
              <div class="trust-badges">
                <img src="https://img.shields.io/badge/Secured%20by-PayPal-blue" alt="PayPal">
                <img src="https://img.shields.io/badge/SSL-Encrypted-green" alt="SSL">
              </div>
              <div id="paypal-button-container" style="min-height:50px;"></div>
            </div>

            <!-- Virement bancaire / Chèque -->
            <div id="virement-payment" class="payment-form">
              <!-- Sous-onglets : Virement EUR | Chèque Israël -->
              <div style="display:flex; gap:0.5rem; margin-bottom:1.2rem;">
                <button id="tab-virement-eur" onclick="checkoutManager.switchVirementTab('eur')" style="flex:1; padding:0.6rem 1rem; border:2px solid #d4af37; border-radius:8px; background:#d4af37; color:#0a0e27; font-weight:700; cursor:pointer; font-size:0.9rem;">
                  <i class="fas fa-euro-sign"></i> Virement en Euros
                </button>
                <button id="tab-virement-il" onclick="checkoutManager.switchVirementTab('il')" style="flex:1; padding:0.6rem 1rem; border:2px solid #d4af37; border-radius:8px; background:#fff; color:#0a0e27; font-weight:600; cursor:pointer; font-size:0.9rem;">
                  <i class="fas fa-shekel-sign"></i> Chèque / Virement Israël
                </button>
              </div>

              <!-- EUR -->
              <div id="virement-eur-content">
                <div style="background:#f8f9fa; border-radius:8px; padding:1.5rem; margin-bottom:1rem;">
                  <h4 style="color:#d4af37; margin-bottom:1rem;"><i class="fas fa-university"></i> Coordonnées bancaires — France</h4>
                  <table style="width:100%; border-collapse:collapse;">
                    <tr><td style="padding:0.4rem 0; color:#666; width:45%;">Titulaire</td><td style="font-weight:600;">Mme Joelle Ifrah</td></tr>
                    <tr><td style="padding:0.4rem 0; color:#666;">IBAN</td><td style="font-family:monospace; font-weight:600; font-size:0.9rem;">FR76 1652 8001 7100 0004 3621 064</td></tr>
                    <tr><td style="padding:0.4rem 0; color:#666;">BIC/SWIFT</td><td style="font-weight:600;">SMOEFRP1</td></tr>
                    <tr><td style="padding:0.4rem 0; color:#666;">Banque</td><td>France Pay — 10 Rue de Penthièvre, 75008 Paris</td></tr>
                    <tr><td style="padding:0.4rem 0; color:#666;">Référence</td><td style="font-weight:600;">Breslev-${Date.now().toString().slice(-6)}</td></tr>
                  </table>
                  <div style="margin-top:1rem; padding:0.75rem; background:#fff3cd; border-radius:6px; font-size:0.9rem; color:#856404;">
                    <i class="fas fa-info-circle"></i> Après votre virement, envoyez votre preuve à <strong>info@hayil.fr</strong>. Expédition sous 2-3 jours ouvrés.
                  </div>
                </div>
              </div>

              <!-- Chèque / Israël -->
              <div id="virement-il-content" style="display:none;">
                <div style="background:#f8f9fa; border-radius:8px; padding:1.5rem; margin-bottom:1rem;">
                  <h4 style="color:#d4af37; margin-bottom:1rem;"><i class="fas fa-university"></i> Chèque ou Virement — Israël</h4>
                  <table style="width:100%; border-collapse:collapse;">
                    <tr><td style="padding:0.4rem 0; color:#666; width:45%;">Titulaire</td><td style="font-weight:600;">Joelle Ifrah / ג'ואל יפרח</td></tr>
                    <tr><td style="padding:0.4rem 0; color:#666;">Banque</td><td style="font-weight:600;">הבנק הבינלאומי לישראל (Beinleumi)</td></tr>
                    <tr><td style="padding:0.4rem 0; color:#666;">Numéro banque</td><td style="font-weight:600;">031</td></tr>
                    <tr><td style="padding:0.4rem 0; color:#666;">Succursale (Snif)</td><td style="font-weight:600;">012</td></tr>
                    <tr><td style="padding:0.4rem 0; color:#666;">Numéro de compte</td><td style="font-family:monospace; font-weight:600;">904597</td></tr>
                  </table>
                  <div style="margin-top:1rem; padding:0.75rem; background:#fff3cd; border-radius:6px; font-size:0.9rem; color:#856404;">
                    <i class="fas fa-info-circle"></i> Chèque à l'ordre de <strong>Joelle Ifrah</strong>. Envoyez votre preuve à <strong>info@hayil.fr</strong>. Expédition sous 2-3 jours ouvrés.
                  </div>
                </div>
              </div>

              <button class="btn btn-primary btn-pay" onclick="checkoutManager.handleVirementConfirmation()">
                <i class="fas fa-check"></i> Confirmer ma commande
              </button>
            </div>
          </div>
        </div>

        <div class="security-info">
          <i class="fas fa-shield-alt"></i>
          <p>Vos informations sont sécurisées. Livraison depuis Jérusalem sous 7-14 jours.</p>
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
    const shippingCents = (shipping.price || 0) * 100;
    const finalTotal = total_price + shippingCents;

    const formatMoney = window.breslevCart?.formatMoney?.bind(window.breslevCart) || ((cents) =>
      new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
    );

    return `
      <div class="order-summary">
        <h3>Récapitulatif</h3>
        ${items.length > 0 ? `
          <div class="summary-items">
            ${items.map(item => `
              <div class="summary-item">
                <span style="color:#333; font-weight:500;">${item.title || item.product_title || 'Produit'} × ${item.quantity || 1}</span>
                <span style="color:#d4af37; font-weight:bold;">${formatMoney(item.price * item.quantity)}</span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="summary-items" style="padding:2rem; text-align:center; color:#666;">
            <p>Votre panier est vide</p>
          </div>
        `}
        <div class="summary-totals">
          <div class="summary-row">
            <span style="color:#333;">Sous-total</span>
            <span style="color:#333; font-weight:600;">${formatMoney(total_price)}</span>
          </div>
          <div class="summary-row">
            <span style="color:#333;">Livraison</span>
            <span style="color:#666;">${shipping.price > 0 ? shipping.price + ' €' : 'Calculé à l\'étape suivante'}</span>
          </div>
          <div class="summary-row summary-total">
            <span>Total</span>
            <span>${formatMoney(finalTotal)}</span>
          </div>
        </div>
        <div class="trust-indicators">
          <div class="trust-item"><i class="fas fa-lock"></i><span>Paiement sécurisé</span></div>
          <div class="trust-item"><i class="fas fa-shipping-fast"></i><span>Livraison depuis Jérusalem</span></div>
          <div class="trust-item"><i class="fas fa-undo"></i><span>Retours acceptés</span></div>
        </div>
      </div>
    `;
  }

  calculateTotal() {
    const { total_price = 0 } = this.checkoutData.cart || {};
    const shipping = this.checkoutData.shipping || { price: 0 };
    const shippingPrice = typeof shipping.price === 'number' ? shipping.price : 0;
    const totalInUnits = (total_price / 100) + shippingPrice;
    const result = Math.round(totalInUnits * 100) / 100;
    return isNaN(result) ? 0 : result;
  }

  initializePayPal() {
    const container = document.getElementById('paypal-button-container');
    if (!container) return;
    container.innerHTML = '';

    if (typeof paypal === 'undefined') {
      container.innerHTML = '<p style="color:#dc3545;">PayPal n\'est pas chargé. Veuillez rafraîchir la page.</p>';
      return;
    }

    paypal.Buttons({
      createOrder: async (data, actions) => {
        try {
          const response = await fetch('/api/paypal/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: Math.round(this.calculateTotal() * 100),
              currency: 'EUR',
              cart: this.checkoutData.cart,
              shipping: this.checkoutData.shipping
            }),
          });
          const orderData = await response.json();
          if (orderData.id) return orderData.id;
          const errorDetail = orderData?.details?.[0];
          throw new Error(errorDetail ? `${errorDetail.issue} ${errorDetail.description}` : 'Impossible de créer la commande PayPal');
        } catch (error) {
          console.error('PayPal create order error:', error);
          alert('Erreur PayPal: ' + error.message);
        }
      },
      onApprove: async (data, actions) => {
        try {
          const response = await fetch('/api/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderID: data.orderID }),
          });
          const captureData = await response.json();
          if (captureData.status === 'COMPLETED') {
            this.handlePaymentSuccess(captureData);
          } else {
            alert('Paiement non complété (Statut: ' + captureData.status + ')');
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
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' }
    }).render('#paypal-button-container');
  }

  switchVirementTab(tab) {
    const eurContent = document.getElementById('virement-eur-content');
    const ilContent = document.getElementById('virement-il-content');
    const eurBtn = document.getElementById('tab-virement-eur');
    const ilBtn = document.getElementById('tab-virement-il');
    if (!eurContent || !ilContent) return;
    if (tab === 'eur') {
      eurContent.style.display = 'block';
      ilContent.style.display = 'none';
      eurBtn.style.background = '#d4af37'; eurBtn.style.color = '#0a0e27'; eurBtn.style.fontWeight = '700';
      ilBtn.style.background = '#fff'; ilBtn.style.color = '#0a0e27'; ilBtn.style.fontWeight = '600';
    } else {
      eurContent.style.display = 'none';
      ilContent.style.display = 'block';
      ilBtn.style.background = '#d4af37'; ilBtn.style.color = '#0a0e27'; ilBtn.style.fontWeight = '700';
      eurBtn.style.background = '#fff'; eurBtn.style.color = '#0a0e27'; eurBtn.style.fontWeight = '600';
    }
  }

  handleVirementConfirmation() {
    const shipping = this.checkoutData.shipping || {};
    this.handlePaymentSuccess({
      method: 'virement',
      status: 'PENDING',
      reference: 'Breslev-' + Date.now().toString().slice(-6),
      customer: `${shipping.firstName || ''} ${shipping.lastName || ''}`.trim()
    });
  }

  handlePaymentSuccess(paymentData) {
    if (window.breslevCart) window.breslevCart.clearCart();
    this.currentStep = CHECKOUT_STEPS.CONFIRMATION;
    this.checkoutData.payment = paymentData;
    this.renderCheckout();
  }

  renderConfirmationStep() {
    const isVirement = this.checkoutData.payment?.method === 'virement';
    return `
      <div class="confirmation-step" style="text-align:center; padding:3rem;">
        <div style="background:#d4f8d4; border-radius:50%; width:100px; height:100px; display:flex; align-items:center; justify-content:center; margin:0 auto 2rem;">
          <i class="fas fa-check" style="font-size:3rem; color:#28a745;"></i>
        </div>
        <h2 style="color:#28a745; margin-bottom:1rem;">Commande confirmée !</h2>
        <p style="font-size:1.2rem; margin-bottom:2rem;">Merci pour votre achat. Votre commande a été enregistrée avec succès.</p>
        ${isVirement ? `
          <div style="background:#fff3cd; padding:1.5rem; border-radius:8px; margin-bottom:2rem; text-align:left;">
            <h4><i class="fas fa-university"></i> En attente de votre virement</h4>
            <p>Référence : <strong>${this.checkoutData.payment?.reference || ''}</strong></p>
            <p>Envoyez votre preuve de paiement à <strong>info@hayil.fr</strong></p>
            <p>Votre commande sera expédiée dès réception du virement (2-3 jours ouvrés).</p>
          </div>
        ` : `
          <div style="background:#f8f9fa; padding:2rem; border-radius:8px; margin-bottom:2rem;">
            <p><strong>Montant total :</strong> ${this.calculateTotal()} €</p>
            <p><strong>Livraison à :</strong> ${this.checkoutData.shipping?.address || ''}, ${this.checkoutData.shipping?.city || ''}</p>
          </div>
        `}
        <a href="/collections/all" class="btn btn-primary">Continuer vos achats</a>
      </div>
    `;
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

    document.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.target.closest('.btn-remove').dataset.itemId;
        window.breslevCart.removeItem(itemId);
        this.loadCart();
        this.renderCheckout();
      });
    });

    const shippingForm = document.getElementById('shipping-form');
    if (shippingForm) {
      shippingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const shippingData = Object.fromEntries(formData);
        const selectedRadio = document.querySelector('input[name="shippingMethod"]:checked');
        if (selectedRadio) shippingData.price = parseFloat(selectedRadio.dataset.price || 0);
        this.checkoutData.shipping = shippingData;
        this.nextStep();
      });
    }

    const shippingOptionsContainer = document.getElementById('shipping-options');
    if (shippingOptionsContainer) {
      shippingOptionsContainer.addEventListener('change', (e) => {
        if (e.target.name === 'shippingMethod') {
          if (!this.checkoutData.shipping) this.checkoutData.shipping = {};
          this.checkoutData.shipping.price = parseFloat(e.target.dataset.price || 0);
          this.updateOrderSummaryUI();
        }
      });
    }

    document.querySelectorAll('.payment-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const method = e.currentTarget.dataset.method;
        document.querySelectorAll('.payment-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.querySelectorAll('.payment-form').forEach(f => f.classList.remove('active'));
        const targetForm = document.getElementById(`${method}-payment`);
        if (targetForm) {
          targetForm.classList.add('active');
          if (method === 'paypal' && typeof paypal !== 'undefined') {
            this.initializePayPal();
          }
        }
      });
    });
  }

  updateShippingRates(countryCode) {
    const zone = getShippingZone(countryCode);
    const optionsContainer = document.getElementById('shipping-options');
    if (optionsContainer) optionsContainer.innerHTML = this.renderShippingOptions(zone);
  }

  updateOrderSummaryUI() {
    const summaryContainer = document.querySelector('.order-summary');
    if (summaryContainer) summaryContainer.outerHTML = this.renderOrderSummary();
  }
}

let checkoutManager;

function initCheckout() {
  if (!window.breslevCart) {
    setTimeout(initCheckout, 100);
    return;
  }
  checkoutManager = new CheckoutManager();
  window.checkoutManager = checkoutManager;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCheckout);
} else {
  initCheckout();
}
